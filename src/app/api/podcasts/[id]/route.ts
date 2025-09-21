import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/database';
import fs from 'fs/promises';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = await getDatabase();
    const podcastId = parseInt(id);

    // Get podcast details
    const podcast = await db.get(
      'SELECT * FROM podcasts WHERE id = ?',
      [podcastId]
    );

    if (!podcast) {
      return NextResponse.json(
        { error: 'Podcast not found' },
        { status: 404 }
      );
    }

    // Get transcript
    const transcript = await db.all(
      'SELECT * FROM transcripts WHERE podcast_id = ? ORDER BY start_time',
      [podcastId]
    );

    // Get lesson
    const lesson = await db.get(
      'SELECT * FROM lessons WHERE podcast_id = ?',
      [podcastId]
    );

    // Get explanations
    const explanations = await db.all(
      'SELECT * FROM explanations WHERE podcast_id = ? ORDER BY start_time',
      [podcastId]
    );

    return NextResponse.json({
      podcast,
      transcript,
      lesson,
      explanations
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
    const db = await getDatabase();
    const podcastId = parseInt(id);

    // Get podcast file path before deleting
    const podcast = await db.get(
      'SELECT file_path FROM podcasts WHERE id = ?',
      [podcastId]
    );

    if (!podcast) {
      return NextResponse.json(
        { error: 'Podcast not found' },
        { status: 404 }
      );
    }

    // Delete related data first (foreign key constraints)
    await db.run('DELETE FROM explanations WHERE podcast_id = ?', [podcastId]);
    await db.run('DELETE FROM lessons WHERE podcast_id = ?', [podcastId]);
    await db.run('DELETE FROM transcripts WHERE podcast_id = ?', [podcastId]);

    // Delete the podcast record
    await db.run('DELETE FROM podcasts WHERE id = ?', [podcastId]);

    // Delete the audio file
    try {
      if (podcast.file_path) {
        await fs.unlink(podcast.file_path);
      }
    } catch (fileError) {
      console.log('Could not delete audio file:', fileError);
      // Don't fail the request if file deletion fails
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