import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { callOpenRouterChat } from '@/lib/ai';
import { buildStudentContext, tutorSystemPrompt, generateSyllabus } from '@/lib/tutor';

// Generate the next lesson. Without a requested topic it walks the course
// syllabus: the current in_progress unit is marked done and the next pending
// unit becomes the lesson. Lessons follow a fixed conversational shape:
// error review -> concept -> drills -> role-play.
export async function POST(request: NextRequest) {
  try {
    const { topic } = await request.json().catch(() => ({ topic: undefined }));
    const supabase = getSupabase();

    let unit: { id: number; position: number; block: number; title: string; description: string | null; cefr_level: string | null; status: string } | null = null;
    let unitCount = 0;
    let continuation = false;

    if (!topic?.trim()) {
      let { data: units } = await supabase.from('course_units').select('*').order('position');

      if (!units || units.length === 0) {
        // Profile predates the syllabus feature (or generation failed after placement)
        await generateSyllabus();
        ({ data: units } = await supabase.from('course_units').select('*').order('position'));
      }
      units = units || [];

      // A unit stays in_progress across lessons until the student completes it.
      unit = units.find(u => u.status === 'in_progress') || units.find(u => u.status === 'pending') || null;

      if (!unit) {
        // Block finished — generate the next one from current errors and level
        const lastBlock = Math.max(0, ...units.map(u => u.block ?? 1));
        await generateSyllabus(lastBlock + 1);
        ({ data: units } = await supabase.from('course_units').select('*').order('position'));
        units = units || [];
        unit = units.find(u => u.status === 'pending') || null;
        if (!unit) throw new Error('Next block generated no units');
      }

      continuation = unit.status === 'in_progress';
      unitCount = units.length;
      if (!continuation) {
        await supabase.from('course_units').update({ status: 'in_progress' }).eq('id', unit.id);
      }
    }

    const context = await buildStudentContext();

    const directive = unit
      ? `Today's lesson is Unit ${unit.position} of your course syllabus: "${unit.title}"${unit.description ? ` (${unit.description})` : ''}.${continuation ? ' The student has already had at least one lesson on this unit but has not mastered it yet — this is a CONTINUATION: use fresh examples, fresh drills, and a different role-play scene for the same milestone. Do not repeat the previous lesson.' : ''}`
      : `Design today's lesson on this topic the student requested: "${topic.trim()}".`;

    const raw = await callOpenRouterChat(
      [
        { role: 'system', content: tutorSystemPrompt(context) },
        {
          role: 'user',
          content: `${directive}

Build the lesson in this EXACT shape (it's optimized for getting conversational fast):
1. REPASO (2 min): if the student has recorded errors, open with 1-2 quick retrieval questions that re-test their most relevant recorded errors. Skip if none.
2. THE POINT: teach ONE concept or phrase set needed for this milestone, with 2-3 translated examples. Short.
3. DRILLS: 3-4 numbered production exercises (translate / fill in / answer), climbing in difficulty.
4. ROLE-PLAY: set a concrete scene for this milestone, assign yourself a character (waiter, taxi driver, neighbor...), give the student their role, then deliver YOUR OPENING LINE IN CHARACTER in Spanish (translated). Tell the student to answer the drills first, then reply to the character to start the scene.

Return ONLY JSON: {"topic": "<short lesson name>", "lesson": "<the full lesson as plain text with the 4 sections>"}`,
        },
      ],
      { json: true, maxTokens: 2500 }
    );

    const parsed = JSON.parse(raw.replace(/^```(json)?|```$/g, '').trim());
    if (!parsed.topic || !parsed.lesson) throw new Error('Malformed lesson JSON');

    const { data: profile } = await supabase.from('user_profile').select('cefr_level').maybeSingle();

    const [{ error: lessonError }, { error: msgError }] = await Promise.all([
      supabase.from('tutor_lessons').insert({
        topic: unit ? `Unit ${unit.position}: ${unit.title}` : parsed.topic,
        cefr_level: unit?.cefr_level || profile?.cefr_level || null,
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

    return NextResponse.json({
      topic: parsed.topic,
      lesson: parsed.lesson,
      unit: unit ? { position: unit.position, title: unit.title, total: unitCount } : null,
    });
  } catch (error) {
    console.error('Lesson generation error:', error);
    return NextResponse.json({ error: 'Failed to generate lesson' }, { status: 500 });
  }
}
