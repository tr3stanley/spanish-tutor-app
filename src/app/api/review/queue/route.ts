import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';

const QUEUE_SIZE = 20;

// The review queue: cards due for review first, then new (never-reviewed) words.
export async function GET() {
  try {
    const supabase = getSupabase();

    const [{ data: items }, { data: knownRows }] = await Promise.all([
      supabase
        .from('vocabulary_items')
        .select('id, word, lemma, translation, part_of_speech, cefr_level, example, example_translation, episode_id, episodes(title)')
        .order('id'),
      supabase.from('known_words').select('lemma, status, srs_due_at'),
    ]);

    const known = new Map((knownRows || []).map(k => [k.lemma, k]));
    const now = new Date().toISOString();

    // One card per lemma — keep the first occurrence (richest source doesn't matter much)
    const byLemma = new Map<string, NonNullable<typeof items>[number]>();
    for (const item of items || []) {
      if (!byLemma.has(item.lemma)) byLemma.set(item.lemma, item);
    }

    const due: unknown[] = [];
    const fresh: unknown[] = [];
    for (const [lemma, item] of byLemma) {
      const k = known.get(lemma);
      if (k?.status === 'known' || k?.status === 'ignored') continue;
      const card = { ...item, episode_title: (item as { episodes?: { title?: string } }).episodes?.title ?? null, episodes: undefined };
      if (!k) fresh.push(card);
      else if (!k.srs_due_at || k.srs_due_at <= now) due.push(card);
    }

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
