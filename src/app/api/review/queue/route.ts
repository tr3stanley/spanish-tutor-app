import { NextResponse } from 'next/server';
import { fetchAllRows } from '@/lib/supabase';
import { getAuth, unauthorized } from '@/lib/auth';

const QUEUE_SIZE = 20;

interface VocabRow {
  [key: string]: unknown;
  lemma: string;
  // many-to-one joins; supabase-js types them as arrays without generated types
  episodes?: { title?: string } | { title?: string }[] | null;
  songs?: { title?: string; artist?: string } | { title?: string; artist?: string }[] | null;
}

// The review queue: cards due for review first, then new (never-reviewed) words.
export async function GET(request: Request) {
  try {
    const auth = await getAuth(request);
    if (!auth) return unauthorized();
    const { supabase } = auth;

    const [items, knownRows] = await Promise.all([
      fetchAllRows<VocabRow>((from, to) =>
        supabase
          .from('vocabulary_items')
          .select('id, word, lemma, translation, part_of_speech, cefr_level, example, example_translation, episode_id, episodes(title), songs(title, artist)')
          .order('id')
          .range(from, to)
      ),
      fetchAllRows<{ lemma: string; status: string; srs_due_at: string | null }>((from, to) =>
        supabase.from('known_words').select('lemma, status, srs_due_at').order('lemma').range(from, to)
      ),
    ]);

    const known = new Map(knownRows.map(k => [k.lemma, k]));
    const now = new Date().toISOString();

    // One card per lemma — keep the first occurrence (richest source doesn't matter much)
    const byLemma = new Map<string, VocabRow>();
    for (const item of items) {
      if (!byLemma.has(item.lemma)) byLemma.set(item.lemma, item);
    }

    const due: VocabRow[] = [];
    const fresh: VocabRow[] = [];
    for (const [lemma, item] of byLemma) {
      const k = known.get(lemma);
      if (k?.status === 'known' || k?.status === 'ignored') continue;
      const ep = Array.isArray(item.episodes) ? item.episodes[0] : item.episodes;
      const song = Array.isArray(item.songs) ? item.songs[0] : item.songs;
      const sourceTitle = ep?.title ?? (song ? `🎵 ${song.title} — ${song.artist}` : null);
      const card = { ...item, episode_title: sourceTitle, episodes: undefined, songs: undefined };
      if (!k) fresh.push(card);
      else if (!k.srs_due_at || k.srs_due_at <= now) due.push(card);
    }

    // New words: most frequent (most conversationally useful) first
    fresh.sort((a, b) => ((a.frequency_rank as number) ?? 99999) - ((b.frequency_rank as number) ?? 99999));

    const queue = [...due, ...fresh].slice(0, QUEUE_SIZE);

    return NextResponse.json({
      queue,
      counts: { due: due.length, new: fresh.length, total_vocab: byLemma.size },
    });
  } catch (error) {
    console.error('Queue error:', error);
    return NextResponse.json({ error: 'Failed to fetch review queue' }, { status: 500 });
  }
}
