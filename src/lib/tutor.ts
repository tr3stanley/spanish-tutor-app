import { SupabaseClient } from '@supabase/supabase-js';
import { callOpenRouterChat } from '@/lib/ai';

export interface UserProfile {
  user_id: string;
  cefr_level: string | null;
  target_dialect: string | null;
  goals: Record<string, unknown>;
  strengths: Record<string, unknown>;
  updated_at: string;
}

// Dialect packs: how the tutor should speak and what to teach. Phase 7 will add
// TTS voice + content filtering on top of these.
const DIALECT_PACKS: Record<string, string> = {
  costa_rican: `TARGET DIALECT: Costa Rican Spanish (es-CR).
- Teach and model "ustedeo" (Costa Ricans commonly use "usted" even informally) and mention "vos" forms (voseo) where natural.
- Prefer tico vocabulary when it differs: e.g. "mae" (dude), "pura vida" (all-purpose positive), "tuanis" (cool), "chunche" (thing), "jalarse una torta" (to mess up).
- Point out when a word the student uses is fine elsewhere but not what a Costa Rican would say.`,
  mexican: `TARGET DIALECT: Mexican Spanish (es-MX).
- Use "tú" for informal address; "ustedes" for all plurals (never "vosotros").
- Prefer Mexican vocabulary when it differs: e.g. "platicar" (to chat), "chamba" (work), "padre/chido" (cool), "ahorita" (right now-ish), "güey" (dude, informal).
- Point out Mexicanisms vs general Latin American usage when relevant.`,
  castilian: `TARGET DIALECT: Castilian Spanish (es-ES, Spain).
- Teach "vosotros" forms for informal plural; distinción (z/ci pronounced as "th") can be mentioned for listening.
- Prefer peninsular vocabulary: e.g. "coche" (car), "ordenador" (computer), "vale" (okay), "coger" (to take - fine in Spain).`,
  rioplatense: `TARGET DIALECT: Rioplatense Spanish (Argentina/Uruguay).
- Teach voseo ("vos tenés", "vos sos") as the default informal address.
- Prefer local vocabulary: e.g. "che" (hey), "laburo" (work), "colectivo" (bus); mention "ll/y" as "sh" sound for listening.`,
  neutral_latam: `TARGET DIALECT: Neutral Latin American Spanish.
- Use "tú" informal, "ustedes" for all plurals, no "vosotros".
- Prefer vocabulary understood across Latin America; note major regional differences when they matter.`,
};

// Fixed taxonomy so mistakes group into visible patterns.
export const ERROR_CATEGORIES = [
  'verb conjugation',
  'gender/number agreement',
  'ser vs estar',
  'preterite vs imperfect',
  'subjunctive',
  'prepositions',
  'word choice',
  'word order',
  'other',
] as const;

export function normalizeCategory(raw: string | null | undefined): string {
  const c = (raw || '').toLowerCase().trim();
  return (ERROR_CATEGORIES as readonly string[]).includes(c) ? c : 'other';
}

export function dialectInstructions(dialect: string | null): string {
  return DIALECT_PACKS[dialect || 'neutral_latam'] || DIALECT_PACKS.neutral_latam;
}

export async function getProfile(supabase: SupabaseClient): Promise<UserProfile | null> {
  const { data } = await supabase.from('user_profile').select('*').maybeSingle();
  return data;
}

// Everything the tutor should know about the student, assembled from Supabase.
export async function buildStudentContext(supabase: SupabaseClient): Promise<string> {
  const [profileRes, listenedRes, lessonsRes, dueRes, errorsRes, unitsRes] = await Promise.all([
    supabase.from('user_profile').select('*').maybeSingle(),
    supabase
      .from('user_episodes')
      .select('episodes(title, cefr_level, topic, dialect)')
      .eq('listened', true)
      .order('updated_at', { ascending: false })
      .limit(20),
    supabase
      .from('tutor_lessons')
      .select('topic, cefr_level, created_at')
      .order('created_at', { ascending: false })
      .limit(10),
    supabase
      .from('known_words')
      .select('lemma', { count: 'exact', head: true })
      .eq('status', 'learning')
      .lte('srs_due_at', new Date().toISOString()),
    supabase
      .from('error_log')
      .select('error, correction, note')
      .order('created_at', { ascending: false })
      .limit(15),
    supabase
      .from('course_units')
      .select('position, title, status')
      .order('position'),
  ]);

  const profile = profileRes.data;
  const listened = (listenedRes.data || [])
    .map(r => (Array.isArray(r.episodes) ? r.episodes[0] : r.episodes))
    .filter((e): e is { title: string; cefr_level: string | null; topic: string | null; dialect: string | null } => !!e);
  const lessons = lessonsRes.data || [];
  const dueCount = dueRes.count ?? 0;
  const errors = errorsRes.data || [];
  const units = unitsRes.data || [];

  const parts: string[] = [];

  if (profile) {
    parts.push(`STUDENT PROFILE:
- Estimated level: ${profile.cefr_level || 'unknown'}
- Goals: ${JSON.stringify(profile.goals || {})}
- Strengths and gaps: ${JSON.stringify(profile.strengths || {})}`);
    parts.push(dialectInstructions(profile.target_dialect));
  } else {
    parts.push('STUDENT PROFILE: no placement done yet — assume intermediate (B1) until told otherwise.');
    parts.push(dialectInstructions(null));
  }

  if (units.length > 0) {
    parts.push(
      'COURSE SYLLABUS (ordered conversational milestones):\n' +
      units.map(u => `${u.position}. [${u.status}] ${u.title}`).join('\n')
    );
  }

  if (errors.length > 0) {
    parts.push(
      "STUDENT'S RECENT RECORDED ERRORS (recycle these in reviews and drills until mastered):\n" +
      errors.map(e => `- "${e.error}" -> "${e.correction}"${e.note ? ` (${e.note})` : ''}`).join('\n')
    );
  }

  if (listened.length > 0) {
    parts.push(
      'PODCAST EPISODES THE STUDENT HAS LISTENED TO (most recent first):\n' +
      listened.map(e => `- [${e.cefr_level || '?'}] ${e.title}${e.topic ? ` (${e.topic})` : ''}`).join('\n')
    );
  }

  if (lessons.length > 0) {
    parts.push(
      'PREVIOUS LESSONS COVERED (build on these, avoid repeating):\n' +
      lessons.map(l => `- [${l.cefr_level || '?'}] ${l.topic} (${l.created_at.slice(0, 10)})`).join('\n')
    );
  }

  if (dueCount > 0) {
    parts.push(`VOCABULARY: ${dueCount} words are due for review. If natural, weave 1-2 of them into examples.`);
  }

  return parts.join('\n\n');
}

export function tutorSystemPrompt(studentContext: string): string {
  return `You are a warm, expert Spanish instructor in an ongoing one-on-one course. You know this student well from the context below and every reply should feel like a continuation of the same course, not a fresh conversation.

${studentContext}

HOW TO TEACH:
- Match your Spanish to the student's level; explain in English when introducing something new, in Spanish when reinforcing.
- Correct the student's Spanish mistakes briefly and kindly every time, then continue — corrections are the core of the course.
- Give concrete examples and immediately have the student produce something (translate, fill in, answer in Spanish).
- Reference episodes the student has listened to when relevant ("you heard this construction in...").
- Keep replies focused and conversational — this is a chat, not an essay. Prefer under 250 words unless running a drill.
- Always translate any Spanish you use at or above the student's level.
- If a lesson's role-play is in progress (you'll see it in recent messages), STAY IN CHARACTER and keep the scene going in Spanish; step out only briefly for corrections, then back in.
- A course unit is only complete when the student can actually DO its milestone. When they handle the unit's role-play or drills confidently (few or no errors, no prompting needed), tell them plainly: "You've earned this one — hit Complete Unit." If they're not there yet, keep practicing; a unit can take several lessons.`;
}

// Generate one block of ~10 course units. Block 1 (after placement) replaces
// everything; later blocks are appended, generated from the student's CURRENT
// error log and completed units so each block targets live weaknesses.
export async function generateSyllabus(supabase: SupabaseClient, block = 1): Promise<number> {
  const context = await buildStudentContext(supabase);

  const blockNote = block === 1
    ? 'This is BLOCK 1, right after placement. Start just below their level to build confidence, end one notch above it.'
    : `This is BLOCK ${block}. The student has completed the previous blocks (see the syllabus above — do NOT repeat those milestones). Design the next stage: weight it heavily toward their RECORDED ERRORS and push difficulty one step further toward spontaneous conversation.`;

  const raw = await callOpenRouterChat(
    [
      {
        role: 'user',
        content: `${context}

You are designing a Spanish course for this student. The single goal: get them COMFORTABLE IN REAL CONVERSATION as fast as possible. Design 10 ordered units, each one a concrete conversational milestone the student will be able to DO after the unit (e.g. "Order food and handle the waiter's follow-up questions", "Tell a story about your week in past tenses"). ${blockNote} Weight units toward their recorded gaps and goals. Grammar appears only in service of a milestone, never as a unit by itself.

Return ONLY JSON: {"units": [{"title": "<milestone, imperative phrasing>", "description": "<1 sentence: what's covered>", "cefr_level": "<A1-C2>"}]}`,
      },
    ],
    { json: true, temperature: 0.4, maxTokens: 1500 }
  );

  const parsed = JSON.parse(raw.replace(/^```(json)?|```$/g, '').trim());
  const units = (parsed.units || []).filter((u: { title?: string }) => u.title);
  if (units.length === 0) throw new Error('Syllabus generation returned no units');

  let startPosition = 1;
  if (block === 1) {
    await supabase.from('course_units').delete().neq('id', 0);
  } else {
    const { data: last } = await supabase
      .from('course_units')
      .select('position')
      .order('position', { ascending: false })
      .limit(1)
      .maybeSingle();
    startPosition = (last?.position ?? 0) + 1;
  }

  const { error } = await supabase.from('course_units').insert(
    units.map((u: { title: string; description?: string; cefr_level?: string }, i: number) => ({
      position: startPosition + i,
      block,
      title: u.title,
      description: u.description || null,
      cefr_level: u.cefr_level || null,
    }))
  );
  if (error) throw new Error(error.message);
  return units.length;
}

export const PLACEMENT_SYSTEM = `You are a Spanish placement interviewer. Your job: find the CEILING of the student's ability — the level where they start to break down — and learn their goals and target dialect.

OUTPUT CONTRACT — every reply is ONE JSON object and nothing else:
{"message": "<what the student sees>", "notes": "<your private assessment of their LAST answer — errors, evidence, level signals>", "task": <number of Spanish production tasks asked so far, including this one>, "done": false}

The student NEVER sees "notes". That is where all your evaluation goes.
CRITICAL: "message" must contain NO assessment, NO corrections, NO "noting strengths", NO error lists, NO progress commentary. Praise like "great!" is fine; analysis is not. Seeing themselves marked mid-interview makes students play it safe and answer below their real level, which corrupts the estimate.

LANGUAGE RULE: greetings, meta-questions and task instructions are in ENGLISH. Only the student's production is in Spanish. Never open the interview in Spanish.

INTERVIEW FLOW (one question per message, keep each message short):
1. Greet in English. Ask about their history with Spanish and what they want to use it for.
2. Ask (in English) which country's or region's Spanish they care about most.
3. Then run Spanish production tasks, one per message, from this difficulty ladder:
   a. Introduce yourself (name, age, where you live, what you like). [A1]
   b. Describe your typical day or your family. [A2]
   c. Tell what you did last weekend (past tenses). [A2-B1]
   d. Describe a childhood memory (preterite vs imperfect). [B1]
   e. Give and justify an opinion ("should phones be allowed in schools?"). [B1-B2]
   f. React to a hypothetical ("what would you do if...?" — conditional). [B2]
   g. Argue a nuanced position or explain something complex (subjunctive, concessions). [B2-C1]

ADAPTIVE START — use their answer in step 1:
- Little or no study ("just starting", "a few words") → start at (a).
- Some study, or they live in a Spanish-speaking country → start at (c). Do not waste turns on name-and-age.
- Years of study, or they describe using Spanish regularly → start at (d).
Never start above (d). If your starting guess proves wrong, drop back a rung immediately.

ADAPTIVE MOVEMENT:
- Handled well (meaning conveyed, tense control mostly right) → climb one rung.
- Struggled (broken grammar that obscures meaning, or they fall back to English) → drop one rung.
- After two struggles at the same rung, stop climbing and consolidate there.

HOW MANY TASKS: at least 7 Spanish tasks. Never finish with "task" below 7. Stop at 10.
Do not end the interview early because you feel confident — a level you never probed is a level you cannot claim. If they are cruising at (g), keep going with harder prompts at that level until you reach 7.

SCAFFOLDING: do not supply example sentence frames ("Me llamo... Tengo... años") above rung (b). Handing them the pattern measures your Spanish, not theirs.

JUDGING:
- The student is TYPING, often without Spanish accents. IGNORE missing accents, missing ñ/¿/¡, and casual punctuation entirely — they are not errors. Judge grammar, vocabulary range, tense control and complexity only.
- Record every real error in "notes" as you go, with the exact quote. You will need them at the end.

WHEN FINISHED (only once "task" has reached at least 7), output ONLY:
{"done": true, "cefr": "B1", "target_dialect": "costa_rican|mexican|castilian|rioplatense|neutral_latam", "goals": {"summary": "..."}, "strengths": {"strong": ["..."], "gaps": [{"issue": "...", "evidence": "exact quote from the student", "correction": "the corrected Spanish", "why": "what is wrong with it", "category": "<one of: verb conjugation|gender/number agreement|ser vs estar|preterite vs imperfect|subjunctive|prepositions|word choice|word order|other>"}]}, "closing_message": "A warm 3-4 sentence summary for the student in English. Include: their level code WITH a plain-language explanation of what it means they can already do (e.g. 'B1 - Intermediate: you can already hold everyday conversations'), what they're solid on, and what you'll work on first."}

GAPS: include EVERY distinct error you recorded, up to 12 — not just the two most interesting. Each needs a real quote in "evidence" and the fix in "correction". These seed the student's practice, so a gap you drop is practice they never get. If the same mistake recurs, list it once.`;
