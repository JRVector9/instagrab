import axios from 'axios';
import { MediaResponse } from '../types';

export async function fetchLinkedin(url: string): Promise<MediaResponse> {
  const linkedinRegex = /^https?:\/\/(www\.)?linkedin\.com\//;
  if (!linkedinRegex.test(url)) {
    return { error: 'Please provide a valid LinkedIn post URL', status: 400 };
  }

  const response = await axios.post(
    'https://saywhat.ai/api/fetch-linkedin-page/',
    { url },
    {
      headers: {
        accept: '*/*',
        'content-type': 'application/json',
        Referer: 'https://saywhat.ai/tools/linkedin-video-downloader/',
      },
      timeout: 15000,
    }
  );

  const data = response.data;
  if (!data?.videos?.length) {
    return { error: 'No video found in this LinkedIn post', status: 404 };
  }

  const videoUrl = data.videos[0];
  return {
    type: 'video',
    mediaUrl: `/api/download?url=${encodeURIComponent(videoUrl)}&type=video&preview=true`,
    title: data.title || 'LinkedIn Video',
    description: data.author || '',
    originalUrl: videoUrl,
  };
}
