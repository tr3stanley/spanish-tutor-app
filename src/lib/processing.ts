import { SupabaseClient } from '@supabase/supabase-js';
import { processAudioWithWhisper, TranscriptSegment } from '@/lib/whisper';
import { transcribeWithGroq } from '@/lib/groq-transcribe';
import { generateLessonPlan } from '@/lib/ai';

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
    const lesson = await generateLessonPlan(fullTranscript, language);

    const { error: lessonError } = await supabase.from('lessons').insert({
      episode_id: episodeId,
      summary: lesson.summary,
      grammar_rules: lesson.grammarRules,
      vocabulary: lesson.vocabulary,
    });
    if (lessonError) throw new Error(`saving lesson: ${lessonError.message}`);

    await supabase
      .from('episodes')
      .update({ processed_at: new Date().toISOString(), lesson_generated: true })
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
