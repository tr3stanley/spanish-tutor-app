import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/database';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { name } = await request.json();

    if (!name?.trim()) {
      return NextResponse.json({ error: 'Folder name is required' }, { status: 400 });
    }

    const db = await getDatabase();
    await db.run('UPDATE folders SET name = ? WHERE id = ?', [name.trim(), parseInt(id)]);

    const folder = await db.get('SELECT * FROM folders WHERE id = ?', [parseInt(id)]);

    if (!folder) {
      return NextResponse.json({ error: 'Folder not found' }, { status: 404 });
    }

    return NextResponse.json({ folder });
  } catch (error: any) {
    console.error('Error updating folder:', error);
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return NextResponse.json({ error: 'Folder name already exists' }, { status: 400 });
    }
    return NextResponse.json(
      { error: 'Failed to update folder' },
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

    // Check if folder has podcasts
    const podcastCount = await db.get(
      'SELECT COUNT(*) as count FROM podcasts WHERE folder_id = ?',
      [parseInt(id)]
    );

    if (podcastCount.count > 0) {
      return NextResponse.json(
        { error: 'Cannot delete folder with podcasts. Move podcasts to another folder first.' },
        { status: 400 }
      );
    }

    await db.run('DELETE FROM folders WHERE id = ?', [parseInt(id)]);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting folder:', error);
    return NextResponse.json(
      { error: 'Failed to delete folder' },
      { status: 500 }
    );
  }
}