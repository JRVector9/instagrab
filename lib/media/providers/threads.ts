import axios from 'axios';
import * as cheerio from 'cheerio';
import { MediaResponse } from '../types';
import { fetchWithFallback } from '@/lib/httpClient';

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
];

function randomUA() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function cleanUrl(url: string): string {
  return url
    .replace(/\\u0026/g, '&')
    .replace(/\\u002F/g, '/')
    .replace(/\\\//g, '/')
    .replace(/\\/g, '')
    .replace(/&amp;/g, '&');
}

interface ExtractedMedia { videoUrl: string | null; imageUrl: string | null; videoVersions: string[] }

function extractFromEmbeddedData(html: string): ExtractedMedia {
  let videoUrl: string | null = null;
  let imageUrl: string | null = null;
  const videoVersions: string[] = [];

  try {
    const videoVersionsRegex = /"video_versions"\s*:\s*\[([^\]]+)\]/g;
    let match;
    while ((match = videoVersionsRegex.exec(html)) !== null) {
      try {
        const versions = JSON.parse('[' + match[1] + ']');
        for (const v of versions) {
          if (v.url) {
            const u = cleanUrl(v.url);
            videoVersions.push(u);
            if (!videoUrl) videoUrl = u;
          }
        }
      } catch {
        const urlMatches = match[1].match(/"url"\s*:\s*"([^"]+)"/g);
        if (urlMatches) {
          for (const um of urlMatches) {
            const extract = um.match(/"url"\s*:\s*"([^"]+)"/);
            if (extract) { const u = cleanUrl(extract[1]); videoVersions.push(u); if (!videoUrl) videoUrl = u; }
          }
        }
      }
    }

    for (const pattern of [
      /"video_url"\s*:\s*"([^"]+)"/, /"playable_url"\s*:\s*"([^"]+)"/,
      /"playable_url_quality_hd"\s*:\s*"([^"]+)"/, /"playback_url"\s*:\s*"([^"]+)"/,
      /"stream_url"\s*:\s*"([^"]+)"/, /"src"\s*:\s*"(https?:[^"]*\.mp4[^"]*)"/,
    ]) {
      const m = html.match(pattern);
      if (m?.[1]) {
        const u = cleanUrl(m[1]);
        if (!videoUrl) videoUrl = u;
        if (!videoVersions.includes(u)) videoVersions.push(u);
      }
    }

    if (!videoUrl) {
      const imgMatch = html.match(/"image_versions2"\s*:\s*\{[^}]*"candidates"\s*:\s*\[([^\]]+)\]/);
      if (imgMatch) {
        try {
          const candidates = JSON.parse('[' + imgMatch[1] + ']');
          if (candidates[0]?.url) imageUrl = cleanUrl(candidates[0].url);
        } catch {
          const um = imgMatch[1].match(/"url"\s*:\s*"([^"]+)"/);
          if (um) imageUrl = cleanUrl(um[1]);
        }
      }
    }
    if (!imageUrl) {
      const dm = html.match(/"display_url"\s*:\s*"([^"]+)"/);
      if (dm) imageUrl = cleanUrl(dm[1]);
    }
    if (!videoUrl) {
      const cdnMatch = html.match(/https?:\/\/(?:scontent|video)[^"'\s<>]*\.mp4[^"'\s<>]*/i);
      if (cdnMatch) videoUrl = cleanUrl(cdnMatch[0]);
    }
  } catch { /* ignore */ }

  return { videoUrl, imageUrl, videoVersions };
}

async function fetchWithRetry(url: string): Promise<any> {
  return fetchWithFallback((cfg) =>
    axios.get(url, {
      ...cfg,
      headers: {
        'User-Agent': randomUA(),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1', 'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document', 'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none', 'Sec-Fetch-User': '?1',
        'Cache-Control': 'max-age=0',
      },
      timeout: 20000, maxRedirects: 0,
    })
  );
}

export async function fetchThreads(url: string): Promise<MediaResponse> {
  const threadsRegex = /^https?:\/\/(www\.)?(threads\.net|threads\.com)\/((@[A-Za-z0-9._]+\/post\/[A-Za-z0-9_-]+)|t\/[A-Za-z0-9_-]+)/;
  if (!threadsRegex.test(url)) {
    return { error: 'Please provide a valid Threads post URL', status: 400 };
  }

  const cleanedUrl = url.split('?')[0];
  const urlsToTry = [
    cleanedUrl.replace('threads.com', 'threads.net'),
    cleanedUrl.replace('threads.net', 'threads.com'),
  ];

  let response = null;
  for (const tryUrl of urlsToTry) {
    try { response = await fetchWithRetry(tryUrl); if (response) break; } catch { /* try next */ }
  }

  if (!response) return { error: 'Failed to fetch Threads content. The post may be private or unavailable.', status: 500 };

  const html = response.data;
  const $ = cheerio.load(html);
  let mediaUrl: string | null = null;
  let type: 'video' | 'image' | null = null;

  const title = ($('meta[property="og:title"]').attr('content') || $('meta[name="twitter:title"]').attr('content') || $('title').text() || 'Threads Post').substring(0, 100);
  const description = ($('meta[property="og:description"]').attr('content') || $('meta[name="twitter:description"]').attr('content') || 'Threads').substring(0, 100);

  const embeddedData = extractFromEmbeddedData(html);
  if (embeddedData.videoUrl) { mediaUrl = embeddedData.videoUrl; type = 'video'; }

  if (!mediaUrl) {
    const videoMetaUrl = $('meta[property="og:video"]').attr('content') || $('meta[property="og:video:url"]').attr('content') || $('meta[property="og:video:secure_url"]').attr('content') || $('meta[name="twitter:player:stream"]').attr('content');
    if (videoMetaUrl) { mediaUrl = cleanUrl(videoMetaUrl); type = 'video'; }
  }

  const isVideoPost = $('meta[property="og:video:type"]').attr('content')?.includes('video') || $('meta[property="og:type"]').attr('content')?.includes('video');

  if (!mediaUrl) {
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const d = JSON.parse($(el).html() || '{}');
        if (d['@type'] === 'VideoObject' && d.contentUrl) { mediaUrl = cleanUrl(d.contentUrl); type = 'video'; }
        else if (d.video?.contentUrl) { mediaUrl = cleanUrl(d.video.contentUrl); type = 'video'; }
      } catch { /* skip */ }
    });
  }

  if (!mediaUrl || isVideoPost) {
    for (const script of $('script').toArray()) {
      const content = $(script).html() || '';
      if (content.length < 100) continue;
      for (const pattern of [
        /"video_versions"\s*:\s*\[([^\]]+)\]/, /"video_url"\s*:\s*"([^"]+)"/,
        /"playable_url"\s*:\s*"([^"]+)"/, /"playable_url_quality_hd"\s*:\s*"([^"]+)"/,
        /"playback_url"\s*:\s*"([^"]+)"/,
      ]) {
        const m = content.match(pattern);
        if (m) {
          if (pattern.source.includes('video_versions')) {
            try {
              const versions = JSON.parse('[' + m[1] + ']');
              if (versions[0]?.url) { mediaUrl = cleanUrl(versions[0].url); type = 'video'; break; }
            } catch {
              const um = m[1].match(/"url"\s*:\s*"([^"]+)"/);
              if (um) { mediaUrl = cleanUrl(um[1]); type = 'video'; break; }
            }
          } else if (m[1]) { mediaUrl = cleanUrl(m[1]); type = 'video'; break; }
        }
      }
      if (mediaUrl && type === 'video') break;
    }
  }

  if (!mediaUrl && !isVideoPost) {
    const imgUrl = $('meta[property="og:image"]').attr('content') || $('meta[property="og:image:url"]').attr('content') || $('meta[name="twitter:image"]').attr('content');
    if (imgUrl) {
      if (imgUrl.toLowerCase().includes('.mp4') || imgUrl.toLowerCase().includes('video')) {
        mediaUrl = cleanUrl(imgUrl); type = 'video';
      } else {
        mediaUrl = embeddedData.imageUrl || cleanUrl(imgUrl); type = 'image';
      }
    }
  }

  if (!mediaUrl) {
    const videoEl = $('video').first();
    if (videoEl.length) {
      const src = videoEl.attr('src') || videoEl.find('source').first().attr('src') || videoEl.attr('data-src');
      if (src) { mediaUrl = cleanUrl(src); type = 'video'; }
    }
  }

  if (!mediaUrl) {
    for (const sel of ['img[src*="cdninstagram"]', 'img[src*="scontent"]', 'img[src*="fbcdn"]']) {
      const src = $(sel).first().attr('src');
      if (src) { mediaUrl = cleanUrl(src); type = 'image'; break; }
    }
  }

  if (!mediaUrl && embeddedData.imageUrl) { mediaUrl = embeddedData.imageUrl; type = 'image'; }

  if (!mediaUrl || !type) return { error: 'Could not extract media from this Threads post. The post may be private, deleted, or contain only text.', status: 404 };

  if (mediaUrl.startsWith('//')) mediaUrl = 'https:' + mediaUrl;
  if (type === 'video' && embeddedData.videoVersions.length > 1) mediaUrl = embeddedData.videoVersions[0];

  // 반환 URL이 허용된 Meta CDN 도메인인지 검증
  const isAllowedThreadsUrl = (u: string) => {
    try {
      const { hostname: h, protocol } = new URL(u);
      if (protocol !== 'https:') return false;
      const lh = h.toLowerCase();
      return lh.endsWith('.cdninstagram.com') || lh === 'cdninstagram.com' ||
             lh.endsWith('.fbcdn.net') || lh === 'fbcdn.net';
    } catch { return false; }
  };
  if (!isAllowedThreadsUrl(mediaUrl)) {
    return { error: 'Could not extract media from this Threads post. The post may be private, deleted, or contain only text.', status: 404 };
  }

  return {
    type,
    mediaUrl,
    title,
    description,
    ...(embeddedData.videoVersions.length > 1 && {
      qualities: embeddedData.videoVersions.map((u, i) => ({ quality: i === 0 ? 'HD' : `Option ${i + 1}`, url: u })),
    }),
  };
}
