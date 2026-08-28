import { getSupabase } from '@/lib/supabase';

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

  const [profileRes, listenedRes, lessonsRes, dueRes] = await Promise.all([
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
  ]);

  const profile = profileRes.data;
  const listened = listenedRes.data || [];
  const lessons = lessonsRes.data || [];
  const dueCount = dueRes.count ?? 0;

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
- Always translate any Spanish you use at or above the student's level.`;
}

export const PLACEMENT_SYSTEM = `You are a Spanish placement interviewer. Your job: estimate the student's CEFR level (A1-C2) and learn their goals and target dialect through a short adaptive interview.

RULES:
- Ask exactly ONE question per message. Keep each message short.
- Interview flow: (1) greet, ask about their history with Spanish and their goals; (2) ask which dialect/country they care about; (3) then 5-7 Spanish tasks of increasing difficulty — start simple (introduce yourself), escalate (describe your day in past tense, express an opinion with subjunctive, hypothesize) — adapting difficulty to their answers; (4) stop early once confident.
- Respond to their Spanish naturally and note errors silently; do NOT correct or teach during placement.
- After enough evidence (usually 7-9 total exchanges), END by outputting ONLY a JSON object, no other text:
{"done": true, "cefr": "B1", "target_dialect": "costa_rican|mexican|castilian|rioplatense|neutral_latam", "goals": {"summary": "..."}, "strengths": {"strong": ["..."], "gaps": ["..."]}, "closing_message": "A warm 2-3 sentence summary for the student: their level, what they're solid on, what you'll work on first."}`;
