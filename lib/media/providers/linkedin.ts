import axios from 'axios';
import { MediaResponse } from '../types';
import { fetchWithFallback } from '@/lib/httpClient';

export async function fetchLinkedin(url: string): Promise<MediaResponse> {
  const linkedinRegex = /^https?:\/\/(www\.)?linkedin\.com\//;
  if (!linkedinRegex.test(url)) {
    return { error: 'Please provide a valid LinkedIn post URL', status: 400 };
  }

  let data: { videos?: string[]; title?: string; author?: string };
  try {
    const response = await fetchWithFallback((cfg) =>
      axios.post(
        'https://saywhat.ai/api/fetch-linkedin-page/',
        { url },
        {
          ...cfg,
          headers: {
            accept: '*/*',
            'content-type': 'application/json',
            Referer: 'https://saywhat.ai/tools/linkedin-video-downloader/',
          },
          timeout: 15000,
        }
      )
    );
    data = response.data;
  } catch {
    return { error: 'Failed to fetch LinkedIn video. Please try again.', status: 502 };
  }

  if (!data?.videos?.length) {
    return { error: 'No video found in this LinkedIn post', status: 404 };
  }

  const videoUrl = data.videos[0];
  let videoHost: string;
  try { videoHost = new URL(videoUrl).hostname.toLowerCase(); } catch { videoHost = ''; }
  if (!videoHost.endsWith('.licdn.com') && videoHost !== 'licdn.com') {
    return { error: 'No video found in this LinkedIn post', status: 404 };
  }
  return {
    type: 'video',
    mediaUrl: `/api/download?url=${encodeURIComponent(videoUrl)}&type=video&preview=true`,
    title: data.title || 'LinkedIn Video',
    description: data.author || '',
    originalUrl: videoUrl,
  };
}
