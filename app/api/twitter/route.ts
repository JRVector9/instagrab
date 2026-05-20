import { NextRequest, NextResponse } from 'next/server';
import { fetchTwitter } from '@/lib/media/providers/twitter';
import { isMediaError } from '@/lib/media/types';

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json();
    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'Please provide a valid URL' }, { status: 400 });
    }
    const result = await fetchTwitter(url);
    if (isMediaError(result)) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Twitter API Error:', error);
    return NextResponse.json({ error: error.message || 'Failed to process the Twitter URL' }, { status: 500 });
  }
}
