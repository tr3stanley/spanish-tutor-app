import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { callOpenRouterChat, ChatMessage } from '@/lib/ai';
import { PLACEMENT_SYSTEM, generateSyllabus, normalizeCategory } from '@/lib/tutor';

// One placement interview turn. The client sends the whole interview so far;
// placement is ephemeral — only the final assessment is persisted (to user_profile).
export async function POST(request: NextRequest) {
  try {
    const { history } = await request.json() as { history: ChatMessage[] };

    const messages: ChatMessage[] = [
      { role: 'system', content: PLACEMENT_SYSTEM },
      ...(history || []),
    ];

    // First turn: have the interviewer open the conversation
    if (!history || history.length === 0) {
      messages.push({ role: 'user', content: "(The student has just opened the placement interview. Greet them and ask your first question.)" });
    }

    const reply = await callOpenRouterChat(messages, { temperature: 0.4 });

    // Detect the final assessment JSON
    const jsonMatch = reply.match(/\{[\s\S]*"done"\s*:\s*true[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const assessment = JSON.parse(jsonMatch[0]);
        const supabase = getSupabase();
        const { error } = await supabase.from('user_profile').upsert({
          user_id: '00000000-0000-0000-0000-000000000000',
          cefr_level: assessment.cefr,
          target_dialect: assessment.target_dialect,
          goals: assessment.goals || {},
          strengths: assessment.strengths || {},
          updated_at: new Date().toISOString(),
        });
        if (error) throw error;

        // Persist the interview transcript so it's auditable and the tutor
        // can reference the student's actual errors later.
        const closing = assessment.closing_message || '';
        const transcriptRows = [
          ...(history || []).map((m: ChatMessage) => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
            kind: 'placement',
          })),
          ...(closing ? [{ role: 'assistant' as const, content: closing, kind: 'placement' }] : []),
        ];
        const { error: saveError } = await supabase.from('tutor_messages').insert(transcriptRows);
        if (saveError) console.error('Failed to save placement transcript:', saveError.message);

        // Seed the error log from the evidence-backed gaps
        const gaps = Array.isArray(assessment.strengths?.gaps) ? assessment.strengths.gaps : [];
        const errorRows = gaps
          .filter((g: { evidence?: string }) => g && typeof g === 'object' && g.evidence)
          .map((g: { issue?: string; evidence: string; why?: string; category?: string }) => ({
            error: g.evidence,
            correction: null,
            note: [g.issue, g.why].filter(Boolean).join(': '),
            category: normalizeCategory(g.category),
            source: 'placement',
          }));
        if (errorRows.length > 0) {
          const { error: errLogError } = await supabase.from('error_log').insert(errorRows);
          if (errLogError) console.error('Failed to seed error log:', errLogError.message);
        }

        // Build the course syllabus from the fresh profile
        let unitCount = 0;
        try {
          unitCount = await generateSyllabus();
        } catch (syllabusError) {
          console.error('Syllabus generation failed (can retry from lesson flow):', syllabusError);
        }

        return NextResponse.json({
          done: true,
          syllabus_units: unitCount,
          assessment,
          message: assessment.closing_message ||
            `Placement complete — you're around ${assessment.cefr}. Let's get started!`,
        });
      } catch (parseError) {
        console.error('Placement JSON parse failed:', parseError);
        // Fall through and show the raw reply so the interview can continue
      }
    }

    return NextResponse.json({ done: false, message: reply });
  } catch (error) {
    console.error('Placement error:', error);
    return NextResponse.json({ error: 'Placement interview failed' }, { status: 500 });
  }
}
