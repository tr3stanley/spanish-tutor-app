import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/database';

export async function GET() {
  try {
    const db = await getDatabase();
    const folders = await db.all('SELECT * FROM folders ORDER BY name');
    return NextResponse.json({ folders });
  } catch (error) {
    console.error('Error fetching folders:', error);
    return NextResponse.json(
      { error: 'Failed to fetch folders' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { name } = await request.json();

    if (!name?.trim()) {
      return NextResponse.json({ error: 'Folder name is required' }, { status: 400 });
    }

    const db = await getDatabase();
    const result = await db.run('INSERT INTO folders (name) VALUES (?)', [name.trim()]);

    const folder = await db.get('SELECT * FROM folders WHERE id = ?', [result.lastID]);

    return NextResponse.json({ folder });
  } catch (error: any) {
    console.error('Error creating folder:', error);
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return NextResponse.json({ error: 'Folder name already exists' }, { status: 400 });
    }
    return NextResponse.json(
      { error: 'Failed to create folder' },
      { status: 500 }
    );
  }
}