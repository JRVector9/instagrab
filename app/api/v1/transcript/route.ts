import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/apiAuth';
import { checkRateLimit } from '@/lib/rateLimiter';
import { fetchTranscript, validateLang } from '@/lib/media/providers/youtubeTranscript';
import { trackRequest } from '@/lib/usageTracker';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const authError = validateApiKey(request);
  if (authError) return authError;

  // Fix LOW: url 파라미터 검증을 rate limit 소모 전에
  const url = request.nextUrl.searchParams.get('url');
  if (!url) {
    return NextResponse.json({ success: false, error: 'url query parameter is required' }, { status: 400 });
  }

  const apiKey = request.headers.get('x-api-key')!;
  const rateLimitError = await checkRateLimit(apiKey);
  if (rateLimitError) return rateLimitError;

  const lang = validateLang(request.nextUrl.searchParams.get('lang') ?? 'ko');
  const t0 = Date.now();

  try {
    // Fix 9: request.signal 전달로 클라이언트 끊김 시 yt-dlp 종료
    const result = await fetchTranscript(url, lang, request.signal);
    void trackRequest({ platform: 'youtube', success: true, latencyMs: Date.now() - t0 });
    return NextResponse.json({ success: true, platform: 'youtube', data: result });
  } catch (e: any) {
    const status = e?.status ?? 500;
    void trackRequest({ platform: 'youtube', success: false, latencyMs: Date.now() - t0 });
    // Fix 10: 5xx는 내부 메시지 노출 금지
    if (status >= 500) {
      console.error('[transcript] internal error:', e);
      return NextResponse.json({ success: false, error: '서버 오류가 발생했습니다' }, { status });
    }
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}
