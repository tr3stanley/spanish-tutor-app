import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { callOpenRouterChat } from '@/lib/ai';
import { buildStudentContext, tutorSystemPrompt } from '@/lib/tutor';

// Generate the next lesson. It is logged to tutor_lessons (so future lessons
// build on it) and appended to the chat thread, where the student works
// through the exercises with the tutor.
export async function POST(request: NextRequest) {
  try {
    const { topic } = await request.json().catch(() => ({ topic: undefined }));

    const context = await buildStudentContext();

    const directive = topic?.trim()
      ? `Design today's lesson on this topic the student requested: "${topic.trim()}".`
      : `Pick the single most useful next topic for this student — favor their listed gaps, build on previous lessons without repeating them, and stay at their level.`;

    const raw = await callOpenRouterChat(
      [
        { role: 'system', content: tutorSystemPrompt(context) },
        {
          role: 'user',
          content: `${directive}

Return ONLY a JSON object:
{"topic": "<short topic name, e.g. 'Preterite vs imperfect'>", "lesson": "<the full lesson as markdown-lite text: a short explanation with examples (translated), then 4-6 numbered exercises for the student to answer in the chat. End by telling them to answer the exercises one at a time.>"}`,
        },
      ],
      { json: true, maxTokens: 2500 }
    );

    const parsed = JSON.parse(raw.replace(/^```(json)?|```$/g, '').trim());
    if (!parsed.topic || !parsed.lesson) throw new Error('Malformed lesson JSON');

    const supabase = getSupabase();
    const { data: profile } = await supabase.from('user_profile').select('cefr_level').maybeSingle();

    const [{ error: lessonError }, { error: msgError }] = await Promise.all([
      supabase.from('tutor_lessons').insert({
        topic: parsed.topic,
        cefr_level: profile?.cefr_level || null,
        content: parsed.lesson,
      }),
      supabase.from('tutor_messages').insert({
        role: 'assistant',
        content: parsed.lesson,
        kind: 'lesson',
      }),
    ]);
    if (lessonError) console.error('Failed to save lesson:', lessonError.message);
    if (msgError) console.error('Failed to save lesson message:', msgError.message);

    return NextResponse.json({ topic: parsed.topic, lesson: parsed.lesson });
  } catch (error) {
    console.error('Lesson generation error:', error);
    return NextResponse.json({ error: 'Failed to generate lesson' }, { status: 500 });
  }
}
