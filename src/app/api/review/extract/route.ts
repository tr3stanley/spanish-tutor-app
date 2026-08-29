import { NextResponse } from 'next/server';
import { fetchAllRows } from '@/lib/supabase';
import { getAuth, unauthorized } from '@/lib/auth';
import { callOpenRouterChat } from '@/lib/ai';
import frequencyRanks from '@/data/es-frequency.json';

const BATCH = 3; // episodes per call — the client calls repeatedly until remaining = 0

const RANKS: Record<string, number> = frequencyRanks;

// Build the review queue source: extract vocabulary from listened episodes
// that don't have vocabulary_items yet.
export async function POST(request: Request) {
  try {
    const auth = await getAuth(request);
    if (!auth) return unauthorized();
    const { supabase } = auth;

    const [listenedRows, extracted] = await Promise.all([
      fetchAllRows<{ episode_id: number; episodes: { id: number; title: string; cefr_level: string | null } | { id: number; title: string; cefr_level: string | null }[] | null }>((from, to) =>
        supabase.from('user_episodes').select('episode_id, episodes(id, title, cefr_level)').eq('listened', true).order('episode_id').range(from, to)
      ),
      fetchAllRows<{ episode_id: number }>((from, to) =>
        supabase.from('vocabulary_items').select('episode_id').order('id').range(from, to)
      ),
    ]);

    const listened = listenedRows
      .map(r => (Array.isArray(r.episodes) ? r.episodes[0] : r.episodes))
      .filter((e): e is { id: number; title: string; cefr_level: string | null } => !!e);
    const extractedIds = new Set(extracted.map(v => v.episode_id));
    const pending = listened.filter(e => !extractedIds.has(e.id));

    if (pending.length === 0) {
      return NextResponse.json({ extracted: 0, remaining: 0, message: 'All listened episodes already have vocabulary.' });
    }

    let totalWords = 0;
    for (const episode of pending.slice(0, BATCH)) {
      const { data: segments } = await supabase
        .from('transcript_segments')
        .select('text')
        .eq('episode_id', episode.id)
        .order('start_time');

      const transcript = (segments || []).map(s => s.text).join(' ').slice(0, 12000);
      if (transcript.length < 100) continue;

      const raw = await callOpenRouterChat(
        [
          {
            role: 'user',
            content: `From this Spanish podcast transcript, extract the 12-15 vocabulary items most worth learning for a ${episode.cefr_level || 'B1'} student. Prioritize CONVERSATIONAL utility: words and expressions they'd actually say or hear in everyday conversation, including connectors and fillers (o sea, es que, la verdad, ¿verdad?) and common collocations. Skip trivial words (hola, casa), rare literary words, and proper nouns.

TRANSCRIPT:
${transcript}

Return ONLY JSON: {"items": [{"word": "<as it appears>", "lemma": "<dictionary form, lowercase>", "translation": "<English>", "part_of_speech": "<noun|verb|adjective|adverb|expression|...>", "example": "<short sentence from or based on the transcript>", "example_translation": "<English>"}]}`,
          },
        ],
        { json: true, temperature: 0.2, maxTokens: 2000, role: 'bulk', log: { supabase, feature: 'vocab_extraction' } }
      );

      try {
        const parsed = JSON.parse(raw.replace(/^```(json)?|```$/g, '').trim());
        const items = (parsed.items || [])
          .filter((i: { word?: string; lemma?: string; translation?: string }) => i.word && i.lemma && i.translation)
          .map((i: Record<string, string>) => ({
            word: i.word,
            lemma: i.lemma.toLowerCase().trim(),
            frequency_rank: RANKS[i.lemma.toLowerCase().trim()] ?? RANKS[i.word.toLowerCase().trim()] ?? null,
            translation: i.translation,
            part_of_speech: i.part_of_speech || null,
            cefr_level: episode.cefr_level || null,
            episode_id: episode.id,
            example: i.example || null,
            example_translation: i.example_translation || null,
          }));
        if (items.length > 0) {
          const { error } = await supabase.from('vocabulary_items').insert(items);
          if (error) throw new Error(error.message);
          totalWords += items.length;
        }
      } catch (e) {
        console.error(`Vocab extraction failed for episode ${episode.id}:`, e);
      }
    }

    return NextResponse.json({
      extracted: totalWords,
      remaining: Math.max(0, pending.length - BATCH),
    });
  } catch (error) {
    console.error('Extract error:', error);
    return NextResponse.json({ error: 'Failed to extract vocabulary' }, { status: 500 });
  }
}
