import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';

export async function GET() {
  try {
    const supabase = getSupabase();
    const { data: lessons, error } = await supabase
      .from('tutor_lessons')
      .select('id, topic, cefr_level, content, created_at')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) throw error;
    return NextResponse.json({ lessons: lessons || [] });
  } catch (error) {
    console.error('Lessons list error:', error);
    return NextResponse.json({ error: 'Failed to fetch lessons' }, { status: 500 });
  }
}
