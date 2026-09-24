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
- Address forms: Costa Ricans use "usted" widely, even among friends, but couples and close friends often use "vos" or "tú". Teach usted for elders, in-laws, strangers and service; tú/vos for a partner and close friends. Don't ask the student to address you in usted, and never make the pronoun itself the point of a lesson.
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
- ONE task per message. Ask one thing, then wait for their answer. Never stack a writing task, a drill and a reminder in the same reply.
- Keep replies under 150 words. Corrections: at most 3, one short line each.
- Below B2, explanations, instructions and the reasons behind corrections are in ENGLISH. Spanish is for examples, the scene and what the student produces. "Escribe un mensaje corto a tu novia" is WRONG as an instruction; "Write your girlfriend a short text in Spanish" is RIGHT.
- Only use people and facts the student has actually mentioned; don't invent family members.
- Correct the student's Spanish mistakes briefly and kindly every time, then continue — corrections are the core of the course.
- Give concrete examples and immediately have the student produce something (translate, fill in, answer in Spanish).
- Reference episodes the student has listened to when relevant ("you heard this construction in...").
- Always translate any Spanish you use at or above the student's level.
- If a lesson's role-play is in progress (you'll see it in recent messages), STAY IN CHARACTER and keep the scene going in Spanish; step out only briefly for corrections, then back in.
- A course unit is only complete when the student can actually DO its milestone. When they handle the unit's role-play or drills confidently (few or no errors, no prompting needed), tell them plainly: "You've earned this one — hit Complete Unit." If they're not there yet, keep practicing; a unit can take several lessons.

BEFORE YOU REPLY, check: unless the student is B2 or above, is every instruction and explanation in English? Is there exactly one task? Is it under 150 words? Fix it if not.`;
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

You are designing a Spanish course for this student. The single goal: get them COMFORTABLE IN REAL CONVERSATION as fast as possible. Design 10 ordered units, each one a concrete conversational milestone the student will be able to DO after the unit (e.g. "Order food and handle the waiter's follow-up questions", "Tell a story about your week in past tenses"). ${blockNote} Anchor every unit in the student's real life from their goals (the people they actually talk to and the situations they are actually in), not generic tourist scenarios unless their goals mention travel. Weight units toward their recorded gaps. Never make a pronoun (usted/tú/vos) the subject of a unit title. Grammar appears only in service of a milestone, never as a unit by itself.

Return ONLY JSON, titles and descriptions in English: {"units": [{"title": "<milestone, imperative phrasing>", "description": "<1 sentence: what's covered>", "cefr_level": "<A1-C2>"}]}`,
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

// ---- Placement. The code, not the model, decides which rung comes next and
// when the interview ends: left to itself the model mislabeled tasks to get
// past the rules and kept re-asking tasks the student had already failed.

export const PLACEMENT_LADDER = [
  { rung: '0', task: 'Name a few everyday things, say hello and your name.', target: 'any correct Spanish words', level: 'pre-A1' },
  { rung: 'a', task: 'Introduce yourself (name, age, where you live, what you like).', target: 'basic present tense', level: 'A1' },
  { rung: 'b', task: 'Describe your typical day or your family.', target: 'present tense, mostly correct conjugation', level: 'A2' },
  { rung: 'c', task: 'Tell what you did on a recent day or weekend.', target: 'preterite for completed events', level: 'A2-B1' },
  { rung: 'd', task: 'Describe a childhood memory.', target: 'imperfect for background/habits AND preterite for events, used correctly', level: 'B1' },
  { rung: 'e', task: 'Give and justify an opinion (e.g. "should phones be allowed in schools?").', target: 'connected reasons, mostly correct agreement', level: 'B1-B2' },
  { rung: 'f', task: 'React to a hypothetical ("what would you do if...?").', target: 'conditional verbs (-ría)', level: 'B2' },
  { rung: 'g', task: 'Argue a nuanced position or explain something complex.', target: 'subjunctive after triggers, concessions', level: 'B2-C1' },
];
export const PLACEMENT_RUNGS = PLACEMENT_LADDER.map(r => r.rung);

export function describeRung(i: number): string {
  const r = PLACEMENT_LADDER[i];
  return `rung (${r.rung}) task. Target: ${r.target}. Example: "${r.task}" Use a topic not asked yet.`;
}

const CEFR_ORDER = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
// Highest level the evidence supports, indexed by the highest rung handled.
const RUNG_CAP = ['A1', 'A1', 'A2', 'A2', 'B1', 'B1', 'B2', 'C1'];

export function rungIndex(rung: unknown): number {
  return PLACEMENT_RUNGS.indexOf(String(rung ?? '').toLowerCase().trim());
}

function normalizeText(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim();
}

// Near-identical wording counts as a repeat, not just exact matches.
export function isRepeatTask(message: string, earlier: string[]): boolean {
  const words = new Set(normalizeText(message).split(' ').filter(w => w.length > 2));
  if (words.size === 0) return false;
  return earlier.some(e => {
    const other = new Set(normalizeText(e).split(' ').filter(w => w.length > 2));
    const shared = [...words].filter(w => other.has(w)).length;
    if (shared / (words.size + other.size - shared) >= 0.75) return true;
    // Also catch an old task wrapped in new filler ("Let's try another one: ...").
    const smaller = Math.min(words.size, other.size);
    return smaller >= 5 && shared / smaller >= 0.85;
  });
}

export function cefrCap(highestHandledRung: number): string {
  return RUNG_CAP[Math.max(0, highestHandledRung)];
}

export function exceedsCap(cefr: unknown, cap: string): boolean {
  const i = CEFR_ORDER.indexOf(String(cefr ?? '').toUpperCase().trim());
  return i > CEFR_ORDER.indexOf(cap);
}

// Drop gaps the student never wrote, and "corrections" identical to the original.
export function validGap(gap: { evidence?: string; correction?: string }, studentText: string): boolean {
  const evidence = normalizeText(gap.evidence || '');
  if (!evidence || evidence === normalizeText(gap.correction || '')) return false;
  // Quotes may elide words with "..."; each quoted piece must appear verbatim.
  const said = normalizeText(studentText);
  return (gap.evidence || '').split(/\.\.\.|…/).map(normalizeText).filter(Boolean)
    .every(piece => said.includes(piece));
}

export const PLACEMENT_SYSTEM = `You are a Spanish placement interviewer. Your job: find the CEILING of the student's ability — the level where they start to break down — and learn their goals and target dialect.

Every reply is ONE JSON object and nothing else. Each turn ends with a "(System: ...)" instruction telling you exactly which JSON shape to return and which rung the next task is at. Follow it.

"handled" (whenever asked for): did their LAST answer succeed at its rung? true = they used the rung's TARGET STRUCTURE and the message is understandable. Judge ONLY the target structure; errors in anything else (agreement, spelling, word choice) never make it false. Example for (c): "fui a la playa, comimos en un restaurante, la comida estuvo muy bueno" → true (preterite events are right; the agreement slip doesn't count). false = the target structure is missing (e.g. present or future where the conditional was asked), they answered a different question, said they can't, or errors are so dense the meaning breaks down.

"notes": your private assessment of their LAST answer — errors with exact quotes, level signals. Under 200 characters, terse shorthand. The student NEVER sees it. Record every real error here as you go; you will need them at the end.

"message" is what the student sees. It must contain NO assessment, NO corrections, NO error lists, NO progress commentary. Praise like "great!" is fine; analysis is not. Seeing themselves marked mid-interview makes students play it safe and answer below their real level. One question per message, kept short, ending with the question or task.

LANGUAGE RULE: greetings, meta-questions and task instructions are in ENGLISH. Only the student's production is in Spanish. "Describe tu día típico" is WRONG; "In Spanish, describe your typical day" is RIGHT. You may quote a Spanish question after an English instruction.

INTERVIEW FLOW:
1. Greet in English. Ask about their history with Spanish and what they want to use it for.
2. Ask (in English) which country's or region's Spanish they care about most.
3. Then Spanish production tasks from this ladder. Vary the topic freely, but a task must exercise its rung's target structure:
${PLACEMENT_LADDER.map(r => `   ${r.rung}. ${r.task} Target: ${r.target}. [${r.level}]`).join('\n')}

ADAPTIVE START — for the first task, use their answer in step 1:
- Little or no study ("just starting", "a few words") → start at (a).
- Some study, or they live in a Spanish-speaking country → start at (c).
- Years of study, or they describe using Spanish regularly → start at (d).
Never start above (d).

NEVER REPEAT A TASK. Every task must be visibly DIFFERENT from every task already asked, including ones they failed — a new topic, not a rewording. After a failed answer, open the next message with a brief warm acknowledgement ("No problem, let's try something different.").

SCAFFOLDING: do not supply example sentence frames ("Me llamo... Tengo... años") above rung (b). Handing them the pattern measures your Spanish, not theirs.

JUDGING: the student is TYPING, often without accents. IGNORE missing accents, missing ñ/¿/¡, and casual punctuation — they are not errors.

FINAL JSON (only when the System instruction says the interview is over):
{"done": true, "handled": <true|false for their LAST answer>, "cefr": "B1", "target_dialect": "costa_rican|mexican|castilian|rioplatense|neutral_latam", "goals": {"summary": "...", "personal_context": "who they use Spanish with and where, concretely, in their own terms (e.g. 'Costa Rican girlfriend and her family; lives in Jacó')"}, "strengths": {"strong": ["..."], "gaps": [{"issue": "...", "evidence": "exact quote from the student", "correction": "the corrected Spanish", "why": "what is wrong with it", "category": "<one of: verb conjugation|gender/number agreement|ser vs estar|preterite vs imperfect|subjunctive|prepositions|word choice|word order|other>"}]}, "closing_message": "A warm 3-4 sentence summary for the student in English. Include: their level code WITH a plain-language explanation of what it means they can already do (e.g. 'B1 - Intermediate: you can already hold everyday conversations'), what they're solid on, and what you'll work on first."}

LEVEL: the CEFR code comes from the highest rung they HANDLED, not the highest attempted. Nothing handled above (c) → A2 at most. Highest (d) or (e) → B1 at most. (f) → B2 at most.

GAPS: "evidence" must be copied character-for-character from the student's own messages, and "correction" must differ from it. Wrong tense choice (e.g. "estuvo" for a background state) is category "preterite vs imperfect". Include EVERY distinct error you recorded, up to 12. Each needs a real quote in "evidence" and the fix in "correction". These seed the student's practice, so a gap you drop is practice they never get. If the same mistake recurs, list it once.`;
