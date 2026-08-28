import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { callOpenRouterChat, ChatMessage } from '@/lib/ai';
import { buildStudentContext, tutorSystemPrompt, normalizeCategory } from '@/lib/tutor';

export async function GET() {
  try {
    const supabase = getSupabase();
    const { data } = await supabase
      .from('tutor_messages')
      .select('id, role, content, kind, created_at')
      .neq('kind', 'placement')
      .order('id', { ascending: false })
      .limit(50);
    return NextResponse.json({ messages: (data || []).reverse() });
  } catch (error) {
    console.error('Error fetching tutor history:', error);
    return NextResponse.json({ error: 'Failed to fetch history' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { message } = await request.json();
    if (!message?.trim()) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    const supabase = getSupabase();

    const [context, historyRes] = await Promise.all([
      buildStudentContext(),
      supabase
        .from('tutor_messages')
        .select('role, content')
        .order('id', { ascending: false })
        .limit(20),
    ]);

    const history = (historyRes.data || []).reverse() as ChatMessage[];

    const reply = await callOpenRouterChat([
      { role: 'system', content: tutorSystemPrompt(context) },
      ...history,
      { role: 'user', content: message.trim() },
    ]);

    const { error } = await supabase.from('tutor_messages').insert([
      { role: 'user', content: message.trim() },
      { role: 'assistant', content: reply },
    ]);
    if (error) console.error('Failed to save tutor messages:', error.message);

    await recordErrors(message.trim(), reply);

    return NextResponse.json({ response: reply });
  } catch (error) {
    console.error('Tutor chat error:', error);
    return NextResponse.json({ error: 'Failed to process message' }, { status: 500 });
  }
}

// Log corrections so future lessons and drills recycle the student's real mistakes.
async function recordErrors(studentMessage: string, tutorReply: string) {
  try {
    // Cheap heuristic gate: only run the extraction call when the student
    // actually wrote some Spanish-looking content.
    if (!/[áéíóúñ¿¡]|\b(el|la|los|que|es|un|una|yo|tu|de|en|mi|me|no|si|hola|gracias|pero|porque)\b/i.test(studentMessage)) {
      return;
    }

    const raw = await callOpenRouterChat(
      [
        {
          role: 'user',
          content: `A Spanish student wrote this message:
"${studentMessage}"

Their tutor replied (may contain corrections):
"${tutorReply.slice(0, 1500)}"

List ONLY genuine Spanish grammar/vocabulary errors in the STUDENT'S message (max 3). Ignore missing accents/ñ/punctuation (typed input) and ignore their English. If no real errors, return {"errors": []}.

Return ONLY JSON: {"errors": [{"error": "<exact quote from student>", "correction": "<corrected version>", "note": "<3-6 word label, e.g. 'preterite of ir'>", "category": "<one of: verb conjugation|gender/number agreement|ser vs estar|preterite vs imperfect|subjunctive|prepositions|word choice|word order|other>"}]}`,
        },
      ],
      { json: true, temperature: 0, maxTokens: 300 }
    );
    const parsed = JSON.parse(raw.replace(/^```(json)?|```$/g, '').trim());
    const rows = (parsed.errors || [])
      .filter((e: { error?: string; correction?: string }) => e.error && e.correction)
      .slice(0, 3)
      .map((e: { error: string; correction: string; note?: string; category?: string }) => ({
        error: e.error,
        correction: e.correction,
        note: e.note || null,
        category: normalizeCategory(e.category),
        source: 'chat',
      }));
    if (rows.length > 0) {
      const supabase = getSupabase();
      await supabase.from('error_log').insert(rows);
    }
  } catch (e) {
    console.error('Error extraction failed (non-fatal):', e);
  }
}
