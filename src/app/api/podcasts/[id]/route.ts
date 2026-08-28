import { NextRequest, NextResponse } from 'next/server';
import { fetchAllRows, TranscriptSegment } from '@/lib/supabase';
import { getAuth, unauthorized } from '@/lib/auth';
import fs from 'fs/promises';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await getAuth(request);
    if (!auth) return unauthorized();
    const { supabase } = auth;
    const podcastId = parseInt(id);

    const { data: podcast } = await supabase
      .from('episodes')
      .select('*')
      .eq('id', podcastId)
      .maybeSingle();

    if (!podcast) {
      return NextResponse.json(
        { error: 'Podcast not found' },
        { status: 404 }
      );
    }

    const [transcript, { data: lesson }, { data: explanations }] =
      await Promise.all([
        fetchAllRows<TranscriptSegment>((from, to) =>
          supabase
            .from('transcript_segments')
            .select('*')
            .eq('episode_id', podcastId)
            .order('start_time')
            .range(from, to)
        ),
        supabase
          .from('lessons')
          .select('*')
          .eq('episode_id', podcastId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('explanations')
          .select('*')
          .eq('episode_id', podcastId)
          .order('start_time'),
      ]);

    return NextResponse.json({
      podcast,
      transcript,
      lesson,
      explanations: explanations || []
    });

  } catch (error) {
    console.error('Error fetching podcast details:', error);
    return NextResponse.json(
      { error: 'Failed to fetch podcast details' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await getAuth(request);
    if (!auth) return unauthorized();
    const { supabase } = auth;
    const podcastId = parseInt(id);

    const { data: podcast } = await supabase
      .from('episodes')
      .select('file_path')
      .eq('id', podcastId)
      .maybeSingle();

    if (!podcast) {
      return NextResponse.json(
        { error: 'Podcast not found' },
        { status: 404 }
      );
    }

    // Related rows cascade in Postgres
    const { error } = await supabase.from('episodes').delete().eq('id', podcastId);
    if (error) throw error;

    // Delete the local audio file if there is one (file_path may be a URL)
    try {
      if (podcast.file_path && !podcast.file_path.startsWith('http')) {
        await fs.unlink(podcast.file_path);
      }
    } catch (fileError) {
      console.log('Could not delete audio file:', fileError);
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Error deleting podcast:', error);
    return NextResponse.json(
      { error: 'Failed to delete podcast' },
      { status: 500 }
    );
  }
}
