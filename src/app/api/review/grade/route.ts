import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';

// Simple SM-2-style scheduling. grade: 'again' | 'hard' | 'good' | 'easy'
export async function POST(request: NextRequest) {
  try {
    const { lemma, grade } = await request.json();
    if (!lemma || !['again', 'hard', 'good', 'easy'].includes(grade)) {
      return NextResponse.json({ error: 'lemma and grade (again|hard|good|easy) required' }, { status: 400 });
    }

    const supabase = getSupabase();
    const { data: existing } = await supabase
      .from('known_words')
      .select('*')
      .eq('lemma', lemma)
      .maybeSingle();

    let ease = existing?.srs_ease ?? 2.5;
    let interval = existing?.srs_interval_days ?? 0;

    switch (grade) {
      case 'again':
        ease = Math.max(1.3, ease - 0.2);
        interval = 0; // due again today
        break;
      case 'hard':
        ease = Math.max(1.3, ease - 0.15);
        interval = Math.max(1, interval * 1.2);
        break;
      case 'good':
        interval = interval < 1 ? 1 : interval * ease;
        break;
      case 'easy':
        ease = ease + 0.15;
        interval = interval < 1 ? 3 : interval * ease * 1.3;
        break;
    }
    interval = Math.min(interval, 365);

    const status = interval >= 60 ? 'known' : 'learning';
    const dueAt = new Date(Date.now() + interval * 24 * 60 * 60 * 1000).toISOString();

    const { data: row, error } = await supabase
      .from('known_words')
      .upsert(
        {
          user_id: '00000000-0000-0000-0000-000000000000',
          lemma,
          status,
          srs_ease: ease,
          srs_interval_days: interval,
          srs_due_at: dueAt,
          last_reviewed_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,lemma' }
      )
      .select()
      .single();
    if (error) throw error;

    return NextResponse.json({ word: row });
  } catch (error) {
    console.error('Grade error:', error);
    return NextResponse.json({ error: 'Failed to grade word' }, { status: 500 });
  }
}
