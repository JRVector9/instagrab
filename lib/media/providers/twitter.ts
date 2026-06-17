import axios from 'axios';
import { MediaResponse } from '../types';
import { outboundConfig } from '@/lib/httpClient';

function isAllowedTwitterUrl(url: string): boolean {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return h.endsWith('.twimg.com') || h === 'twimg.com';
  } catch { return false; }
}

export async function fetchTwitter(url: string): Promise<MediaResponse> {
  const twitterRegex = /^https?:\/\/(www\.)?(twitter\.com|x\.com)\/[A-Za-z0-9_]+\/status\/\d+/;
  if (!twitterRegex.test(url)) {
    return { error: 'Please provide a valid Twitter/X post URL', status: 400 };
  }

  const tweetId = url.match(/status\/(\d+)/)?.[1];
  if (!tweetId) return { error: 'Could not extract tweet ID from URL', status: 400 };

  // Method 1: fxtwitter
  try {
    const fxResponse = await axios.get(`https://api.fxtwitter.com/status/${tweetId}`, {
      ...outboundConfig,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      timeout: 15000,
    });
    const tweetData = fxResponse.data?.tweet;
    if (tweetData) {
      if (tweetData.media?.videos?.length > 0) {
        const best = tweetData.media.videos.reduce((prev: any, cur: any) =>
          cur.width > prev.width ? cur : prev
        );
        if (isAllowedTwitterUrl(best.url)) {
          return {
            type: 'video',
            mediaUrl: best.url,
            title: tweetData.text || 'Twitter Video',
            description: tweetData.author?.name || '',
            thumbnail: tweetData.media.videos[0]?.thumbnail_url || undefined,
          };
        }
      }
      if (tweetData.media?.photos?.length > 0) {
        const photoUrl = tweetData.media.photos[0].url;
        if (isAllowedTwitterUrl(photoUrl)) {
          return {
            type: 'image',
            mediaUrl: photoUrl,
            title: tweetData.text || 'Twitter Image',
            description: tweetData.author?.name || '',
          };
        }
      }
      const gifMedia = tweetData.media?.all?.find((m: any) => m.type === 'gif' || m.type === 'video');
      if (gifMedia && isAllowedTwitterUrl(gifMedia.url)) {
        return {
          type: 'video',
          mediaUrl: gifMedia.url,
          title: tweetData.text || 'Twitter Media',
          description: tweetData.author?.name || '',
        };
      }
    }
  } catch { /* fall through */ }

  // Method 2: vxtwitter
  try {
    const vxUrl = url.replace(/https?:\/\/(www\.)?(twitter\.com|x\.com)/, 'https://api.vxtwitter.com');
    const vxResponse = await axios.get(vxUrl, {
      ...outboundConfig,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      timeout: 15000,
    });
    const vxData = vxResponse.data;
    if (vxData?.media_extended?.length > 0) {
      const media = vxData.media_extended[0];
      if (isAllowedTwitterUrl(media.url)) {
        return {
          type: media.type === 'image' ? 'image' : 'video',
          mediaUrl: media.url,
          title: vxData.text || 'Twitter Media',
          description: vxData.user_name || '',
        };
      }
    }
  } catch { /* fall through */ }

  return {
    error: 'Could not extract media from this tweet. It might be private, deleted, or contain no media.',
    status: 404,
  };
}
