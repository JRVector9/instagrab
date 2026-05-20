import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/apiAuth';
import { detectPlatform } from '@/lib/media/detectPlatform';
import { fetchInstagram } from '@/lib/media/providers/instagram';
import { fetchTwitter } from '@/lib/media/providers/twitter';
import { fetchThreads } from '@/lib/media/providers/threads';
import { fetchLinkedin } from '@/lib/media/providers/linkedin';
import { fetchSnapchat } from '@/lib/media/providers/snapchat';
import { isMediaError } from '@/lib/media/types';

export async function GET(request: NextRequest) {
  const authError = validateApiKey(request);
  if (authError) return authError;

  const url = request.nextUrl.searchParams.get('url');
  if (!url) {
    return NextResponse.json({ success: false, error: 'url query parameter is required' }, { status: 400 });
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid URL format' }, { status: 400 });
  }

  const platform = detectPlatform(parsedUrl.href);
  if (!platform) {
    return NextResponse.json(
      { success: false, error: 'Unsupported platform. Supported: instagram, twitter/x, threads, linkedin, snapchat' },
      { status: 400 }
    );
  }

  try {
    const providers = { instagram: fetchInstagram, twitter: fetchTwitter, threads: fetchThreads, linkedin: fetchLinkedin, snapchat: fetchSnapchat };
    const result = await providers[platform](parsedUrl.href);

    if (isMediaError(result)) {
      return NextResponse.json({ success: false, error: result.error }, { status: result.status });
    }

    return NextResponse.json({ success: true, platform, data: result });
  } catch (error: any) {
    console.error(`[v1/media] ${platform} error:`, error.message);
    return NextResponse.json({ success: false, error: 'Failed to fetch media. Please try again.' }, { status: 500 });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'X-API-Key, Content-Type',
    },
  });
}
