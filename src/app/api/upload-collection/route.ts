import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/database';
import { processAudioWithWhisper } from '@/lib/whisper';
import { generateLessonPlan } from '@/lib/ai';

interface CollectionFile {
  name: string;
  title: string;
  url: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { files, language, baseTitle } = body;

    if (!files || !Array.isArray(files) || files.length === 0) {
      return NextResponse.json(
        { error: 'Files array is required' },
        { status: 400 }
      );
    }

    if (!language || !baseTitle) {
      return NextResponse.json(
        { error: 'Language and base title are required' },
        { status: 400 }
      );
    }

    const db = await getDatabase();
    const podcastIds: number[] = [];

    // Insert all podcasts into database first
    for (const file of files) {
      const title = file.title || file.name.replace(/\.[^/.]+$/, '');
      const fullTitle = files.length === 1 ? baseTitle : `${baseTitle} - ${title}`;

      const result = await db.run(
        'INSERT INTO podcasts (title, filename, file_path, language) VALUES (?, ?, ?, ?)',
        [fullTitle, file.name, file.url, language]
      );

      if (result.lastID) {
        podcastIds.push(result.lastID);
      }
    }

    // Start background processing in batches
    processBatchInBackground(files, podcastIds, baseTitle, language);

    return NextResponse.json({
      success: true,
      podcastIds,
      count: files.length,
      message: `${files.length} podcast(s) added successfully. Processing with Whisper...`
    });

  } catch (error) {
    console.error('Collection upload error:', error);
    return NextResponse.json(
      { error: 'Failed to upload collection' },
      { status: 500 }
    );
  }
}

async function processBatchInBackground(
  files: CollectionFile[],
  podcastIds: number[],
  baseTitle: string,
  language: 'spanish' | 'russian'
) {
  const BATCH_SIZE = 5; // Process 5 files at a time

  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    const batch = files.slice(i, i + BATCH_SIZE);
    const batchIds = podcastIds.slice(i, i + BATCH_SIZE);

    console.log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1} of ${Math.ceil(files.length / BATCH_SIZE)}`);

    // Process batch in parallel
    const promises = batch.map((file, index) => {
      const podcastId = batchIds[index];
      const title = file.title || file.name.replace(/\.[^/.]+$/, '');
      const fullTitle = files.length === 1 ? baseTitle : `${baseTitle} - ${title}`;

      if (podcastId) {
        return processInBackground(podcastId, file.url, fullTitle, language);
      }
      return Promise.resolve();
    });

    // Wait for batch to complete before starting next batch
    await Promise.allSettled(promises);

    // Small delay between batches to avoid overwhelming the system
    if (i + BATCH_SIZE < files.length) {
      console.log('Waiting 2 seconds before next batch...');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  console.log('All batches completed!');
}

async function processInBackground(
  podcastId: number,
  fileUrl: string,
  title: string,
  language: 'spanish' | 'russian'
) {
  const db = await getDatabase();

  try {
    console.log(`Processing podcast ${podcastId} from collection with Whisper...`);

    // Transcribe with Whisper
    const segments = await processAudioWithWhisper(fileUrl, language);

    // Save transcript to database
    for (const segment of segments) {
      await db.run(
        'INSERT INTO transcripts (podcast_id, text, start_time, end_time, confidence) VALUES (?, ?, ?, ?, ?)',
        [podcastId, segment.text, segment.start, segment.end, segment.confidence || 0.5]
      );
    }

    // Generate lesson plan
    const fullTranscript = segments.map(s => s.text).join(' ');
    const lesson = await generateLessonPlan(fullTranscript, language);

    // Save lesson to database
    await db.run(
      'INSERT INTO lessons (podcast_id, summary, grammar_rules, vocabulary) VALUES (?, ?, ?, ?)',
      [podcastId, lesson.summary, lesson.grammarRules, lesson.vocabulary]
    );

    // Mark as processed
    await db.run(
      'UPDATE podcasts SET processed_at = CURRENT_TIMESTAMP, lesson_generated = TRUE WHERE id = ?',
      [podcastId]
    );

    console.log(`Collection podcast ${podcastId} processed successfully!`);

  } catch (error) {
    console.error(`Error processing collection podcast ${podcastId}:`, error);

    // Mark as failed
    await db.run(
      'UPDATE podcasts SET processed_at = CURRENT_TIMESTAMP WHERE id = ?',
      [podcastId]
    );
  }
}