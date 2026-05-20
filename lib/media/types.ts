export interface MediaResult {
  type: 'video' | 'image';
  mediaUrl: string;
  title: string;
  description: string;
  thumbnail?: string;
  qualities?: { quality: string; url: string }[];
  originalUrl?: string;
}

export interface MediaError {
  error: string;
  status: number;
}

export type MediaResponse = MediaResult | MediaError;

export function isMediaError(r: MediaResponse): r is MediaError {
  return 'error' in r;
}
