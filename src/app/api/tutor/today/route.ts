import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';

// Everything the "Today" strip needs in one call.
export async function GET() {
  try {
    const supabase = getSupabase();
    const now = new Date().toISOString();

    const [dueRes, unitsRes] = await Promise.all([
      supabase
        .from('known_words')
        .select('lemma', { count: 'exact', head: true })
        .eq('status', 'learning')
        .lte('srs_due_at', now),
      supabase.from('course_units').select('position, block, title, status').order('position'),
    ]);

    const units = unitsRes.data || [];
    const current = units.find(u => u.status === 'in_progress') || units.find(u => u.status === 'pending') || null;
    const doneCount = units.filter(u => u.status === 'done').length;

    return NextResponse.json({
      due_cards: dueRes.count ?? 0,
      syllabus: units.length > 0
        ? { total: units.length, done: doneCount, current, units }
        : null,
    });
  } catch (error) {
    console.error('Today error:', error);
    return NextResponse.json({ error: 'Failed to fetch today summary' }, { status: 500 });
  }
}
