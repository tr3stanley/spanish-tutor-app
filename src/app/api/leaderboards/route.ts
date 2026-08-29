import { NextRequest, NextResponse } from 'next/server';
import { getAuth, unauthorized } from '@/lib/auth';

function inviteCode(): string {
  // Unambiguous alphabet: no O/0, I/1 — these get read aloud and typed by hand.
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
}

async function defaultName(supabase: NonNullable<Awaited<ReturnType<typeof getAuth>>>['supabase'], email: string | null) {
  const { data } = await supabase.from('user_profile').select('display_name').maybeSingle();
  return data?.display_name || email?.split('@')[0] || 'Learner';
}

// Boards the user belongs to, with each member's weekly activity.
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuth(request);
    if (!auth) return unauthorized();
    const { supabase } = auth;

    const { data: boards, error } = await supabase
      .from('leaderboards')
      .select('id, name, owner_id, invite_code, created_at')
      .order('created_at');
    if (error) throw error;
    if (!boards || boards.length === 0) return NextResponse.json({ boards: [] });

    const ids = boards.map(b => b.id);
    const [membersRes, activityRes] = await Promise.all([
      supabase.from('leaderboard_members').select('leaderboard_id, user_id, display_name').in('leaderboard_id', ids),
      // Peer rows are readable thanks to the leaderboard_peer_ids() policy.
      supabase
        .from('user_activity')
        .select('user_id, day, lessons, reviews, listen_seconds, chat_messages')
        .gte('day', new Date(Date.now() - 6 * 86400_000).toISOString().slice(0, 10)),
    ]);

    const byUser = new Map<string, { lessons: number; reviews: number; listen_seconds: number; days: Set<string> }>();
    for (const a of activityRes.data || []) {
      const cur = byUser.get(a.user_id) || { lessons: 0, reviews: 0, listen_seconds: 0, days: new Set<string>() };
      cur.lessons += a.lessons;
      cur.reviews += a.reviews;
      cur.listen_seconds += a.listen_seconds;
      if (a.lessons > 0 || a.reviews > 0 || a.chat_messages > 0 || a.listen_seconds >= 600) cur.days.add(a.day);
      byUser.set(a.user_id, cur);
    }

    const result = boards.map(board => {
      const members = (membersRes.data || [])
        .filter(m => m.leaderboard_id === board.id)
        .map(m => {
          const a = byUser.get(m.user_id);
          const lessons = a?.lessons ?? 0;
          const reviews = a?.reviews ?? 0;
          const minutes = Math.round((a?.listen_seconds ?? 0) / 60);
          return {
            user_id: m.user_id,
            display_name: m.display_name,
            is_me: m.user_id === auth.userId,
            lessons,
            reviews,
            minutes,
            active_days: a?.days.size ?? 0,
            // Weekly points: effort across all three habits, listening capped so
            // a long commute can't drown out actual practice.
            points: lessons * 10 + reviews * 3 + Math.min(minutes, 300),
          };
        })
        .sort((a, b) => b.points - a.points);

      return {
        id: board.id,
        name: board.name,
        invite_code: board.invite_code,
        is_owner: board.owner_id === auth.userId,
        members,
      };
    });

    return NextResponse.json({ boards: result });
  } catch (error) {
    console.error('Leaderboard list error:', error);
    return NextResponse.json({ error: 'Failed to load leaderboards' }, { status: 500 });
  }
}

// Create a board, or join one with an invite code.
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuth(request);
    if (!auth) return unauthorized();
    const { supabase } = auth;

    const { name, join_code, display_name } = await request.json();
    const memberName = (display_name || '').trim().slice(0, 40) || (await defaultName(supabase, auth.email));

    if (join_code) {
      const code = String(join_code).trim().toUpperCase();
      // The board isn't readable until you're a member, so resolve the code first.
      const { data: board, error: findError } = await supabase
        .rpc('leaderboard_id_for_code', { p_code: code });
      if (findError) throw findError;
      if (!board) {
        return NextResponse.json({ error: "That invite code doesn't match a leaderboard" }, { status: 404 });
      }

      // Plain insert, not upsert: upsert compiles to ON CONFLICT DO UPDATE, which
      // needs SELECT on the table — and you can't read membership rows until you
      // are a member. A duplicate just means they already joined.
      const { error: joinError } = await supabase
        .from('leaderboard_members')
        .insert({ leaderboard_id: board, user_id: auth.userId, display_name: memberName });
      if (joinError && joinError.code !== '23505') throw joinError;

      if (joinError?.code === '23505' && memberName) {
        await supabase
          .from('leaderboard_members')
          .update({ display_name: memberName })
          .eq('leaderboard_id', board)
          .eq('user_id', auth.userId);
      }

      return NextResponse.json({ joined: true, leaderboard_id: board });
    }

    if (!name?.trim()) {
      return NextResponse.json({ error: 'Give the leaderboard a name' }, { status: 400 });
    }

    let created = null;
    for (let attempt = 0; attempt < 5 && !created; attempt++) {
      const { data, error } = await supabase
        .from('leaderboards')
        .insert({ name: name.trim().slice(0, 60), owner_id: auth.userId, invite_code: inviteCode() })
        .select('id, name, invite_code')
        .single();
      if (!error) created = data;
      else if (error.code !== '23505') throw error; // retry only on code collision
    }
    if (!created) throw new Error('Could not allocate an invite code');

    const { error: memberError } = await supabase
      .from('leaderboard_members')
      .insert({ leaderboard_id: created.id, user_id: auth.userId, display_name: memberName });
    if (memberError) throw memberError;

    return NextResponse.json({ board: created });
  } catch (error) {
    console.error('Leaderboard create/join error:', error);
    return NextResponse.json({ error: 'Failed to save leaderboard' }, { status: 500 });
  }
}
