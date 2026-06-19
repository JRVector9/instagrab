import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/apiAuth';
import { checkRateLimit } from '@/lib/rateLimiter';
import { fetchTranscript, validateLang } from '@/lib/media/providers/youtubeTranscript';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const authError = validateApiKey(request);
  if (authError) return authError;

  const apiKey = request.headers.get('x-api-key')!;
  const rateLimitError = await checkRateLimit(apiKey);
  if (rateLimitError) return rateLimitError;

  const url = request.nextUrl.searchParams.get('url');
  const lang = validateLang(request.nextUrl.searchParams.get('lang') ?? 'ko');

  if (!url) {
    return NextResponse.json({ success: false, error: 'url query parameter is required' }, { status: 400 });
  }

  try {
    const result = await fetchTranscript(url, lang);
    return NextResponse.json({ success: true, platform: 'youtube', data: result });
  } catch (e: any) {
    const status = e?.status ?? 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}
