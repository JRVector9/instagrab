export type Platform = 'instagram' | 'twitter' | 'threads' | 'linkedin' | 'snapchat';

export function detectPlatform(url: string): Platform | null {
  const u = url.toLowerCase().trim();
  if (u.includes('instagram.com') || u.includes('instagr.am')) return 'instagram';
  if (u.includes('twitter.com') || u.includes('x.com')) return 'twitter';
  if (u.includes('threads.net') || u.includes('threads.com')) return 'threads';
  if (u.includes('linkedin.com')) return 'linkedin';
  if (u.includes('snapchat.com')) return 'snapchat';
  return null;
}
