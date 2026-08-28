import { getSupabase } from '@/lib/supabase';
import { processAudioWithWhisper } from '@/lib/whisper';
import { generateLessonPlan } from '@/lib/ai';

// Transcribe an episode with local Whisper, save segments + lesson, mark processed.
// Runs only where whisper-cpp exists (local Mac), not on Vercel.
export async function processEpisode(
  episodeId: number,
  filepath: string,
  language: 'spanish' | 'russian'
): Promise<void> {
  const supabase = getSupabase();

  try {
    console.log(`Processing episode ${episodeId} with Whisper...`);

    const segments = await processAudioWithWhisper(filepath, language);

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
