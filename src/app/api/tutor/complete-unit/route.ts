import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';

// Student-confirmed unit completion (the tutor tells them when they've earned it).
export async function POST() {
  try {
    const supabase = getSupabase();
    const { data: unit } = await supabase
      .from('course_units')
      .select('id, position, title')
      .eq('status', 'in_progress')
      .order('position')
      .limit(1)
      .maybeSingle();

    if (!unit) {
      return NextResponse.json({ error: 'No unit in progress' }, { status: 400 });
    }

    const { error } = await supabase
      .from('course_units')
      .update({ status: 'done', completed_at: new Date().toISOString() })
      .eq('id', unit.id);
    if (error) throw error;

    const { error: msgError } = await supabase.from('tutor_messages').insert({
      role: 'assistant',
      content: `🎉 Unit ${unit.position} complete: ${unit.title}. On to the next one whenever you're ready!`,
    });
    if (msgError) console.error('Failed to save completion message:', msgError.message);

    return NextResponse.json({ completed: { position: unit.position, title: unit.title } });
  } catch (error) {
    console.error('Complete unit error:', error);
    return NextResponse.json({ error: 'Failed to complete unit' }, { status: 500 });
  }
}
