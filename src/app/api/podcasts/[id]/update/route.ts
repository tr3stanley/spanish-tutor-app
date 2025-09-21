import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/database';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { folder_id, listened } = await request.json();

    // In production (Vercel), the database is read-only, so podcast updates are disabled
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json(
        { error: 'Podcast updates are disabled in production (read-only database)' },
        { status: 403 }
      );
    }

    const db = await getDatabase();

    const updates = [];
    const values = [];

    if (folder_id !== undefined) {
      updates.push('folder_id = ?');
      values.push(folder_id);
    }

    if (listened !== undefined) {
      updates.push('listened = ?');
      values.push(listened ? 1 : 0);
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'No updates provided' }, { status: 400 });
    }

    values.push(parseInt(id));

    await db.run(
      `UPDATE podcasts SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    const podcast = await db.get('SELECT * FROM podcasts WHERE id = ?', [parseInt(id)]);

    if (!podcast) {
      return NextResponse.json({ error: 'Podcast not found' }, { status: 404 });
    }

    return NextResponse.json({ podcast });
  } catch (error: any) {
    console.error('Error updating podcast:', error);
    if (error.code === 'SQLITE_READONLY') {
      return NextResponse.json(
        { error: 'Database is read-only. Podcast management is only available in local development.' },
        { status: 403 }
      );
    }
    return NextResponse.json(
      { error: 'Failed to update podcast' },
      { status: 500 }
    );
  }
}