import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';

export async function GET() {
  try {
    const supabase = getSupabase();
    const { data: profile } = await supabase.from('user_profile').select('*').maybeSingle();
    return NextResponse.json({ profile });
  } catch (error) {
    console.error('Error fetching profile:', error);
    return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { cefr_level, target_dialect, goals } = await request.json();

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (cefr_level !== undefined) updates.cefr_level = cefr_level;
    if (target_dialect !== undefined) updates.target_dialect = target_dialect;
    if (goals !== undefined) updates.goals = goals;

    const supabase = getSupabase();
    const { data: profile, error } = await supabase
      .from('user_profile')
      .upsert({ user_id: '00000000-0000-0000-0000-000000000000', ...updates })
      .select()
      .single();
    if (error) throw error;

    return NextResponse.json({ profile });
  } catch (error) {
    console.error('Error updating profile:', error);
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
  }
}
