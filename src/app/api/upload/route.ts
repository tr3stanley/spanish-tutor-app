import { NextRequest, NextResponse } from 'next/server';
import { getAuth, unauthorized } from '@/lib/auth';
import { processEpisode } from '@/lib/processing';

export const maxDuration = 300;

const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuth(request);
    if (!auth) return unauthorized();
    const { supabase } = auth;

    const contentType = request.headers.get('content-type') || '';

    let language: 'spanish' | 'russian';
    let title: string;
    let filename: string;
    let filepath: string;

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const file = formData.get('file');
      language = formData.get('language') as 'spanish' | 'russian';
      title = formData.get('title') as string;

      if (!(file instanceof File) || !language || !title) {
        return NextResponse.json(
          { error: 'Missing required fields: file, language, title' },
          { status: 400 }
        );
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        return NextResponse.json({ error: 'File is larger than the 200MB limit' }, { status: 400 });
      }

      // Store in Supabase Storage — the local filesystem is read-only and
      // ephemeral on Vercel, which used to make file uploads fail in production.
      const safeName = file.name.replace(/[^\w.\-]+/g, '_').slice(-80);
      filename = `${Date.now()}-${safeName}`;
      const objectPath = `${auth.userId}/${filename}`;

      const { error: upError } = await supabase.storage
        .from('episode-audio')
        .upload(objectPath, new Uint8Array(await file.arrayBuffer()), {
          contentType: file.type || 'audio/mpeg',
          upsert: false,
        });
      if (upError) {
        console.error('Storage upload failed:', upError.message);
        return NextResponse.json({ error: 'Failed to store the audio file' }, { status: 500 });
      }

      filepath = supabase.storage.from('episode-audio').getPublicUrl(objectPath).data.publicUrl;
    } else {
      const body = await request.json();
      const audioUrl = body.audioUrl;
      language = body.language;
      title = body.title;

      if (!audioUrl || !language || !title) {
        return NextResponse.json(
          { error: 'Missing required fields: audioUrl, language, title' },
          { status: 400 }
        );
      }

      // For URL uploads the audio stays where it is; we only store the link.
      filename = audioUrl;
      filepath = audioUrl;
    }

    const { data: episode, error } = await supabase
      .from('episodes')
      .insert({ title, filename, file_path: filepath, language })
      .select('id')
      .single();
    if (error) throw error;

    const podcastId = episode.id;

    // On Vercel the function freezes once the response is sent, so the work has
    // to finish first (Groq is fast); locally we let whisper grind in the background.
    if (process.env.VERCEL) {
      await processEpisode(supabase, podcastId, filepath, language).catch(e => {
        console.error('Processing failed:', e);
      });
    } else {
      processEpisode(supabase, podcastId, filepath, language).catch(() => {});
    }

    return NextResponse.json({
      success: true,
      podcastId,
      message: 'Podcast added successfully. Processing transcript and lesson...'
    });

  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: 'Failed to upload podcast' },
      { status: 500 }
    );
  }
}
