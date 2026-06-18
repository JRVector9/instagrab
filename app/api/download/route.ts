import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import { promises as dns } from 'dns';
import { getOutboundConfig } from '@/lib/httpClient';

export const runtime = 'nodejs';

const SAFE_CONTENT_TYPES = new Set([
  'video/mp4', 'video/webm', 'video/ogg', 'video/quicktime',
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
]);

function isPrivateIP(ip: string): boolean {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some(isNaN)) return true;
  return (
    p[0] === 127 ||
    p[0] === 10 ||
    (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
    (p[0] === 192 && p[1] === 168) ||
    (p[0] === 169 && p[1] === 254) ||
    p[0] === 0
  );
}

export async function GET(request: NextRequest) {
  try {
    const url = request.nextUrl.searchParams.get('url');
    const type = request.nextUrl.searchParams.get('type');
    const preview = request.nextUrl.searchParams.get('preview');

    if (!url) {
      return NextResponse.json(
        { error: 'URL parameter is required' },
        { status: 400 }
      );
    }

    // SSRF 방어: HTTPS만 허용 + suffix 검증 (evil-fbcdn.net.evil.com 우회 차단)
    const ALLOWED_SUFFIXES = [
      'cdninstagram.com', 'fbcdn.net',
      'video.twimg.com', 'pbs.twimg.com',
      'licdn.com',
      'googlevideo.com',
    ];
    let parsedHost: string;
    let parsedProtocol: string;
    try {
      const parsed = new URL(url);
      parsedHost = parsed.hostname.toLowerCase();
      parsedProtocol = parsed.protocol;
    } catch {
      return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
    }
    if (parsedProtocol !== 'https:') {
      return NextResponse.json({ error: 'URL host is not allowed' }, { status: 403 });
    }
    const allowed = ALLOWED_SUFFIXES.some(h => parsedHost === h || parsedHost.endsWith('.' + h));
    if (!allowed) {
      return NextResponse.json({ error: 'URL host is not allowed' }, { status: 403 });
    }

    // DNS Rebinding 방어: 실제 연결 IP가 private range인지 확인
    try {
      const { address } = await dns.lookup(parsedHost, { family: 4 });
      if (isPrivateIP(address)) {
        return NextResponse.json({ error: 'URL host is not allowed' }, { status: 403 });
      }
    } catch {
      return NextResponse.json({ error: 'URL host could not be resolved' }, { status: 400 });
    }

    // googlevideo.com: 실제 YouTube CDN (ALLOWED_SUFFIXES에 포함)
    const isYouTube = url.includes('googlevideo.com');

    // Fetch the media with appropriate headers
    const headers: any = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Connection': 'keep-alive',
    };

    // YouTube-specific headers
    if (isYouTube) {
      headers['Referer'] = 'https://www.youtube.com/';
      headers['Origin'] = 'https://www.youtube.com';
      headers['Sec-Fetch-Dest'] = 'video';
      headers['Sec-Fetch-Mode'] = 'no-cors';
      headers['Sec-Fetch-Site'] = 'cross-site';
      headers['Range'] = 'bytes=0-'; // Important for YouTube
    } else if (url.includes('twitter.com') || url.includes('twimg.com') || url.includes('video.twimg.com')) {
      // Twitter-specific headers
      headers['Referer'] = 'https://twitter.com/';
      headers['Origin'] = 'https://twitter.com';
      headers['Sec-Fetch-Dest'] = type === 'video' ? 'video' : 'image';
      headers['Sec-Fetch-Mode'] = 'no-cors';
      headers['Sec-Fetch-Site'] = 'cross-site';
    } else {
      headers['Referer'] = 'https://www.instagram.com/';
      headers['Origin'] = 'https://www.instagram.com';
      headers['Sec-Fetch-Dest'] = type === 'video' ? 'video' : 'image';
      headers['Sec-Fetch-Mode'] = 'cors';
      headers['Sec-Fetch-Site'] = 'cross-site';
    }

    const response = await axios.get(url, {
      ...getOutboundConfig(),
      responseType: 'stream', // Use stream instead of arraybuffer for large files
      headers,
      timeout: isYouTube ? 60000 : 120000,
      maxRedirects: 0,
      validateStatus: (status) => status >= 200 && status < 300,
    });

    // Determine file extension and content type
    const safeType = type === 'video' ? 'video' : 'image';
    const ext = safeType === 'video' ? 'mp4' : 'jpg';
    const rawCT = String(response.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    if (!SAFE_CONTENT_TYPES.has(rawCT)) {
      return NextResponse.json({ error: 'Unsupported media type' }, { status: 415 });
    }
    const contentType = rawCT;
    const contentLength = String(response.headers['content-length'] || '');
    
    // Determine platform from URL for better naming
    let platform = 'media';
    if (url.includes('instagram.com') || url.includes('cdninstagram.com')) {
      platform = 'instagram';
    } else if (url.includes('googlevideo.com') || url.includes('youtube.com')) {
      platform = 'youtube';
    } else if (url.includes('linkedin.com') || url.includes('licdn.com')) {
      platform = 'linkedin';
    } else if (url.includes('twitter.com') || url.includes('twimg.com')) {
      platform = 'twitter';
    } else if (url.includes('facebook.com') || url.includes('fbcdn.net')) {
      platform = 'facebook';
    }

    // Return the file with appropriate headers
    const disposition = preview === 'true'
      ? 'inline'
      : `attachment; filename="${platform}-${safeType}-${Date.now()}.${ext}"`;
    
    // Node.js 스트림 → Web ReadableStream 패스스루 (메모리 버퍼링 없음)
    const nodeStream = response.data as import('stream').Readable;
    const webStream = new ReadableStream({
      start(controller) {
        nodeStream.on('data', (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)));
        nodeStream.on('end', () => controller.close());
        nodeStream.on('error', (err: Error) => controller.error(err));
      },
      cancel() {
        nodeStream.destroy();
      },
    });

    const responseHeaders: Record<string, string> = {
      'Content-Type': contentType,
      'Content-Disposition': disposition,
      'Cache-Control': 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    };
    if (contentLength) responseHeaders['Content-Length'] = contentLength;

    return new NextResponse(webStream, { headers: responseHeaders });

  } catch (error: any) {
    console.error('Download Error:', error.message);
    
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      return NextResponse.json(
        { error: 'Download timeout. The file may be too large or the server is slow.' },
        { status: 408 }
      );
    }
    
    if (error.response?.status === 403) {
      return NextResponse.json(
        { error: 'Access denied. The media URL may have expired or requires authentication.' },
        { status: 403 }
      );
    }
    
    return NextResponse.json(
      { error: 'Failed to download media. Please try again.' },
      { status: 500 }
    );
  }
}
