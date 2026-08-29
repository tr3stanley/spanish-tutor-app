import { NextRequest, NextResponse } from 'next/server';
import { getAuth, unauthorized } from '@/lib/auth';

// Full-text search across every transcript segment (Spanish stemming, so
// "hablar" also finds "hablando"). Returns one row per episode with a snippet
// and the timestamp of the first hit.
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuth(request);
    if (!auth) return unauthorized();

    const q = request.nextUrl.searchParams.get('q')?.trim();
    if (!q || q.length < 2) {
      return NextResponse.json({ results: [], query: q || '' });
    }

    const { data, error } = await auth.supabase.rpc('search_transcripts', { q, max_results: 40 });
    if (error) throw error;

    return NextResponse.json({ results: data || [], query: q });
  } catch (error) {
    console.error('Search error:', error);
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}
