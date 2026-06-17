import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';

export function validateApiKey(request: NextRequest): NextResponse | null {
  const apiKey = process.env.API_KEY;

  // fail-closed: API_KEY가 설정되지 않거나 빈 문자열이면 비활성화
  if (!apiKey || apiKey.trim() === '') {
    return NextResponse.json({ success: false, error: 'API is not configured' }, { status: 503 });
  }

  const provided = request.headers.get('x-api-key') ?? '';
  const apiKeyBuf = Buffer.from(apiKey);
  const providedBuf = Buffer.from(provided);
  const valid = providedBuf.length === apiKeyBuf.length && timingSafeEqual(providedBuf, apiKeyBuf);
  if (!valid) {
    return NextResponse.json({ success: false, error: 'Invalid or missing API key' }, { status: 401 });
  }

  return null; // 검증 통과
}
