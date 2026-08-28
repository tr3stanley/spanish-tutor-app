import { NextResponse } from 'next/server';
import { getSupabase, fetchAllRows } from '@/lib/supabase';

interface EpisodeRow {
  [key: string]: unknown;
  folders: { name: string } | null;
  lessons: { id: number }[] | null;
}

export async function GET() {
  try {
    const supabase = getSupabase();
    const data = await fetchAllRows<EpisodeRow>((from, to) =>
      supabase
        .from('episodes')
        .select('*, folders(name), lessons(id)')
        .order('created_at', { ascending: false })
        .range(from, to)
    );

    const podcasts = data.map(({ folders, lessons, ...episode }) => ({
      ...episode,
      folder_name: folders?.name ?? null,
      has_lesson: (lessons?.length ?? 0) > 0 ? 1 : 0,
    }));

    return NextResponse.json({ podcasts });
  } catch (error) {
    console.error('Error fetching podcasts:', error);
    return NextResponse.json(
      { error: 'Failed to fetch podcasts' },
      { status: 500 }
    );
  }
}
