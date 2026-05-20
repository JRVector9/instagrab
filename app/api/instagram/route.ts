import { NextRequest, NextResponse } from 'next/server';
import { fetchInstagram } from '@/lib/media/providers/instagram';
import { isMediaError } from '@/lib/media/types';

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json();
    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'Please provide a valid URL' }, { status: 400 });
    }
    const result = await fetchInstagram(url);
    if (isMediaError(result)) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Instagram API Error:', error);
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      return NextResponse.json({ error: 'Request timeout. Please try again.' }, { status: 408 });
    }
    if (error.response?.status === 404) return NextResponse.json({ error: 'Post not found. It might be deleted or private.' }, { status: 404 });
    if (error.response?.status === 429) return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
    return NextResponse.json({ error: 'Failed to fetch Instagram content. Please check the URL and try again.' }, { status: 500 });
  }
}
