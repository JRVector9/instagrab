import axios from 'axios';
import * as cheerio from 'cheerio';
import { MediaResponse } from '../types';
import { fetchWithFallback } from '@/lib/httpClient';

function isAllowedInstagramUrl(url: string): boolean {
  try {
    const { hostname: h, protocol } = new URL(url);
    if (protocol !== 'https:') return false;
    const lh = h.toLowerCase();
    return lh.endsWith('.cdninstagram.com') || lh === 'cdninstagram.com' ||
           lh.endsWith('.fbcdn.net') || lh === 'fbcdn.net';
  } catch { return false; }
}

export async function fetchInstagram(url: string): Promise<MediaResponse> {
  const instagramRegex = /^https?:\/\/(www\.)?instagram\.com\/(p|reel|tv|stories)\/[A-Za-z0-9_-]+\/?/;
  if (!instagramRegex.test(url)) {
    return { error: 'Please provide a valid Instagram post, reel, or story URL', status: 400 };
  }

  const isReel = url.includes('/reel/');
  const isStory = url.includes('/stories/');

  const igHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    'Accept-Encoding': 'gzip, deflate, br',
    'DNT': '1',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Cache-Control': 'max-age=0',
  };

  let response;
  try {
    response = await fetchWithFallback((cfg) =>
      axios.get(url, { ...cfg, headers: igHeaders, timeout: 15000 })
    );
  } catch (err) {
    const shortcode = url.match(/\/(p|reel|tv|stories)\/([A-Za-z0-9_-]+)/)?.[2];
    if (shortcode && !isStory) {
      response = await fetchWithFallback((cfg) =>
        axios.get(`https://www.instagram.com/p/${shortcode}/embed/captioned/`, {
          ...cfg,
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
          timeout: 15000,
        })
      );
    } else {
      throw err;
    }
  }

  const $ = cheerio.load(response.data);
  let mediaUrl: string | null = null;
  let type: 'video' | 'image' | null = null;

  const scriptTags = $('script').toArray();
  for (const script of scriptTags) {
    const scriptContent = $(script).html() || '';

    const videoUrls = Array.from(scriptContent.matchAll(/"video_url":"([^"]+)"/g)).map(m => m[1]);
    if (videoUrls.length > 0) {
      mediaUrl = videoUrls[0].replace(/\\u0026/g, '&').replace(/\\/g, '');
      type = 'video';
      break;
    }

    const videoUrlMatch = scriptContent.match(/"videoUrl":"([^"]+)"/);
    if (videoUrlMatch?.[1]) {
      mediaUrl = videoUrlMatch[1].replace(/\\u0026/g, '&').replace(/\\/g, '');
      type = 'video';
      break;
    }

    const videoVersionsMatch = scriptContent.match(/"video_versions":\[([^\]]+)\]/);
    if (videoVersionsMatch) {
      const urlMatch = videoVersionsMatch[1].match(/"url":"([^"]+)"/);
      if (urlMatch?.[1]) {
        mediaUrl = urlMatch[1].replace(/\\u0026/g, '&').replace(/\\/g, '');
        type = 'video';
        break;
      }
    }

    const mp4Match = scriptContent.match(/"(https?:\\\/\\\/[^"]*\.mp4[^"]*)"/);
    if (mp4Match?.[1]) {
      mediaUrl = mp4Match[1].replace(/\\u0026/g, '&').replace(/\\/g, '');
      type = 'video';
      break;
    }

    if (isStory) {
      const storyVideoMatch = scriptContent.match(/"video_resources":\[([^\]]+)\]/);
      if (storyVideoMatch) {
        const srcMatch = storyVideoMatch[1].match(/"src":"([^"]+)"/);
        if (srcMatch?.[1]) {
          mediaUrl = srcMatch[1].replace(/\\u0026/g, '&').replace(/\\/g, '');
          type = 'video';
          break;
        }
      }
      const storyImageMatch = scriptContent.match(/"display_resources":\[([^\]]+)\]/);
      if (storyImageMatch && !mediaUrl) {
        const srcMatch = storyImageMatch[1].match(/"src":"([^"]+)"/);
        if (srcMatch?.[1]) {
          mediaUrl = srcMatch[1].replace(/\\u0026/g, '&').replace(/\\/g, '');
          type = 'image';
        }
      }
    }
  }

  const ogVideo = $('meta[property="og:video"]').attr('content') ||
    $('meta[property="og:video:secure_url"]').attr('content') ||
    $('meta[property="og:video:url"]').attr('content');
  const ogImage = $('meta[property="og:image"]').attr('content');
  const ogTitle = $('meta[property="og:title"]').attr('content');
  const ogDescription = $('meta[property="og:description"]').attr('content');

  let jsonLdData: any = null;
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).html() || '');
      if (data.video || data.image) jsonLdData = data;
    } catch { /* skip */ }
  });

  if (!mediaUrl && ogVideo) { mediaUrl = ogVideo; type = 'video'; }
  if (!mediaUrl && jsonLdData?.video) {
    mediaUrl = jsonLdData.video.contentUrl || jsonLdData.video.url;
    type = 'video';
  }
  if (!mediaUrl) {
    if (ogImage) { mediaUrl = ogImage; type = 'image'; }
    else if (jsonLdData?.image) {
      mediaUrl = typeof jsonLdData.image === 'string' ? jsonLdData.image : jsonLdData.image.url;
      type = 'image';
    }
  }
  if (!mediaUrl) {
    for (const script of scriptTags) {
      const match = ($(script).html() || '').match(/"display_url":"([^"]+)"/);
      if (match?.[1]) {
        mediaUrl = match[1].replace(/\\u0026/g, '&').replace(/\\/g, '');
        type = 'image';
        break;
      }
    }
  }

  if (!mediaUrl || !type) {
    if (isStory) return { error: 'Could not extract story. It may have expired or requires authentication.', status: 404 };
    return { error: 'Could not extract media from this URL. It might be private or unavailable.', status: 404 };
  }
  if (isReel && type === 'image') {
    return { error: 'Could not extract video from this reel. It might be private or unsupported.', status: 404 };
  }
  if (!isAllowedInstagramUrl(mediaUrl)) {
    return { error: 'Could not extract media from this URL. It might be private or unavailable.', status: 404 };
  }

  return {
    type,
    mediaUrl,
    thumbnail: ogImage || undefined,
    title: ogTitle || 'Instagram Post',
    description: ogDescription || '',
  };
}
