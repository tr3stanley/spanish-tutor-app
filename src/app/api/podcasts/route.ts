import { NextResponse } from 'next/server';
import { fetchAllRows } from '@/lib/supabase';
import { getAuth, unauthorized } from '@/lib/auth';

interface EpisodeRow {
  [key: string]: unknown;
  folders: { name: string } | null;
  lessons: { id: number }[] | null;
}

export async function GET(request: Request) {
  try {
    const auth = await getAuth(request);
    if (!auth) return unauthorized();
    const { supabase } = auth;
    const [data, listenedRes] = await Promise.all([
      fetchAllRows<EpisodeRow>((from, to) =>
        supabase
          .from('episodes')
          .select('*, folders(name), lessons(id)')
          .order('created_at', { ascending: false })
          .range(from, to)
      ),
      // per-user listened flags (RLS scopes to the signed-in user)
      fetchAllRows<{ episode_id: number; listened: boolean; liked: boolean; position_seconds: number }>((from, to) =>
        supabase.from('user_episodes')
          .select('episode_id, listened, liked, position_seconds')
          .order('episode_id').range(from, to)
      ),
    ]);

    const progressById = new Map(listenedRes.map(r => [r.episode_id, r]));
    const podcasts = data.map(({ folders, lessons, ...episode }) => {
      const prog = progressById.get(episode.id as number);
      return {
      ...episode,
      listened: prog?.listened ?? false,
      liked: prog?.liked ?? false,
      position_seconds: prog?.position_seconds ?? 0,
      folder_name: folders?.name ?? null,
      has_lesson: (lessons?.length ?? 0) > 0 ? 1 : 0,
      };
    });

    return NextResponse.json({ podcasts });
  } catch (error) {
    console.error('Error fetching podcasts:', error);
    return NextResponse.json(
      { error: 'Failed to fetch podcasts' },
      { status: 500 }
    );
  }
}
