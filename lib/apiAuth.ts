import { NextRequest, NextResponse } from 'next/server';

export function validateApiKey(request: NextRequest): NextResponse | null {
  const apiKey = process.env.API_KEY;

  // fail-closed: API_KEY가 설정되지 않으면 API 자체를 비활성화
  if (!apiKey) {
    return NextResponse.json({ success: false, error: 'API is not configured' }, { status: 503 });
  }

  const provided = request.headers.get('x-api-key');
  if (!provided || provided !== apiKey) {
    return NextResponse.json({ success: false, error: 'Invalid or missing API key' }, { status: 401 });
  }

  return null; // 검증 통과
}
