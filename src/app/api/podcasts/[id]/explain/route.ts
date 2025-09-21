import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/database';
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

    const db = await getDatabase();

    // Check if we already have an explanation for this segment
    const existingExplanation = await db.get(
      'SELECT * FROM explanations WHERE podcast_id = ? AND start_time = ? AND end_time = ?',
      [podcastId, startTime, endTime]
    );

    if (existingExplanation) {
      return NextResponse.json({ explanation: existingExplanation.explanation });
    }

    // Get the podcast language
    const podcast = await db.get(
      'SELECT language FROM podcasts WHERE id = ?',
      [podcastId]
    );

    if (!podcast) {
      return NextResponse.json(
        { error: 'Podcast not found' },
        { status: 404 }
      );
    }

    // Get the transcript segments that overlap with the time range
    const segments = await db.all(
      'SELECT text FROM transcripts WHERE podcast_id = ? AND start_time < ? AND end_time > ? ORDER BY start_time',
      [podcastId, endTime, startTime]
    );

    if (segments.length === 0) {
      return NextResponse.json(
        { error: 'No transcript found for this time range' },
        { status: 404 }
      );
    }

    const segmentText = segments.map(s => s.text).join(' ');

    // Get some context (30 seconds before and after)
    const contextBefore = await db.all(
      'SELECT text FROM transcripts WHERE podcast_id = ? AND start_time >= ? AND start_time < ? ORDER BY start_time',
      [podcastId, Math.max(0, startTime - 30), startTime]
    );

    const contextAfter = await db.all(
      'SELECT text FROM transcripts WHERE podcast_id = ? AND start_time > ? AND start_time <= ? ORDER BY start_time',
      [podcastId, endTime, endTime + 30]
    );

    const context = [
      ...contextBefore.map(s => s.text),
      '**[SEGMENT TO EXPLAIN]**',
      segmentText,
      '**[END SEGMENT]**',
      ...contextAfter.map(s => s.text)
    ].join(' ');

    // Generate explanation
    const explanation = await explainSegment(segmentText, podcast.language, context);

    // Save explanation to database
    await db.run(
      'INSERT INTO explanations (podcast_id, start_time, end_time, explanation) VALUES (?, ?, ?, ?)',
      [podcastId, startTime, endTime, explanation]
    );

    return NextResponse.json({ explanation });

  } catch (error) {
    console.error('Error generating explanation:', error);
    return NextResponse.json(
      { error: 'Failed to generate explanation' },
      { status: 500 }
    );
  }
}