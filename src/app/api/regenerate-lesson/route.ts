import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/database';
import { generateLessonPlan } from '@/lib/ai';

export async function POST(request: NextRequest) {
  try {
    const { podcastId } = await request.json();

    if (!podcastId) {
      return NextResponse.json({ error: 'Podcast ID is required' }, { status: 400 });
    }

    const db = await getDatabase();

    // Get the transcript
    const transcript = await db.all(
      'SELECT text FROM transcripts WHERE podcast_id = ? ORDER BY start_time',
      [podcastId]
    );

    if (!transcript || transcript.length === 0) {
      return NextResponse.json({ error: 'No transcript found for this podcast' }, { status: 404 });
    }

    // Get podcast language
    const podcast = await db.get('SELECT language FROM podcasts WHERE id = ?', [podcastId]);
    if (!podcast) {
      return NextResponse.json({ error: 'Podcast not found' }, { status: 404 });
    }

    // Regenerate lesson plan
    const fullTranscript = transcript.map(t => t.text).join(' ');
    const lesson = await generateLessonPlan(fullTranscript, podcast.language);

    // Update the lesson in database
    await db.run(`
      UPDATE lessons
      SET summary = ?, grammar_rules = ?, vocabulary = ?
      WHERE podcast_id = ?
    `, [lesson.summary, lesson.grammarRules, lesson.vocabulary, podcastId]);

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