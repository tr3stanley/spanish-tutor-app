import { NextRequest, NextResponse } from 'next/server';
import { getAuth, unauthorized } from '@/lib/auth';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await getAuth(request);
    if (!auth) return unauthorized();
    const { supabase } = auth;
    const { data, error } = await supabase
      .from('songs')
      .select('id, title, artist, media_url, lyrics, study_sheet, region, cefr_level, created_at')
      .eq('id', id)
      .single();
    if (error || !data) {
      return NextResponse.json({ error: 'Song not found' }, { status: 404 });
    }

    const { count } = await supabase
      .from('vocabulary_items')
      .select('id', { count: 'exact', head: true })
      .eq('song_id', id);

    return NextResponse.json({ song: data, vocab_count: count ?? 0 });
  } catch (error) {
    console.error('Song fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch song' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await getAuth(request);
    if (!auth) return unauthorized();
    const { supabase } = auth;
    // song vocab rows cascade via the FK
    const { error } = await supabase.from('songs').delete().eq('id', id);
    if (error) throw error;
    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error('Song delete error:', error);
    return NextResponse.json({ error: 'Failed to delete song' }, { status: 500 });
  }
}
