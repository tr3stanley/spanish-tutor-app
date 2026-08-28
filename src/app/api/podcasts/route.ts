import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';

export async function GET() {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('episodes')
      .select('*, folders(name), lessons(id)')
      .order('created_at', { ascending: false });

    if (error) throw error;

    const podcasts = (data || []).map(({ folders, lessons, ...episode }) => ({
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
