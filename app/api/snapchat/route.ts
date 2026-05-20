import { NextRequest, NextResponse } from 'next/server';
import { fetchSnapchat } from '@/lib/media/providers/snapchat';
import { isMediaError } from '@/lib/media/types';

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json();
    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'Please provide a valid URL' }, { status: 400 });
    }
    const result = await fetchSnapchat(url);
    if (isMediaError(result)) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Snapchat API Error:', error);
    if (error.response) return NextResponse.json({ error: 'Failed to fetch Snapchat data', details: error.response.data || error.message }, { status: error.response.status || 500 });
    return NextResponse.json({ error: 'Failed to process Snapchat URL', details: error.message }, { status: 500 });
  }
}
