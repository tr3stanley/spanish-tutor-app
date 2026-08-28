import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { explainSegment } from '@/lib/ai';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { startTime, endTime } = await request.json();
    const { id } = await params;
    const podcastId = parseInt(id);

    if (startTime === null || startTime === undefined || endTime === null || endTime === undefined) {
      return NextResponse.json(
        { error: 'startTime and endTime are required' },
        { status: 400 }
      );
    }

    const supabase = getSupabase();

    const { data: existingExplanation } = await supabase
      .from('explanations')
      .select('explanation')
      .eq('episode_id', podcastId)
      .eq('start_time', startTime)
      .eq('end_time', endTime)
      .maybeSingle();

    if (existingExplanation) {
      return NextResponse.json({ explanation: existingExplanation.explanation });
    }

    const { data: podcast } = await supabase
      .from('episodes')
      .select('language')
      .eq('id', podcastId)
      .maybeSingle();

    if (!podcast) {
      return NextResponse.json(
        { error: 'Podcast not found' },
        { status: 404 }
      );
    }

    // Segments overlapping the requested time range
    const { data: segments } = await supabase
      .from('transcript_segments')
      .select('text')
      .eq('episode_id', podcastId)
      .lt('start_time', endTime)
      .gt('end_time', startTime)
      .order('start_time');

    if (!segments || segments.length === 0) {
      return NextResponse.json(
        { error: 'No transcript found for this time range' },
        { status: 404 }
      );
    }

    const segmentText = segments.map(s => s.text).join(' ');

    // Get some context (30 seconds before and after)
    const [{ data: contextBefore }, { data: contextAfter }] = await Promise.all([
      supabase
        .from('transcript_segments')
        .select('text')
        .eq('episode_id', podcastId)
        .gte('start_time', Math.max(0, startTime - 30))
        .lt('start_time', startTime)
        .order('start_time'),
      supabase
        .from('transcript_segments')
        .select('text')
        .eq('episode_id', podcastId)
        .gt('start_time', endTime)
        .lte('start_time', endTime + 30)
        .order('start_time'),
    ]);

    const context = [
      ...(contextBefore || []).map(s => s.text),
      '**[SEGMENT TO EXPLAIN]**',
      segmentText,
      '**[END SEGMENT]**',
      ...(contextAfter || []).map(s => s.text)
    ].join(' ');

    const explanation = await explainSegment(segmentText, podcast.language, context);

    const { error: insertError } = await supabase.from('explanations').insert({
      episode_id: podcastId,
      start_time: startTime,
      end_time: endTime,
      explanation,
    });
    if (insertError) {
      console.log('Could not save explanation:', insertError.message);
    }

    return NextResponse.json({ explanation });

  } catch (error) {
    console.error('Error generating explanation:', error);
    return NextResponse.json(
      { error: 'Failed to generate explanation' },
      { status: 500 }
    );
  }
}
