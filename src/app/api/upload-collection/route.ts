import { NextRequest, NextResponse } from 'next/server';
import { SupabaseClient } from '@supabase/supabase-js';
import { getAuth, unauthorized } from '@/lib/auth';
import { processEpisode } from '@/lib/processing';

export const maxDuration = 300;

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

    const auth = await getAuth(request);
    if (!auth) return unauthorized();
    const { supabase } = auth;

    const rows = (files as CollectionFile[]).map(file => {
      const title = file.title || file.name.replace(/\.[^/.]+$/, '');
      return {
        title: files.length === 1 ? baseTitle : `${baseTitle} - ${title}`,
        filename: file.name,
        file_path: file.url,
        language,
      };
    });

    const { data: inserted, error } = await supabase
      .from('episodes')
      .insert(rows)
      .select('id');
    if (error) throw error;

    const podcastIds = (inserted || []).map(e => e.id);

    // On Vercel the function freezes after the response, so await the work
    // there (Groq is fast); locally, fire-and-forget while whisper grinds.
    if (process.env.VERCEL) {
      await processBatchInBackground(supabase, files, podcastIds, language);
    } else {
      processBatchInBackground(supabase, files, podcastIds, language);
    }

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
  supabase: SupabaseClient,
  files: CollectionFile[],
  podcastIds: number[],
  language: 'spanish' | 'russian'
) {
  const BATCH_SIZE = 5; // Process 5 files at a time

  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    const batch = files.slice(i, i + BATCH_SIZE);
    const batchIds = podcastIds.slice(i, i + BATCH_SIZE);

    console.log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1} of ${Math.ceil(files.length / BATCH_SIZE)}`);

    const promises = batch.map((file, index) => {
      const podcastId = batchIds[index];
      if (podcastId) {
        return processEpisode(supabase, podcastId, file.url, language).catch(() => {});
      }
      return Promise.resolve();
    });

    await Promise.allSettled(promises);

    // Small delay between batches to avoid overwhelming the system
    if (i + BATCH_SIZE < files.length) {
      console.log('Waiting 2 seconds before next batch...');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  console.log('All batches completed!');
}
