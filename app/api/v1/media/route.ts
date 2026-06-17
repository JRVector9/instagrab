import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/apiAuth';
import { checkRateLimit } from '@/lib/rateLimiter';
import { trackRequest } from '@/lib/usageTracker';
import { detectPlatform } from '@/lib/media/detectPlatform';
import { fetchInstagram } from '@/lib/media/providers/instagram';
import { fetchTwitter } from '@/lib/media/providers/twitter';
import { fetchThreads } from '@/lib/media/providers/threads';
import { fetchLinkedin } from '@/lib/media/providers/linkedin';
import { isMediaError } from '@/lib/media/types';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const authError = validateApiKey(request);
  if (authError) return authError;

  const apiKey = request.headers.get('x-api-key')!;
  const rateLimitError = await checkRateLimit(apiKey);
  if (rateLimitError) return rateLimitError;

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
      { success: false, error: 'Unsupported platform. Supported: instagram, twitter/x, threads, linkedin' },
      { status: 400 }
    );
  }

  const start = Date.now();
  try {
    const providers = { instagram: fetchInstagram, twitter: fetchTwitter, threads: fetchThreads, linkedin: fetchLinkedin };
    const result = await providers[platform](parsedUrl.href);

    if (isMediaError(result)) {
      await trackRequest({ platform, success: false, latencyMs: Date.now() - start });
      return NextResponse.json({ success: false, error: result.error }, { status: result.status });
    }

    await trackRequest({ platform, success: true, latencyMs: Date.now() - start });
    return NextResponse.json({ success: true, platform, data: result });
  } catch (error: any) {
    console.error(`[v1/media] ${platform} error:`, error.message);
    await trackRequest({ platform, success: false, latencyMs: Date.now() - start });
    return NextResponse.json({ success: false, error: 'Failed to fetch media. Please try again.' }, { status: 500 });
  }
}

