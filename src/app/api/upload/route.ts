import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { getSupabase } from '@/lib/supabase';
import { processEpisode } from '@/lib/processing';

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || '';

    let file: File | null = null;
    let audioUrl: string | null = null;
    let language: 'spanish' | 'russian';
    let title: string;
    let filename: string;
    let filepath: string;

    if (contentType.includes('multipart/form-data')) {
      // File upload
      const formData = await request.formData();
      file = formData.get('file') as File;
      language = formData.get('language') as 'spanish' | 'russian';
      title = formData.get('title') as string;

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
      filename = `${Date.now()}-${file.name}`;
      filepath = path.join(uploadsDir, filename);

      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      await writeFile(filepath, buffer);
    } else {
      // URL upload
      const body = await request.json();
      audioUrl = body.audioUrl;
      language = body.language;
      title = body.title;

      if (!audioUrl || !language || !title) {
        return NextResponse.json(
          { error: 'Missing required fields: audioUrl, language, title' },
          { status: 400 }
        );
      }

      // For URL uploads, we use the URL as the "filename" and set filepath to the URL
      filename = audioUrl;
      filepath = audioUrl;
    }

    const supabase = getSupabase();
    const { data: episode, error } = await supabase
      .from('episodes')
      .insert({ title, filename, file_path: filepath, language })
      .select('id')
      .single();
    if (error) throw error;

    const podcastId = episode.id;

    // Start background processing with Whisper
    processEpisode(podcastId, filepath, language).catch(() => {});

    return NextResponse.json({
      success: true,
      podcastId,
      message: 'Podcast added successfully. Processing with Whisper...'
    });

  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: 'Failed to upload podcast' },
      { status: 500 }
    );
  }
}
