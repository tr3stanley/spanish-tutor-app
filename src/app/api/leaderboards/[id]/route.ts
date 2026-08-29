import { NextRequest, NextResponse } from 'next/server';
import { getAuth, unauthorized } from '@/lib/auth';

// Leave a leaderboard. The owner leaving deletes the board for everyone
// (members cascade), which is what "delete my group" should do.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await getAuth(request);
    if (!auth) return unauthorized();
    const { supabase } = auth;

    const boardId = parseInt(id);
    const { data: board } = await supabase
      .from('leaderboards')
      .select('owner_id')
      .eq('id', boardId)
      .maybeSingle();
    if (!board) return NextResponse.json({ error: 'Leaderboard not found' }, { status: 404 });

    if (board.owner_id === auth.userId) {
      const { error } = await supabase.from('leaderboards').delete().eq('id', boardId);
      if (error) throw error;
      return NextResponse.json({ deleted: true });
    }

    const { error } = await supabase
      .from('leaderboard_members')
      .delete()
      .eq('leaderboard_id', boardId)
      .eq('user_id', auth.userId);
    if (error) throw error;
    return NextResponse.json({ left: true });
  } catch (error) {
    console.error('Leaderboard leave error:', error);
    return NextResponse.json({ error: 'Failed to leave' }, { status: 500 });
  }
}
