import { NextRequest, NextResponse } from 'next/server';
import { getAuth, unauthorized } from '@/lib/auth';

// Streak, this week's totals against the user's own goal, and vocabulary mastery.
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuth(request);
    if (!auth) return unauthorized();
    const { supabase } = auth;

    const [activityRes, profileRes, knownRes, learningRes] = await Promise.all([
      supabase.rpc('activity_summary'),
      supabase.from('user_profile').select('weekly_goal, display_name, cefr_level').maybeSingle(),
      supabase.from('known_words').select('lemma', { count: 'exact', head: true }).eq('status', 'known'),
      supabase.from('known_words').select('lemma', { count: 'exact', head: true }).eq('status', 'learning'),
    ]);

    const activity = activityRes.data || { streak: 0, active_today: false, week: {}, days: [] };
    const goal = profileRes.data?.weekly_goal || { lessons: 3, reviews: 3 };

    return NextResponse.json({
      streak: activity.streak ?? 0,
      active_today: activity.active_today ?? false,
      week: activity.week ?? {},
      days: activity.days ?? [],
      goal,
      words: { known: knownRes.count ?? 0, learning: learningRes.count ?? 0 },
      display_name: profileRes.data?.display_name ?? null,
      cefr_level: profileRes.data?.cefr_level ?? null,
    });
  } catch (error) {
    console.error('Progress summary error:', error);
    return NextResponse.json({ error: 'Failed to load progress' }, { status: 500 });
  }
}

// Update the self-set weekly goal (and display name, used on leaderboards).
export async function PUT(request: NextRequest) {
  try {
    const auth = await getAuth(request);
    if (!auth) return unauthorized();

    const { lessons, reviews, display_name } = await request.json();
    const updates: Record<string, unknown> = { user_id: auth.userId };

    if (typeof lessons === 'number' || typeof reviews === 'number') {
      updates.weekly_goal = {
        lessons: Math.max(0, Math.min(30, Math.floor(lessons ?? 3))),
        reviews: Math.max(0, Math.min(30, Math.floor(reviews ?? 3))),
      };
    }
    if (typeof display_name === 'string') {
      updates.display_name = display_name.trim().slice(0, 40) || null;
    }

    const { error } = await auth.supabase
      .from('user_profile')
      .upsert(updates, { onConflict: 'user_id' });
    if (error) throw error;

    return NextResponse.json({ saved: true });
  } catch (error) {
    console.error('Goal update error:', error);
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 });
  }
}
