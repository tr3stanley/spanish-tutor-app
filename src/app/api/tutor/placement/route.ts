import { NextRequest, NextResponse } from 'next/server';
import { getAuth, unauthorized } from '@/lib/auth';
import { callOpenRouterChat, ChatMessage } from '@/lib/ai';
import {
  PLACEMENT_SYSTEM, PLACEMENT_RUNGS, generateSyllabus, normalizeCategory,
  rungIndex, describeRung, isRepeatTask, cefrCap, exceedsCap, validGap,
} from '@/lib/tutor';

const MIN_TASKS = 7;
const MAX_TASKS = 10;
const MAX_START_RUNG = rungIndex('d');
const TOP_RUNG = PLACEMENT_RUNGS.length - 1;

interface PlacementTurn {
  role: 'user' | 'assistant';
  content: string;
  notes?: string;
  rung?: string | null;     // assistant: rung of the task this message asked
  handled?: boolean | null; // assistant: verdict on the student's previous answer
}

// What this turn must produce. The code picks the rung and decides when the
// interview ends; the model only judges answers and writes the questions.
type Plan =
  | { kind: 'intro'; mustStart: boolean }
  | { kind: 'task'; last: number; up: number; down: number }
  | { kind: 'final' };

const ASKS_SOMETHING = /\b(in spanish|tell me|describe|say|name|write|explain|give|share|imagine|what would)\b/i;

function parseReply(raw: string): Record<string, unknown> | null {
  try {
    return JSON.parse(raw.replace(/^```(json)?|```$/g, '').trim()) || null;
  } catch {
    return null;
  }
}

// Each assistant turn's `handled` judges the answer to the task asked in the
// assistant turn before it.
function summarize(history: PlacementTurn[]) {
  let last = -1;
  let best = -1;
  let tasks = 0;
  let intros = 0;
  const fails = PLACEMENT_RUNGS.map(() => 0);
  for (const m of history) {
    if (m.role !== 'assistant') continue;
    if (last >= 0 && m.handled === true) best = Math.max(best, last);
    if (last >= 0 && m.handled === false) fails[last]++;
    last = rungIndex(m.rung);
    if (last >= 0) tasks++;
    else intros++;
  }
  return { last, best, tasks, intros, fails };
}

// The level the evidence supports: the highest rung they handled, including
// the verdict on their final answer.
function levelCap(history: PlacementTurn[], finalHandled: unknown): string {
  const { best, last } = summarize(history);
  return cefrCap(finalHandled === true ? Math.max(best, last) : best);
}

function planTurn(history: PlacementTurn[]): Plan {
  const { last, tasks, intros, fails } = summarize(history);
  if (last < 0) return { kind: 'intro', mustStart: intros >= 2 };
  const ceilingFound = fails.some(f => f > 0);
  if (tasks >= MAX_TASKS || (tasks >= MIN_TASKS && ceilingFound)) return { kind: 'final' };
  // Climb one rung on success, unless that rung has already beaten them twice.
  const up = last === TOP_RUNG || fails[last + 1] >= 2 ? last : last + 1;
  return { kind: 'task', last, up, down: Math.max(0, last - 1) };
}

function turnInstruction(plan: Plan): string {
  switch (plan.kind) {
    case 'intro':
      return plan.mustStart
        ? '(System: ask the first Spanish task now, choosing its rung by the ADAPTIVE START rules. Return {"notes": "...", "rung": "<0-d>", "message": "..."}.)'
        : '(System: if you still need their background or target dialect, ask for it with "rung": null. Otherwise ask the first Spanish task, choosing its rung by the ADAPTIVE START rules. Return {"notes": "...", "rung": "<0-d or null>", "message": "..."}.)';
    case 'task':
      return `(System: their last answer was to a ${describeRung(plan.last)} Decide "handled" for it. Then write BOTH possible next messages, each a new task unlike any asked so far: "message_if_handled" asks a ${describeRung(plan.up)} "message_if_not" asks a ${describeRung(plan.down)} Return {"handled": true|false, "notes": "...", "message_if_handled": "...", "message_if_not": "..."}.)`;
    case 'final':
      return '(System: the interview is over. Return the FINAL JSON now, including "handled" for their last answer.)';
  }
}

// Turn the model's reply into what the student sees, plus anything wrong with it.
function resolve(raw: Record<string, unknown>, plan: Plan, history: PlacementTurn[]) {
  const problems: string[] = [];
  const out: Record<string, unknown> = { ...raw };

  if (plan.kind === 'final') {
    if (raw.done !== true) {
      problems.push('Return the FINAL JSON with "done": true.');
      return { out, problems };
    }
    if (typeof raw.handled !== 'boolean') problems.push('"handled" for their last answer is required.');
    const cap = levelCap(history, raw.handled);
    if (exceedsCap(raw.cefr, cap)) {
      problems.push(`The highest rung the student actually handled only supports ${cap}. Re-issue the complete final JSON with "cefr": "${cap}" and a closing_message that matches it.`);
    }
    if (!String(raw.closing_message || '').trim()) problems.push('The final JSON is missing "closing_message".');
    return { out, problems };
  }

  out.done = false;
  if (plan.kind === 'task') {
    if (typeof raw.handled !== 'boolean') problems.push('"handled" must be true or false.');
    const handled = raw.handled === true;
    out.message = handled ? raw.message_if_handled : raw.message_if_not;
    out.rung = PLACEMENT_RUNGS[handled ? plan.up : plan.down];
  } else {
    const rung = rungIndex(raw.rung);
    if (rung > MAX_START_RUNG) problems.push('The first task must be at rung (d) or below.');
    if (rung < 0 && plan.mustStart) problems.push('Ask the first Spanish task now, with its "rung".');
    out.rung = rung >= 0 ? PLACEMENT_RUNGS[rung] : null;
    out.handled = null;
  }

  const message = String(out.message || '');
  if (!message.trim()) {
    problems.push('The message is empty.');
  } else if (!message.includes('?') && !ASKS_SOMETHING.test(message)) {
    problems.push('Your message asks the student nothing. End it with exactly one question or task.');
  }
  if (out.rung && !/\bin spanish\b/i.test(message)) {
    problems.push('Task instructions must be in ENGLISH, e.g. "In Spanish, tell me...". Only the student answers in Spanish.');
  }
  if (isRepeatTask(message, history.filter(m => m.role === 'assistant').map(m => m.content))) {
    problems.push('The message repeats a task already asked. Write a visibly DIFFERENT task on a new topic.');
  }
  return { out, problems };
}

// One placement interview turn. The client sends the whole interview so far;
// placement is ephemeral — only the final assessment is persisted (to user_profile).
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuth(request);
    if (!auth) return unauthorized();
    const { supabase } = auth;
    const logCtx = { supabase, feature: 'placement' };

    const { history: rawHistory } = await request.json() as { history: PlacementTurn[] };
    const history = rawHistory || [];

    // The interviewer's private notes ride along in the history so it keeps its
    // running assessment across turns — but they never reach the student's screen
    // and never enter the saved transcript.
    const messages: ChatMessage[] = [
      { role: 'system', content: PLACEMENT_SYSTEM },
      ...history.map(m => ({
        role: m.role,
        content: m.role === 'assistant' && (m.notes || m.rung)
          ? `${m.content}\n\n[PRIVATE NOTES — not shown to the student: rung=${m.rung ?? 'null'}; ${m.notes || ''}]`
          : m.content,
      })),
    ];

    const plan: Plan = history.length === 0 ? { kind: 'intro', mustStart: false } : planTurn(history);
    messages.push({
      role: 'user',
      content: history.length === 0
        ? '(The student has just opened the placement interview. Greet them and ask your first question. Return {"notes": "", "rung": null, "message": "..."}.)'
        : turnInstruction(plan),
    });

    const opts = { temperature: 0.4, json: true, log: logCtx, maxTokens: 4000, reasoningEffort: 'low' as const, retryEmpty: 2 };
    let raw = await callOpenRouterChat(messages, opts);
    let result = parseReply(raw) ? resolve(parseReply(raw)!, plan, history) : null;

    for (let attempt = 0; attempt < 2 && (!result || result.problems.length > 0); attempt++) {
      const problems = result ? result.problems : ['The reply was not valid JSON.'];
      console.log('Placement reply rejected:', problems.join(' | '));
      const fixed = await callOpenRouterChat(
        [
          ...messages,
          { role: 'assistant', content: raw },
          { role: 'user', content: `(System: your reply was rejected. ${problems.join(' ')} Reply with corrected JSON only.)` },
        ],
        opts
      );
      const cont = parseReply(fixed);
      if (!cont) continue;
      const next = resolve(cont, plan, history);
      // Keep a usable earlier reply rather than swapping in a worse one.
      if (!result || next.problems.length <= result.problems.length) {
        result = next;
        raw = fixed;
      }
    }

    const unusable = !result
      || (plan.kind === 'final' ? result.out.done !== true : !String(result.out.message || '').trim());
    if (unusable) {
      // Never paste raw model output into the interview: an empty or broken
      // turn in the history made the model lose its place.
      console.error('Placement contract broken; raw reply:', raw.slice(0, 400));
      return NextResponse.json({
        error: 'retry',
        message: "Sorry — that didn't come through. Could you send that again?",
      }, { status: 503 });
    }
    const parsed = result!.out;

    // Last resort for the level cap: override rather than overstate it.
    if (parsed.done === true) {
      const cap = levelCap(history, parsed.handled);
      if (exceedsCap(parsed.cefr, cap)) parsed.cefr = cap;
    }

    if (parsed.done === true) {
      try {
        const assessment = parsed as Record<string, any>;
        const studentText = history.filter(m => m.role === 'user').map(m => m.content).join('\n');
        if (Array.isArray(assessment.strengths?.gaps)) {
          assessment.strengths.gaps = assessment.strengths.gaps.filter(
            (g: { evidence?: string; correction?: string }) => g && typeof g === 'object' && validGap(g, studentText)
          );
        }
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
          ...history.map((m: PlacementTurn) => ({
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
      message: String(parsed.message),
      notes: String(parsed.notes || ''),
      rung: parsed.rung ?? null,
      handled: typeof parsed.handled === 'boolean' ? parsed.handled : null,
    });
  } catch (error) {
    console.error('Placement error:', error);
    return NextResponse.json({ error: 'Placement interview failed' }, { status: 500 });
  }
}
