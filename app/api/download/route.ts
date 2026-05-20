import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';

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

    // SSRF 방어: 허용된 CDN 도메인만 프록시
    const ALLOWED_HOSTS = [
      'cdninstagram.com', 'scontent', 'fbcdn.net',
      'video.twimg.com', 'pbs.twimg.com',
      'licdn.com', 'linkedin.com',
      'snapchat.com', 'snapcdn.com',
      'googlevideo.com', 'youtube.com',
    ];
    let parsedHost: string;
    try {
      parsedHost = new URL(url).hostname;
    } catch {
      return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
    }
    if (!ALLOWED_HOSTS.some(h => parsedHost.includes(h))) {
      return NextResponse.json({ error: 'URL host is not allowed' }, { status: 403 });
    }

    // Detect if it's a YouTube/Google Video URL
    const isYouTube = url.includes('googlevideo.com') || url.includes('youtube.com');

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
      responseType: 'stream', // Use stream instead of arraybuffer for large files
      headers,
      timeout: isYouTube ? 300000 : 120000, // 5 min for YouTube, 2 min for others
      maxRedirects: 10,
      validateStatus: (status) => status < 400,
    });

    // Determine file extension and content type
    const ext = type === 'video' ? 'mp4' : 'jpg';
    const contentType = String(response.headers['content-type'] || (type === 'video' ? 'video/mp4' : 'image/jpeg'));
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
      : `attachment; filename="${platform}-${type}-${Date.now()}.${ext}"`;
    
    // Convert stream to buffer for Next.js response
    const chunks: Buffer[] = [];
    for await (const chunk of response.data) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);
    
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': disposition,
        'Cache-Control': 'public, max-age=3600',
        'Content-Length': contentLength || buffer.length.toString(),
        'Accept-Ranges': 'bytes',
        'Access-Control-Allow-Origin': '*',
      },
    });

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
      { error: `Failed to download media: ${error.message}` },
      { status: 500 }
    );
  }
}
