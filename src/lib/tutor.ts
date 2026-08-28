import { getSupabase } from '@/lib/supabase';
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

export function dialectInstructions(dialect: string | null): string {
  return DIALECT_PACKS[dialect || 'neutral_latam'] || DIALECT_PACKS.neutral_latam;
}

export async function getProfile(): Promise<UserProfile | null> {
  const supabase = getSupabase();
  const { data } = await supabase.from('user_profile').select('*').maybeSingle();
  return data;
}

// Everything the tutor should know about the student, assembled from Supabase.
export async function buildStudentContext(): Promise<string> {
  const supabase = getSupabase();

  const [profileRes, listenedRes, lessonsRes, dueRes, errorsRes, unitsRes] = await Promise.all([
    supabase.from('user_profile').select('*').maybeSingle(),
    supabase
      .from('episodes')
      .select('title, cefr_level, topic, dialect')
      .eq('listened', true)
      .order('created_at', { ascending: false })
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
  const listened = listenedRes.data || [];
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
- If a lesson's role-play is in progress (you'll see it in recent messages), STAY IN CHARACTER and keep the scene going in Spanish; step out only briefly for corrections, then back in.`;
}

// Generate the ordered course syllabus from the student's placement results.
// Called after placement; replaces any existing syllabus.
export async function generateSyllabus(): Promise<number> {
  const supabase = getSupabase();
  const context = await buildStudentContext();

  const raw = await callOpenRouterChat(
    [
      {
        role: 'user',
        content: `${context}

You are designing a Spanish course for this student. The single goal: get them COMFORTABLE IN REAL CONVERSATION as fast as possible. Design 10 ordered units, each one a concrete conversational milestone the student will be able to DO after the unit (e.g. "Order food and handle the waiter's follow-up questions", "Tell a story about your week in past tenses"). Start just below their level to build confidence, end one notch above it. Weight units toward their recorded gaps and goals. Grammar appears only in service of a milestone, never as a unit by itself.

Return ONLY JSON: {"units": [{"title": "<milestone, imperative phrasing>", "description": "<1 sentence: what's covered>", "cefr_level": "<A1-C2>"}]}`,
      },
    ],
    { json: true, temperature: 0.4, maxTokens: 1500 }
  );

  const parsed = JSON.parse(raw.replace(/^```(json)?|```$/g, '').trim());
  const units = (parsed.units || []).filter((u: { title?: string }) => u.title);
  if (units.length === 0) throw new Error('Syllabus generation returned no units');

  await supabase.from('course_units').delete().neq('id', 0);
  const { error } = await supabase.from('course_units').insert(
    units.map((u: { title: string; description?: string; cefr_level?: string }, i: number) => ({
      position: i + 1,
      title: u.title,
      description: u.description || null,
      cefr_level: u.cefr_level || null,
    }))
  );
  if (error) throw new Error(error.message);
  return units.length;
}

export const PLACEMENT_SYSTEM = `You are a Spanish placement interviewer. Your job: estimate the student's CEFR level (A1-C2) and learn their goals and target dialect through an adaptive interview.

LANGUAGE RULE: Conduct all greetings, meta-questions, and task instructions in ENGLISH. Only the student's production tasks are in Spanish, and difficulty ramps up gradually. Never open the interview in Spanish.

INTERVIEW FLOW (one question per message, keep each message short):
1. Greet in English. Ask about their history with Spanish and what they want to use it for.
2. Ask (in English) which country's or region's Spanish they care about most.
3. Then run AT LEAST 7 Spanish production tasks, one per message, climbing this ladder — always give the task instruction in English:
   a. Introduce yourself (name, age, where you live, what you like). [A1]
   b. Describe your typical day or your family. [A2]
   c. Tell what you did last weekend (past tenses). [A2-B1]
   d. Describe a childhood memory (preterite vs imperfect). [B1]
   e. Give and justify an opinion on a topic ("should phones be allowed in schools?"). [B1-B2]
   f. React to a hypothetical ("what would you do if...?" - conditional). [B2]
   g. Argue a nuanced position or explain something complex (opinions with subjunctive, concessions). [B2-C1]
   Adapt within the ladder: if they struggle twice in a row, you may stop climbing and ask one easier consolidation task, but still complete at least 7 Spanish tasks total.
4. Do NOT end before 7 Spanish tasks. Do NOT drag past 10.

JUDGING:
- The student is TYPING, often on a keyboard without Spanish accents. IGNORE missing accents, missing ñ/¿/¡, and casual punctuation entirely — they are not errors. Judge grammar, vocabulary range, tense control, and complexity only.
- Note errors silently as you go; do NOT correct or teach during placement.
- A gap must be backed by evidence you can quote. If you cannot quote a real error, it is not a gap.

WHEN DONE, output ONLY a JSON object, no other text:
{"done": true, "cefr": "B1", "target_dialect": "costa_rican|mexican|castilian|rioplatense|neutral_latam", "goals": {"summary": "..."}, "strengths": {"strong": ["..."], "gaps": [{"issue": "...", "evidence": "exact quote from the student", "why": "what is wrong with it"}]}, "closing_message": "A warm 2-3 sentence summary for the student in English: their level, what they're solid on, what you'll work on first."}`;
