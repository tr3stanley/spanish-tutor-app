import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { callOpenRouterChat } from '@/lib/ai';
import { getProfile, dialectInstructions } from '@/lib/tutor';

export const maxDuration = 120;

// Generate (or regenerate) the LLM study sheet for a song: what it's saying,
// line-by-line translation, region-tagged slang, cultural notes.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = getSupabase();

    const [{ data: song }, profile] = await Promise.all([
      supabase.from('songs').select('id, title, artist, lyrics').eq('id', id).single(),
      getProfile(),
    ]);
    if (!song) return NextResponse.json({ error: 'Song not found' }, { status: 404 });
    if (!song.lyrics) return NextResponse.json({ error: 'This song has no lyrics saved' }, { status: 400 });

    const raw = await callOpenRouterChat(
      [
        {
          role: 'user',
          content: `You are a Spanish tutor making a study sheet for the song "${song.title}" by ${song.artist}, for a ${profile?.cefr_level || 'B1'} student. ${dialectInstructions(profile?.target_dialect || null)}

LYRICS:
${song.lyrics.slice(0, 6000)}

Return ONLY JSON with this shape:
{
  "about": "<2-3 sentences in English: what the song is actually saying — its story, tone, and meaning>",
  "region": "<where this style of Spanish is from: Mexico, Caribbean, Spain, Argentina, Colombia, Neutral, etc.>",
  "cefr_level": "<A1|A2|B1|B2|C1|C2 — difficulty of the lyrics>",
  "lines": [{"es": "<lyric line>", "en": "<natural English translation>", "note": "<OPTIONAL: grammar/usage worth noticing in this line — omit the key when there's nothing>"}],
  "slang": [{"term": "<slang word or phrase from the song>", "region": "<where it's used>", "meaning": "<English meaning, plus literal meaning if different>"}],
  "culture": ["<cultural reference, genre context, or backstory note in English>"]
}

Rules:
- Cover the lyrics in order in "lines". For a repeated chorus, include it fully once, then represent repeats with {"es": "[Coro se repite]", "en": "[Chorus repeats]"}.
- "slang" only gets genuinely regional/colloquial items (empty array is fine).
- 2-4 "culture" notes.`,
        },
      ],
      { json: true, temperature: 0.3, maxTokens: 8000 }
    );

    const sheet = JSON.parse(raw.replace(/^```(json)?|```$/g, '').trim());
    if (!sheet.about || !Array.isArray(sheet.lines)) {
      throw new Error('Malformed study sheet from model');
    }

    const { error } = await supabase
      .from('songs')
      .update({
        study_sheet: sheet,
        region: sheet.region || null,
        cefr_level: sheet.cefr_level || null,
      })
      .eq('id', id);
    if (error) throw error;

    return NextResponse.json({ study_sheet: sheet, region: sheet.region || null, cefr_level: sheet.cefr_level || null });
  } catch (error) {
    console.error('Study sheet error:', error);
    return NextResponse.json({ error: 'Failed to generate study sheet' }, { status: 500 });
  }
}
