import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { callOpenRouterChat } from '@/lib/ai';
import frequencyRanks from '@/data/es-frequency.json';

const RANKS: Record<string, number> = frequencyRanks;

export const maxDuration = 60;

// Extract vocabulary from a song's lyrics into the SRS review queue.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = getSupabase();

    const { data: song } = await supabase
      .from('songs')
      .select('id, title, artist, lyrics, cefr_level')
      .eq('id', id)
      .single();
    if (!song) return NextResponse.json({ error: 'Song not found' }, { status: 404 });
    if (!song.lyrics) return NextResponse.json({ error: 'This song has no lyrics saved' }, { status: 400 });

    const { count: existing } = await supabase
      .from('vocabulary_items')
      .select('id', { count: 'exact', head: true })
      .eq('song_id', id);
    if ((existing ?? 0) > 0) {
      return NextResponse.json({ added: 0, message: 'Vocabulary already extracted for this song — it’s in your review queue.' });
    }

    const raw = await callOpenRouterChat(
      [
        {
          role: 'user',
          content: `From these Spanish song lyrics ("${song.title}" by ${song.artist}), extract the 8-12 vocabulary items most worth learning for a ${song.cefr_level || 'B1'} student. Prioritize words and expressions with real conversational value — including slang and colloquialisms (mark where they're used in the translation, e.g. "chamba — work (Mexican slang)"). Skip trivial words, proper nouns, and purely poetic vocabulary nobody says in conversation.

LYRICS:
${song.lyrics.slice(0, 6000)}

Return ONLY JSON: {"items": [{"word": "<as it appears>", "lemma": "<dictionary form, lowercase>", "translation": "<English, with region tag if slang>", "part_of_speech": "<noun|verb|adjective|adverb|expression|...>", "example": "<the lyric line it appears in, or a short natural sentence>", "example_translation": "<English>"}]}`,
        },
      ],
      { json: true, temperature: 0.2, maxTokens: 2000 }
    );

    const parsed = JSON.parse(raw.replace(/^```(json)?|```$/g, '').trim());
    const items = (parsed.items || [])
      .filter((i: { word?: string; lemma?: string; translation?: string }) => i.word && i.lemma && i.translation)
      .map((i: Record<string, string>) => ({
        word: i.word,
        lemma: i.lemma.toLowerCase().trim(),
        frequency_rank: RANKS[i.lemma.toLowerCase().trim()] ?? RANKS[i.word.toLowerCase().trim()] ?? null,
        translation: i.translation,
        part_of_speech: i.part_of_speech || null,
        cefr_level: song.cefr_level || null,
        song_id: song.id,
        example: i.example || null,
        example_translation: i.example_translation || null,
      }));

    if (items.length > 0) {
      const { error } = await supabase.from('vocabulary_items').insert(items);
      if (error) throw new Error(error.message);
    }

    return NextResponse.json({ added: items.length });
  } catch (error) {
    console.error('Song vocab error:', error);
    return NextResponse.json({ error: 'Failed to extract vocabulary' }, { status: 500 });
  }
}
