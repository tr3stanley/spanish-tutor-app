import { NextRequest, NextResponse } from 'next/server';
import { getAuth, unauthorized } from '@/lib/auth';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await getAuth(request);
    if (!auth) return unauthorized();
    const { supabase } = auth;

    const { data: podcast } = await supabase
      .from('episodes')
      .select('id, title')
      .eq('id', parseInt(id))
      .maybeSingle();
    if (!podcast) {
      return NextResponse.json({ error: 'Podcast not found' }, { status: 404 });
    }

    const { error } = await supabase
      .from('user_episodes')
      .upsert(
        { user_id: auth.userId, episode_id: parseInt(id), listened: true, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,episode_id' }
      );
    if (error) throw error;

    return NextResponse.json({
      success: true,
      podcast,
      message: 'Podcast marked as listened. Offline file will be auto-removed in 24 hours.'
    });
  } catch (error) {
    console.error('Error marking podcast as listened:', error);
    return NextResponse.json(
      { error: 'Failed to mark podcast as listened' },
      { status: 500 }
    );
  }
}
