import { SupabaseClient } from '@supabase/supabase-js';

interface OpenRouterResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
}

// List price per million tokens [input, output]. Used to attribute spend per
// feature; Groq's free tier means actual spend can be lower, which is why the
// provider is recorded alongside.
const PRICES: Record<string, [number, number]> = {
  'openai/gpt-oss-120b': [0.037, 0.170],
  'openai/gpt-oss-20b': [0.030, 0.130],
  'google/gemini-2.5-flash-lite': [0.100, 0.400],
  'deepseek/deepseek-chat': [0.257, 1.029],
  'deepseek/deepseek-v4-flash': [0.085, 0.171],
  'moonshotai/kimi-k2-0905': [0.600, 2.500],
  'anthropic/claude-haiku-4.5': [1.000, 5.000],
  'mistralai/mistral-small-2603': [0.150, 0.600],
  'qwen/qwen3.8-27b': [0.425, 2.550],
};

// Where to attribute this call. Optional — logging never blocks or breaks a request.
export interface UsageContext {
  supabase: SupabaseClient;
  feature: string;
}

function estimateCost(model: string, inTok: number, outTok: number): number | null {
  const p = PRICES[model];
  if (!p) return null;
  return (inTok * p[0] + outTok * p[1]) / 1_000_000;
}

async function logUsage(
  ctx: UsageContext | undefined,
  model: string,
  provider: string,
  role: string,
  usage: { prompt_tokens?: number; completion_tokens?: number } | undefined
) {
  if (!ctx) return;
  try {
    const inTok = usage?.prompt_tokens ?? 0;
    const outTok = usage?.completion_tokens ?? 0;
    await ctx.supabase.from('llm_usage').insert({
      feature: ctx.feature,
      role,
      model,
      provider,
      prompt_tokens: inTok,
      completion_tokens: outTok,
      cost_usd: estimateCost(model, inTok, outTok),
    });
  } catch (e) {
    console.error('Usage logging failed (non-fatal):', e);
  }
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// Model roles. Chosen by benchmarking 13 models on this app's own tasks
// (five-turn lesson, error detection, dialect fidelity) — see PLAN.md.
//
// chat: gpt-oss-120b was the only model to score 5/5 on both correcting AND
//   explaining errors, while holding Costa Rican usted forms and never flagging
//   the accents students can't type. It is also among the cheapest and, on Groq,
//   ~5x faster than what it replaces.
// bulk: gpt-oss-120b is verbose in JSON mode and truncates under tight token
//   budgets, so short structured calls use flash-lite instead. Note flash-lite
//   invents errors on correct Spanish, so it must NOT be used for error
//   extraction — that stays on the chat model.
export type ModelRole = 'chat' | 'bulk';

const ROLE_MODELS: Record<ModelRole, string> = {
  chat: process.env.MODEL_CHAT || 'openai/gpt-oss-120b',
  bulk: process.env.MODEL_BULK || 'google/gemini-2.5-flash-lite',
};

// Models Groq serves. Groq is far faster but rate-limited, so it is tried first
// and we fall back to OpenRouter on any failure.
const GROQ_MODELS = new Set([
  'openai/gpt-oss-120b',
  'openai/gpt-oss-20b',
  'qwen/qwen3.8-27b',
  'qwen/qwen3.6-27b',
]);

// gpt-oss-120b needs room to finish a JSON object; below this it truncates and
// returns unparseable output.
const MIN_JSON_TOKENS = 900;

async function postJson(url: string, key: string, body: string, attempts = 3): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://spanish-tutor-app.vercel.app',
          'X-Title': 'Spanish Tutor',
        },
        body,
      });
      if (response.status >= 500 && attempt < attempts) {
        await new Promise(r => setTimeout(r, 1500 * attempt));
        continue;
      }
      return response;
    } catch (error) {
      if (attempt >= attempts) throw error;
      await new Promise(r => setTimeout(r, 1500 * attempt));
    }
  }
}

export async function callOpenRouterChat(
  messages: ChatMessage[],
  options: {
    model?: string;
    role?: ModelRole;
    temperature?: number;
    maxTokens?: number;
    json?: boolean;
    log?: UsageContext;
  } = {}
): Promise<string> {
  const model = options.model || ROLE_MODELS[options.role || 'chat'];
  const maxTokens = options.json
    ? Math.max(options.maxTokens ?? 2000, MIN_JSON_TOKENS)
    : (options.maxTokens ?? 2000);

  const payload = JSON.stringify({
    model,
    messages,
    temperature: options.temperature ?? 0.7,
    max_tokens: maxTokens,
    ...(options.json ? { response_format: { type: 'json_object' } } : {}),
  });

  const groqKey = process.env.GROQ_API_KEY;
  // Groq first for latency; it rate-limits, so any failure falls through.
  if (groqKey && GROQ_MODELS.has(model)) {
    try {
      const res = await postJson('https://api.groq.com/openai/v1/chat/completions', groqKey, payload, 1);
      if (res.ok) {
        const data: OpenRouterResponse = await res.json();
        const text = data.choices[0]?.message?.content || '';
        if (text) {
          await logUsage(options.log, model, 'groq', options.role || 'chat', data.usage);
          return text;
        }
      }
      console.log(`Groq unavailable for ${model} (${res.status}); using OpenRouter`);
    } catch (e) {
      console.log('Groq request failed, using OpenRouter:', e);
    }
  }

  const response = await postJson(
    'https://openrouter.ai/api/v1/chat/completions',
    process.env.OPENROUTER_API_KEY || '',
    payload
  );
  if (!response.ok) {
    throw new Error(`Model API error (${model}): ${response.status} ${response.statusText}`);
  }
  const data: OpenRouterResponse = await response.json();
  await logUsage(options.log, model, 'openrouter', options.role || 'chat', data.usage);
  return data.choices[0]?.message?.content || '';
}

export async function callOpenRouter(
  prompt: string,
  model?: string
): Promise<string> {
  return callOpenRouterChat([{ role: 'user', content: prompt }], { model, role: 'chat' });
}

export async function generateLessonPlan(
  transcript: string,
  language: 'spanish' | 'russian'
): Promise<{
  summary: string;
  grammarRules: string;
  vocabulary: string;
}> {
  const languageName = language === 'spanish' ? 'Spanish' : 'Russian';

  const prompt = `
You are an expert ${languageName} language teacher. Analyze this podcast transcript and create a comprehensive lesson plan.

TRANSCRIPT:
${transcript}

CRITICAL: DO NOT return JSON. Return PLAIN TEXT ONLY in this EXACT format:

---SUMMARY---
A clear, engaging summary of what the podcast covers in 2-3 paragraphs

---GRAMMAR---
A comprehensive formatted text explanation of 5-8 key grammar concepts from the podcast. For each rule, provide a descriptive title, clear explanation of when and why it's used, concrete examples from the transcript, and practical usage tips. Include English translations for ALL ${languageName} phrases and examples used in explanations.

---VOCABULARY---
A formatted text list of 15-20 vocabulary words from the podcast. Format each word with the ${languageName} word, English translation, part of speech, example sentence from the transcript with English translation, and usage notes. Include English translations for ALL ${languageName} phrases used in explanations.

DO NOT use JSON format. DO NOT put this inside code blocks. Return ONLY plain text with the section markers.

For grammarRules, format like:
DESCRIPTIVE RULE TITLE (e.g., "Subjunctive Mood for Expressing Doubt")\\n
Examples: ejemplo en ${languageName} (example in English), otro ejemplo (another example)\\n
Explanation: Clear explanation of when and why this rule is used, with any ${languageName} phrases translated to English\\n
Context: How it's commonly used in conversation and practical application tips\\n\\n

For vocabulary, format like:
PALABRA (part of speech) - English translation\\n
Example: "Sentence from transcript in ${languageName}" (English translation of the sentence)\\n
Usage notes: Additional context, alternative meanings, or common collocations\\n
Alternative meanings: if any\\n\\n

Make this educational and engaging for an intermediate ${languageName} learner.
`;

  const response = await callOpenRouter(prompt);

  try {
    // Parse the response using section markers
    const summaryMatch = response.match(/---SUMMARY---([\s\S]*?)---GRAMMAR---/);
    const grammarMatch = response.match(/---GRAMMAR---([\s\S]*?)---VOCABULARY---/);
    const vocabularyMatch = response.match(/---VOCABULARY---([\s\S]*?)$/);

    return {
      summary: summaryMatch ? summaryMatch[1].trim() : response,
      grammarRules: grammarMatch ? grammarMatch[1].trim() : '',
      vocabulary: vocabularyMatch ? vocabularyMatch[1].trim() : ''
    };
  } catch (error) {
    console.error('Response parsing error:', error);
    console.log('Raw response:', response.substring(0, 500));

    // If parsing fails, return raw text
    return {
      summary: response,
      grammarRules: '',
      vocabulary: ''
    };
  }
}

export async function explainSegment(
  segmentText: string,
  language: 'spanish' | 'russian',
  context?: string
): Promise<string> {
  const languageName = language === 'spanish' ? 'Spanish' : 'Russian';

  const prompt = `
You are an expert ${languageName} language teacher. A student is listening to a podcast and doesn't understand this specific segment. Provide a clear, helpful explanation.

SEGMENT TO EXPLAIN:
"${segmentText}"

${context ? `CONTEXT FROM SURROUNDING TRANSCRIPT:\n${context}` : ''}

Please provide your explanation in this format:

**Original Segment:**
"${segmentText}"

**Full English Translation:**
[Provide a natural English translation of the entire segment]

**Detailed Breakdown:**

1. **Vocabulary Analysis:** Word-by-word breakdown of any difficult vocabulary (with English translations)
2. **Grammar Structures:** Explanation of grammar structures used (with English translations for any ${languageName} examples)
3. **Cultural Context:** Cultural context if relevant
4. **Learning Tips:** Tips for understanding similar phrases in the future

IMPORTANT: Always provide English translations immediately after any ${languageName} text in parentheses.
Make this explanation clear and educational for an intermediate ${languageName} learner. Be encouraging and supportive.
`;

  return await callOpenRouter(prompt);
}

export async function extractKeyPhrases(
  transcript: string,
  language: 'spanish' | 'russian'
): Promise<string[]> {
  const languageName = language === 'spanish' ? 'Spanish' : 'Russian';

  const prompt = `
Extract the 10-15 most important and useful phrases from this ${languageName} podcast transcript. Focus on:
- Common expressions
- Idiomatic phrases
- Useful conversational phrases
- Cultural expressions

TRANSCRIPT:
${transcript}

Return only the ${languageName} phrases, one per line, without translations or explanations.
`;

  const response = await callOpenRouter(prompt);
  return response.split('\n').filter(line => line.trim().length > 0);
}