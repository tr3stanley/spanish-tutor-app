import { NextRequest, NextResponse } from 'next/server';
import { getAuth, unauthorized } from '@/lib/auth';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { folder_id, listened } = await request.json();

    if (folder_id === undefined && listened === undefined) {
      return NextResponse.json({ error: 'No updates provided' }, { status: 400 });
    }

    const auth = await getAuth(request);
    if (!auth) return unauthorized();
    const { supabase } = auth;
    let podcast;
    if (folder_id !== undefined) {
      const { data, error } = await supabase
        .from('episodes')
        .update({ folder_id })
        .eq('id', parseInt(id))
        .select()
        .maybeSingle();
      if (error) throw error;
      podcast = data;
    } else {
      const { data, error } = await supabase
        .from('episodes')
        .select()
        .eq('id', parseInt(id))
        .maybeSingle();
      if (error) throw error;
      podcast = data;
    }

    if (!podcast) {
      return NextResponse.json({ error: 'Podcast not found' }, { status: 404 });
    }

    // listened is per-user now
    if (listened !== undefined) {
      const { error } = await supabase
        .from('user_episodes')
        .upsert(
          { user_id: auth.userId, episode_id: parseInt(id), listened: !!listened, updated_at: new Date().toISOString() },
          { onConflict: 'user_id,episode_id' }
        );
      if (error) throw error;
    }

    return NextResponse.json({ podcast: { ...podcast, listened: listened !== undefined ? !!listened : undefined } });
  } catch (error) {
    console.error('Error updating podcast:', error);
    return NextResponse.json(
      { error: 'Failed to update podcast' },
      { status: 500 }
    );
  }
}
