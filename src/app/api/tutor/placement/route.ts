import { NextRequest, NextResponse } from 'next/server';
import { getAuth, unauthorized } from '@/lib/auth';
import { callOpenRouterChat, ChatMessage } from '@/lib/ai';
import { PLACEMENT_SYSTEM, generateSyllabus, normalizeCategory } from '@/lib/tutor';

const MIN_TASKS = 7;

interface PlacementTurn {
  role: 'user' | 'assistant';
  content: string;
  notes?: string;
}

// A student turn counts as a completed task once it actually contains Spanish —
// their opening answers about goals are in English and shouldn't count.
const SPANISH_HINT = /[áéíóúñ¿¡]|\b(el|la|los|las|un|una|es|son|está|estoy|que|de|en|por|para|con|mi|me|yo|muy|pero|porque|cuando|creo|tengo|fui|era|gusta|hay|más)\b/i;

function countSpanishAnswers(history: PlacementTurn[]): number {
  return history.filter(m => m.role === 'user' && SPANISH_HINT.test(m.content)).length;
}

// One placement interview turn. The client sends the whole interview so far;
// placement is ephemeral — only the final assessment is persisted (to user_profile).
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuth(request);
    if (!auth) return unauthorized();
    const { supabase } = auth;
    const logCtx = { supabase, feature: 'placement' };

    const { history } = await request.json() as { history: PlacementTurn[] };

    // The interviewer's private notes ride along in the history so it keeps its
    // running assessment across turns — but they never reach the student's screen
    // and never enter the saved transcript.
    const messages: ChatMessage[] = [
      { role: 'system', content: PLACEMENT_SYSTEM },
      ...(history || []).map(m => ({
        role: m.role,
        content: m.role === 'assistant' && m.notes
          ? `${m.content}\n\n[PRIVATE NOTES — not shown to the student: ${m.notes}]`
          : m.content,
      })),
    ];

    // First turn: have the interviewer open the conversation
    if (!history || history.length === 0) {
      messages.push({ role: 'user', content: "(The student has just opened the placement interview. Greet them and ask your first question.)" });
    }

    const reply = await callOpenRouterChat(messages, { temperature: 0.4, json: true, log: logCtx });

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(reply.replace(/^```(json)?|```$/g, '').trim()) || {};
    } catch {
      // Model broke the contract — fall back to showing the raw text so the
      // interview can continue rather than dead-ending.
      return NextResponse.json({ done: false, message: reply, notes: '', task: 0 });
    }

    // Guard the task floor in code, not just in the prompt. Don't trust the model's
    // own counter — it under-counts, and omits the field entirely when finishing.
    // Counting the student's Spanish answers is deterministic and can't drift.
    const taskCount = countSpanishAnswers(history || []);
    if (parsed.done === true && taskCount < MIN_TASKS) {
      const nudge = await callOpenRouterChat(
        [
          ...messages,
          { role: 'assistant', content: reply },
          { role: 'user', content: `(System: the student has only produced ${taskCount} Spanish answers; the minimum before you may finish is ${MIN_TASKS}. Do NOT finish yet — ask the next task at the appropriate rung, climbing if they are handling it. Reply with the normal in-progress JSON.)` },
        ],
        { temperature: 0.4, json: true, log: logCtx }
      );
      try {
        const cont = JSON.parse(nudge.replace(/^```(json)?|```$/g, '').trim());
        if (cont && cont.done !== true) parsed = cont;
      } catch {
        // keep the original assessment rather than losing the interview
      }
    }

    if (parsed.done === true) {
      try {
        const assessment = parsed as Record<string, any>;
        const { error } = await supabase.from('user_profile').upsert({
          user_id: auth.userId,
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
          ...(history || []).map((m: PlacementTurn) => ({
            role: m.role,
            content: m.content, // visible text only — notes stay out of the record
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
          .map((g: { issue?: string; evidence: string; why?: string; category?: string; correction?: string }) => ({
            error: g.evidence,
            correction: g.correction || null,
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
          unitCount = await generateSyllabus(supabase);
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

    return NextResponse.json({
      done: false,
      message: String(parsed.message || reply),
      notes: String(parsed.notes || ''),
      task: taskCount,
    });
  } catch (error) {
    console.error('Placement error:', error);
    return NextResponse.json({ error: 'Placement interview failed' }, { status: 500 });
  }
}
