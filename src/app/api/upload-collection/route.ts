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

    // Start background processing for all files
    files.forEach((file, index) => {
      const podcastId = podcastIds[index];
      const title = file.title || file.name.replace(/\.[^/.]+$/, '');
      const fullTitle = files.length === 1 ? baseTitle : `${baseTitle} - ${title}`;

      if (podcastId) {
        processInBackground(podcastId, file.url, fullTitle, language);
      }
    });

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