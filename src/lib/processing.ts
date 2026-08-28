import { SupabaseClient } from '@supabase/supabase-js';
import { processAudioWithWhisper, TranscriptSegment } from '@/lib/whisper';
import { transcribeWithGroq } from '@/lib/groq-transcribe';
import { generateLessonPlan, callOpenRouterChat } from '@/lib/ai';

// CEFR level + topic + dialect, same contract as scripts/classify-supabase.mjs.
// Without this an uploaded episode has no level, so it misses the library's
// level filters and the tutor can't reason about its difficulty.
async function classifyEpisode(title: string, transcript: string) {
  try {
    const raw = await callOpenRouterChat(
      [
        {
          role: 'user',
          content: `You are classifying Spanish-language audio for a language-learning library.

TITLE: ${title}

TRANSCRIPT EXCERPT (auto-transcribed, may contain errors):
${transcript.slice(0, 6000)}

Return ONLY a JSON object, no markdown, no explanation:
{"cefr": "<A1|A2|B1|B2|C1|C2 - difficulty for a Spanish LEARNER>", "topic": "<2-4 word English topic label>", "dialect": "<mexican|castilian|rioplatense|caribbean|andean|central_american|neutral_latam|mixed|unknown>"}`,
        },
      ],
      { json: true, temperature: 0.1, maxTokens: 100 }
    );
    const p = JSON.parse(raw.replace(/^```(json)?|```$/g, '').trim());
    return {
      cefr_level: p.cefr || null,
      topic: p.topic || null,
      dialect: p.dialect || null,
      classified_at: new Date().toISOString(),
    };
  } catch (e) {
    console.error('Classification failed (non-fatal):', e);
    return null;
  }
}

// Local whisper-cli where it exists (the Mac, free); Groq whisper-large-v3-turbo
// on Vercel or when local transcription fails ($0.04/hr, needs GROQ_API_KEY).
async function transcribe(
  filepath: string,
  language: 'spanish' | 'russian'
): Promise<TranscriptSegment[]> {
  const hasGroq = !!process.env.GROQ_API_KEY;
  if (process.env.VERCEL) {
    if (!hasGroq) throw new Error('Transcription on Vercel requires GROQ_API_KEY');
    return transcribeWithGroq(filepath, language);
  }
  try {
    return await processAudioWithWhisper(filepath, language);
  } catch (error) {
    if (!hasGroq) throw error;
    console.log('Local Whisper failed, falling back to Groq:', error);
    return transcribeWithGroq(filepath, language);
  }
}

// Transcribe an episode, save segments + lesson, mark processed.
export async function processEpisode(
  supabase: SupabaseClient,
  episodeId: number,
  filepath: string,
  language: 'spanish' | 'russian'
): Promise<void> {
  try {
    console.log(`Processing episode ${episodeId}...`);

    const segments = await transcribe(filepath, language);

    const { error: segError } = await supabase.from('transcript_segments').insert(
      segments.map(s => ({
        episode_id: episodeId,
        text: s.text,
        start_time: s.start,
        end_time: s.end,
        confidence: s.confidence || 0.5,
      }))
    );
    if (segError) throw new Error(`saving segments: ${segError.message}`);

    const fullTranscript = segments.map(s => s.text).join(' ');

    const { data: episode } = await supabase
      .from('episodes')
      .select('title, cefr_level')
      .eq('id', episodeId)
      .maybeSingle();

    const [lesson, tags] = await Promise.all([
      generateLessonPlan(fullTranscript, language),
      // Spanish-only: the classifier's levels and dialects don't apply to Russian.
      language === 'spanish' && !episode?.cefr_level
        ? classifyEpisode(episode?.title || '', fullTranscript)
        : Promise.resolve(null),
    ]);

    const { error: lessonError } = await supabase.from('lessons').insert({
      episode_id: episodeId,
      summary: lesson.summary,
      grammar_rules: lesson.grammarRules,
      vocabulary: lesson.vocabulary,
    });
    if (lessonError) throw new Error(`saving lesson: ${lessonError.message}`);

    await supabase
      .from('episodes')
      .update({ processed_at: new Date().toISOString(), lesson_generated: true, ...(tags || {}) })
      .eq('id', episodeId);

    console.log(`Episode ${episodeId} processed successfully!`);
  } catch (error) {
    console.error(`Error processing episode ${episodeId}:`, error);
    await supabase
      .from('episodes')
      .update({ processed_at: new Date().toISOString() })
      .eq('id', episodeId);
    throw error;
  }
}
