import { NextRequest, NextResponse } from 'next/server';
import { getAuth, unauthorized } from '@/lib/auth';

// Playback position, liked flag and listened flag for one episode.
// Called every 15s while playing, so it stays a single cheap upsert.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await getAuth(request);
    if (!auth) return unauthorized();
    const { supabase } = auth;

    const { position_seconds, liked, listened, listened_delta } = await request.json();
    const episodeId = parseInt(id);

    const row: Record<string, unknown> = {
      user_id: auth.userId,
      episode_id: episodeId,
      updated_at: new Date().toISOString(),
    };
    if (typeof position_seconds === 'number' && position_seconds >= 0) {
      row.position_seconds = Math.floor(position_seconds);
    }
    if (typeof liked === 'boolean') {
      row.liked = liked;
      row.liked_at = liked ? new Date().toISOString() : null;
    }
    if (typeof listened === 'boolean') row.listened = listened;

    // Preserve flags we weren't given: upsert would otherwise reset them to defaults.
    const { data: existing } = await supabase
      .from('user_episodes')
      .select('listened, liked, liked_at, position_seconds')
      .eq('user_id', auth.userId)
      .eq('episode_id', episodeId)
      .maybeSingle();
    if (existing) {
      if (row.listened === undefined) row.listened = existing.listened;
      if (row.liked === undefined) {
        row.liked = existing.liked;
        row.liked_at = existing.liked_at;
      }
      if (row.position_seconds === undefined) row.position_seconds = existing.position_seconds;
    } else if (row.listened === undefined) {
      row.listened = false;
    }

    const { error } = await supabase
      .from('user_episodes')
      .upsert(row, { onConflict: 'user_id,episode_id' });
    if (error) throw error;

    // Listening time feeds the streak and the leaderboard.
    if (typeof listened_delta === 'number' && listened_delta > 0) {
      await supabase.rpc('bump_activity', { p_listen_seconds: Math.min(Math.floor(listened_delta), 600) });
    }

    return NextResponse.json({ saved: true });
  } catch (error) {
    console.error('Progress error:', error);
    return NextResponse.json({ error: 'Failed to save progress' }, { status: 500 });
  }
}
