import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { getStats } from '@/lib/usageTracker';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const adminKey = process.env.ADMIN_API_KEY;
  if (!adminKey || adminKey.trim() === '') {
    return NextResponse.json({ success: false, error: 'Stats not configured' }, { status: 503 });
  }

  const provided = request.headers.get('x-api-key') ?? '';
  const adminBuf = Buffer.from(adminKey);
  const providedBuf = Buffer.from(provided);
  const valid = providedBuf.length === adminBuf.length && timingSafeEqual(providedBuf, adminBuf);
  if (!valid) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  // KST 오늘 날짜 기본값
  const kstToday = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const date = request.nextUrl.searchParams.get('date') || kstToday;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ success: false, error: 'date must be YYYY-MM-DD' }, { status: 400 });
  }

  const stats = await getStats(date);
  if (stats === null) {
    return NextResponse.json({ success: false, error: 'Redis not configured' }, { status: 503 });
  }

  return NextResponse.json({ success: true, date, stats });
}
