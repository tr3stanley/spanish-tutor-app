import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/database';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // In production (Vercel), the database is read-only
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json(
        { error: 'Podcast updates are disabled in production (read-only database)' },
        { status: 403 }
      );
    }

    const db = await getDatabase();

    // Mark podcast as listened
    await db.run(
      'UPDATE podcasts SET listened = 1 WHERE id = ?',
      [parseInt(id)]
    );

    // Get the updated podcast
    const podcast = await db.get('SELECT * FROM podcasts WHERE id = ?', [parseInt(id)]);

    if (!podcast) {
      return NextResponse.json({ error: 'Podcast not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      podcast,
      message: 'Podcast marked as listened. Offline file will be auto-removed in 24 hours.'
    });
  } catch (error: any) {
    console.error('Error marking podcast as listened:', error);
    if (error.code === 'SQLITE_READONLY') {
      return NextResponse.json(
        { error: 'Database is read-only. Podcast management is only available in local development.' },
        { status: 403 }
      );
    }
    return NextResponse.json(
      { error: 'Failed to mark podcast as listened' },
      { status: 500 }
    );
  }
}