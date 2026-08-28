import { NextRequest, NextResponse } from 'next/server';
import { getSupabase, fetchAllRows } from '@/lib/supabase';
import { generateLessonPlan } from '@/lib/ai';

export async function POST(request: NextRequest) {
  try {
    const { podcastId } = await request.json();

    if (!podcastId) {
      return NextResponse.json({ error: 'Podcast ID is required' }, { status: 400 });
    }

    const supabase = getSupabase();

    const transcript = await fetchAllRows<{ text: string }>((from, to) =>
      supabase
        .from('transcript_segments')
        .select('text')
        .eq('episode_id', podcastId)
        .order('start_time')
        .range(from, to)
    );

    if (transcript.length === 0) {
      return NextResponse.json({ error: 'No transcript found for this podcast' }, { status: 404 });
    }

    const { data: podcast } = await supabase
      .from('episodes')
      .select('language')
      .eq('id', podcastId)
      .maybeSingle();
    if (!podcast) {
      return NextResponse.json({ error: 'Podcast not found' }, { status: 404 });
    }

    const fullTranscript = transcript.map(t => t.text).join(' ');
    const lesson = await generateLessonPlan(fullTranscript, podcast.language);

    const { error } = await supabase
      .from('lessons')
      .update({
        summary: lesson.summary,
        grammar_rules: lesson.grammarRules,
        vocabulary: lesson.vocabulary,
      })
      .eq('episode_id', podcastId);
    if (error) throw error;

    return NextResponse.json({
      success: true,
      message: `Lesson regenerated successfully for podcast ${podcastId}`,
      lesson
    });

  } catch (error) {
    console.error('Error regenerating lesson:', error);
    return NextResponse.json(
      { error: 'Failed to regenerate lesson' },
      { status: 500 }
    );
  }
}
