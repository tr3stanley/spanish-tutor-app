import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';

export async function GET() {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('songs')
      .select('id, title, artist, media_url, region, cefr_level, study_sheet, created_at')
      .order('created_at', { ascending: false });
    if (error) throw error;

    const songs = (data || []).map(s => ({
      id: s.id,
      title: s.title,
      artist: s.artist,
      media_url: s.media_url,
      region: s.region,
      cefr_level: s.cefr_level,
      has_sheet: s.study_sheet != null,
      created_at: s.created_at,
    }));
    return NextResponse.json({ songs });
  } catch (error) {
    console.error('Songs list error:', error);
    return NextResponse.json({ error: 'Failed to fetch songs' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { title, artist, media_url, lyrics } = await request.json();
    if (!title?.trim() || !artist?.trim()) {
      return NextResponse.json({ error: 'Title and artist are required' }, { status: 400 });
    }
    if (!lyrics?.trim() || lyrics.trim().length < 50) {
      return NextResponse.json({ error: 'Paste the song lyrics (needed for the study sheet)' }, { status: 400 });
    }

    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('songs')
      .insert({
        title: title.trim(),
        artist: artist.trim(),
        media_url: media_url?.trim() || null,
        lyrics: lyrics.trim(),
      })
      .select('id, title, artist, media_url, region, cefr_level, created_at')
      .single();
    if (error) throw error;

    return NextResponse.json({ song: { ...data, has_sheet: false } });
  } catch (error) {
    console.error('Song create error:', error);
    return NextResponse.json({ error: 'Failed to add song' }, { status: 500 });
  }
}
