import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/database';
import { processAudioWithWhisper } from '@/lib/whisper';
import { generateLessonPlan } from '@/lib/ai';

export async function POST(request: NextRequest) {
  try {
    const db = await getDatabase();

    // Find all podcasts without transcripts (failed processing)
    const failedPodcasts = await db.all(`
      SELECT p.id, p.title, p.file_path, p.language
      FROM podcasts p
      WHERE p.id > 33
      AND p.id NOT IN (
        SELECT DISTINCT podcast_id FROM transcripts
      )
      ORDER BY p.id
    `);

    console.log(`Found ${failedPodcasts.length} podcasts to reprocess`);

    if (failedPodcasts.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No failed podcasts to reprocess'
      });
    }

    // Start reprocessing in batches
    reprocessBatchInBackground(failedPodcasts);

    return NextResponse.json({
      success: true,
      count: failedPodcasts.length,
      message: `Starting reprocessing of ${failedPodcasts.length} podcasts...`
    });

  } catch (error) {
    console.error('Reprocess error:', error);
    return NextResponse.json(
      { error: 'Failed to start reprocessing' },
      { status: 500 }
    );
  }
}

async function reprocessBatchInBackground(podcasts: any[]) {
  const BATCH_SIZE = 2; // Process 2 files at a time for better success rate
  const db = await getDatabase();

  for (let i = 0; i < podcasts.length; i += BATCH_SIZE) {
    const batch = podcasts.slice(i, i + BATCH_SIZE);

    console.log(`Reprocessing batch ${Math.floor(i / BATCH_SIZE) + 1} of ${Math.ceil(podcasts.length / BATCH_SIZE)}`);

    // Process batch in parallel
    const promises = batch.map(async (podcast) => {
      try {
        console.log(`Reprocessing podcast ${podcast.id}: ${podcast.title}`);

        // Transcribe with Whisper
        const segments = await processAudioWithWhisper(podcast.file_path, podcast.language);

        // Save transcript to database
        for (const segment of segments) {
          await db.run(
            'INSERT INTO transcripts (podcast_id, text, start_time, end_time, confidence) VALUES (?, ?, ?, ?, ?)',
            [podcast.id, segment.text, segment.start, segment.end, segment.confidence || 0.5]
          );
        }

        // Generate lesson plan
        const fullTranscript = segments.map(s => s.text).join(' ');
        const lesson = await generateLessonPlan(fullTranscript, podcast.language);

        // Save lesson to database
        await db.run(
          'INSERT INTO lessons (podcast_id, summary, grammar_rules, vocabulary) VALUES (?, ?, ?, ?)',
          [podcast.id, lesson.summary, lesson.grammarRules, lesson.vocabulary]
        );

        // Mark as processed
        await db.run(
          'UPDATE podcasts SET processed_at = CURRENT_TIMESTAMP, lesson_generated = TRUE WHERE id = ?',
          [podcast.id]
        );

        console.log(`Podcast ${podcast.id} reprocessed successfully!`);
        return { id: podcast.id, success: true };

      } catch (error) {
        console.error(`Error reprocessing podcast ${podcast.id}:`, error);
        return { id: podcast.id, success: false, error };
      }
    });

    // Wait for batch to complete before starting next batch
    const results = await Promise.allSettled(promises);

    const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
    const failed = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.success)).length;

    console.log(`Batch complete: ${successful} successful, ${failed} failed`);

    // Small delay between batches to avoid overwhelming the system
    if (i + BATCH_SIZE < podcasts.length) {
      console.log('Waiting 2 seconds before next batch...');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  console.log('All reprocessing batches completed!');
}