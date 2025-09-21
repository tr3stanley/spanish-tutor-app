import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { getDatabase } from '@/lib/database';
import { processAudioWithWhisper } from '@/lib/whisper';
import { generateLessonPlan } from '@/lib/ai';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const language = formData.get('language') as 'spanish' | 'russian';
    const title = formData.get('title') as string;

    if (!file || !language || !title) {
      return NextResponse.json(
        { error: 'Missing required fields: file, language, title' },
        { status: 400 }
      );
    }

    // Ensure uploads directory exists
    const uploadsDir = path.join(process.cwd(), 'uploads');
    await mkdir(uploadsDir, { recursive: true });

    // Save the uploaded file
    const filename = `${Date.now()}-${file.name}`;
    const filepath = path.join(uploadsDir, filename);

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    await writeFile(filepath, buffer);

    // Save to database
    const db = await getDatabase();
    const result = await db.run(
      'INSERT INTO podcasts (title, filename, file_path, language) VALUES (?, ?, ?, ?)',
      [title, filename, filepath, language]
    );

    const podcastId = result.lastID;

    // Start background processing with Whisper
    processInBackground(podcastId!, filepath, title, language);

    return NextResponse.json({
      success: true,
      podcastId,
      message: 'Podcast uploaded successfully. Processing with Whisper...'
    });

  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: 'Failed to upload podcast' },
      { status: 500 }
    );
  }
}

async function processInBackground(
  podcastId: number,
  filepath: string,
  title: string,
  language: 'spanish' | 'russian'
) {
  const db = await getDatabase();

  try {
    console.log(`Processing podcast ${podcastId} with Whisper...`);

    // Transcribe with Whisper
    const segments = await processAudioWithWhisper(filepath, language);

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

    console.log(`Podcast ${podcastId} processed successfully with Whisper!`);

  } catch (error) {
    console.error(`Error processing podcast ${podcastId}:`, error);

    // Mark as failed
    await db.run(
      'UPDATE podcasts SET processed_at = CURRENT_TIMESTAMP WHERE id = ?',
      [podcastId]
    );
  }
}