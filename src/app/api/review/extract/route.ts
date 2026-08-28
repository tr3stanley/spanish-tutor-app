import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { callOpenRouterChat } from '@/lib/ai';

const BATCH = 3; // episodes per call — the client calls repeatedly until remaining = 0

// Build the review queue source: extract vocabulary from listened episodes
// that don't have vocabulary_items yet.
export async function POST() {
  try {
    const supabase = getSupabase();

    const [{ data: listened }, { data: extracted }] = await Promise.all([
      supabase
        .from('episodes')
        .select('id, title, cefr_level')
        .eq('listened', true)
        .order('id'),
      supabase.from('vocabulary_items').select('episode_id'),
    ]);

    const extractedIds = new Set((extracted || []).map(v => v.episode_id));
    const pending = (listened || []).filter(e => !extractedIds.has(e.id));

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
            content: `From this Spanish podcast transcript, extract the 12-15 vocabulary items most worth learning for a ${episode.cefr_level || 'B1'} student: useful words and expressions, not trivial ones (no "hola", "casa") and not proper nouns.

TRANSCRIPT:
${transcript}

Return ONLY JSON: {"items": [{"word": "<as it appears>", "lemma": "<dictionary form, lowercase>", "translation": "<English>", "part_of_speech": "<noun|verb|adjective|adverb|expression|...>", "example": "<short sentence from or based on the transcript>", "example_translation": "<English>"}]}`,
          },
        ],
        { json: true, temperature: 0.2, maxTokens: 2000 }
      );

      try {
        const parsed = JSON.parse(raw.replace(/^```(json)?|```$/g, '').trim());
        const items = (parsed.items || [])
          .filter((i: { word?: string; lemma?: string; translation?: string }) => i.word && i.lemma && i.translation)
          .map((i: Record<string, string>) => ({
            word: i.word,
            lemma: i.lemma.toLowerCase().trim(),
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
