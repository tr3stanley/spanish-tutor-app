import { NextResponse } from 'next/server';
import { SupabaseClient } from '@supabase/supabase-js';
import { getAuth, unauthorized } from '@/lib/auth';
import { processEpisode } from '@/lib/processing';

export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const auth = await getAuth(request);
    if (!auth) return unauthorized();
    const { supabase } = auth;

    // Episodes with no transcript segments = failed processing
    const { data: failedPodcasts, error } = await supabase.rpc('episodes_missing_transcripts');
    if (error) throw new Error(error.message);

    console.log(`Found ${failedPodcasts.length} podcasts to reprocess`);

    if (failedPodcasts.length > 20) {
      return NextResponse.json(
        { error: `Refusing to reprocess ${failedPodcasts.length} episodes at once — that many missing transcripts almost certainly means a query bug, not failed processing.` },
        { status: 500 }
      );
    }

    if (failedPodcasts.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No failed podcasts to reprocess'
      });
    }

    if (process.env.VERCEL) {
      await reprocessBatchInBackground(supabase, failedPodcasts.slice(0, 5));
    } else {
      reprocessBatchInBackground(supabase, failedPodcasts);
    }

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

interface FailedEpisode {
  id: number;
  title: string;
  file_path: string;
  language: 'spanish' | 'russian';
}

async function reprocessBatchInBackground(supabase: SupabaseClient, podcasts: FailedEpisode[]) {
  const BATCH_SIZE = 2; // Process 2 files at a time for better success rate

  for (let i = 0; i < podcasts.length; i += BATCH_SIZE) {
    const batch = podcasts.slice(i, i + BATCH_SIZE);

    console.log(`Reprocessing batch ${Math.floor(i / BATCH_SIZE) + 1} of ${Math.ceil(podcasts.length / BATCH_SIZE)}`);

    await Promise.allSettled(
      batch.map(p => processEpisode(supabase, p.id, p.file_path, p.language).catch(() => {}))
    );

    if (i + BATCH_SIZE < podcasts.length) {
      console.log('Waiting 2 seconds before next batch...');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  console.log('All reprocessing batches completed!');
}
