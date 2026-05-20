import { NextRequest, NextResponse } from 'next/server';
import { fetchThreads } from '@/lib/media/providers/threads';
import { isMediaError } from '@/lib/media/types';

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json();
    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'Please provide a valid URL' }, { status: 400 });
    }
    const result = await fetchThreads(url);
    if (isMediaError(result)) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Threads API Error:', error);
    return NextResponse.json({ error: error.message || 'An unexpected error occurred while processing the Threads URL' }, { status: 500 });
  }
}
