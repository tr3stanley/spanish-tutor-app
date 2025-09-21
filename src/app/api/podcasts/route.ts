import { NextResponse } from 'next/server';
import { getDatabase } from '@/lib/database';

export async function GET() {
  try {
    const db = await getDatabase();
    const podcasts = await db.all(`
      SELECT
        p.*,
        CASE WHEN l.id IS NOT NULL THEN 1 ELSE 0 END as has_lesson
      FROM podcasts p
      LEFT JOIN lessons l ON p.id = l.podcast_id
      ORDER BY p.created_at DESC
    `);

    return NextResponse.json({ podcasts });
  } catch (error) {
    console.error('Error fetching podcasts:', error);
    return NextResponse.json(
      { error: 'Failed to fetch podcasts' },
      { status: 500 }
    );
  }
}