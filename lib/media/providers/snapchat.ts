import axios from 'axios';
import { MediaResponse } from '../types';

export async function fetchSnapchat(url: string): Promise<MediaResponse> {
  const snapchatRegex = /^https?:\/\/(www\.)?(snapchat\.com|story\.snapchat\.com|t\.snapchat\.com)/;
  if (!snapchatRegex.test(url)) {
    return { error: 'Please provide a valid Snapchat URL', status: 400 };
  }

  const formData = `url=${encodeURIComponent(url)}&token=8b6e170975d92939bb67d8db567f82e43fa2da91e00a84f258af77c1186c5e8a&hash=aHR0cHM6Ly9zb3VuZGNsb3VkLmNvbS9zb21icnNvbmdzL3VuZHJlc3NlZA%3D%3D1043YWlvLWRs`;

  const response = await axios.post('https://urlmp4.com/wp-json/aio-dl/video-data/', formData, {
    headers: {
      accept: '*/*',
      'content-type': 'application/x-www-form-urlencoded',
      cookie: 'pll_language=en',
      Referer: 'https://urlmp4.com/en/snapchat-downloader/',
    },
    timeout: 15000,
  });

  const data = response.data;
  if (!data?.medias?.length) {
    return { error: 'No video found in this Snapchat URL', status: 404 };
  }

  const video = data.medias.find((m: any) => m.url && m.quality) || data.medias[0];
  if (!video?.url) return { error: 'No valid video URL found', status: 404 };

  return {
    type: 'video',
    mediaUrl: video.url,
    title: data.title || 'Snapchat Video',
    description: data.source || '',
  };
}
