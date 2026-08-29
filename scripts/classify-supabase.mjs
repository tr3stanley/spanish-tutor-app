// Classify unclassified episodes in Supabase (CEFR + topic + dialect + top-2k coverage).
// Successor to classify-episodes.mjs (which ran against the retired SQLite db).
// Resumable: only touches episodes with classified_at IS NULL. Run: node scripts/classify-supabase.mjs

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import path from 'path';

const ROOT = path.resolve(import.meta.dirname, '..');
const env = readFileSync(path.join(ROOT, '.env.local'), 'utf8');
const supabase = createClient(
  env.match(/SUPABASE_URL=(\S+)/)?.[1],
  env.match(/SUPABASE_KEY=(\S+)/)?.[1]
);
const API_KEY = env.match(/OPENROUTER_API_KEY=(\S+)/)?.[1];

const TOP2K = new Set(
  readFileSync(path.join(ROOT, 'scripts', 'data', 'es_top2k.txt'), 'utf8')
    .split('\n').map(w => w.trim()).filter(Boolean)
);
const CEFR = new Set(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']);
const DIALECTS = new Set(['mexican', 'castilian', 'rioplatense', 'caribbean', 'andean', 'central_american', 'neutral_latam', 'mixed', 'unknown']);
const MAX_CHARS = 6000;

function coverage(text) {
  const tokens = text.toLowerCase().replace(/[^\p{L}\s]/gu, ' ').split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;
  return Math.round((tokens.filter(t => TOP2K.has(t)).length / tokens.length) * 1000) / 10;
}

async function fullTranscript(episodeId) {
  const parts = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('transcript_segments').select('text').eq('episode_id', episodeId)
      .order('start_time').range(from, from + 999);
    if (error) throw new Error(error.message);
    parts.push(...(data || []).map(s => s.text));
    if (!data || data.length < 1000) break;
  }
  return parts.join(' ');
}

async function classify(title, excerpt) {
  const prompt = `You are classifying a Spanish-language podcast episode for a language-learning library.

EPISODE TITLE: ${title}

TRANSCRIPT EXCERPT (auto-transcribed, may contain errors):
${excerpt}

Return ONLY a JSON object, no markdown, no explanation:
{"cefr": "<A1|A2|B1|B2|C1|C2 - difficulty for a Spanish LEARNER>", "topic": "<2-4 word English topic label>", "dialect": "<mexican|castilian|rioplatense|caribbean|andean|central_american|neutral_latam|mixed|unknown>"}`;

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: process.env.MODEL_BULK || 'google/gemini-2.5-flash-lite',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 400,
      response_format: { type: 'json_object' },
    }),
  });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}`);
  const data = await res.json();
  const json = JSON.parse((data.choices?.[0]?.message?.content || '').replace(/^```(json)?|```$/g, '').trim());
  const cefr = String(json.cefr || '').toUpperCase().trim();
  const dialect = String(json.dialect || 'unknown').toLowerCase().trim();
  if (!CEFR.has(cefr)) throw new Error('bad cefr');
  return { cefr, topic: String(json.topic || '').slice(0, 60), dialect: DIALECTS.has(dialect) ? dialect : 'unknown' };
}

const { data: pending, error } = await supabase
  .from('episodes').select('id, title').is('classified_at', null).order('id');
if (error) throw new Error(error.message);
console.log(`${pending.length} episodes to classify`);

for (const ep of pending) {
  try {
    const full = await fullTranscript(ep.id);
    if (full.trim().length < 100) {
      console.log(`SKIP ${ep.id} "${ep.title}" — no transcript`);
      continue;
    }
    const start = Math.min(Math.floor(full.length * 0.1), Math.max(0, full.length - MAX_CHARS));
    let result;
    for (let attempt = 1; ; attempt++) {
      try { result = await classify(ep.title, full.slice(start, start + MAX_CHARS)); break; }
      catch (e) {
        if (attempt >= 3) throw e;
        await new Promise(r => setTimeout(r, 2000 * attempt));
      }
    }
    const { error: upErr } = await supabase.from('episodes').update({
      cefr_level: result.cefr,
      topic: result.topic,
      dialect: result.dialect,
      freq_coverage: coverage(full),
      classified_at: new Date().toISOString(),
    }).eq('id', ep.id);
    if (upErr) throw new Error(upErr.message);
    console.log(`${ep.id} "${ep.title.slice(0, 50)}" -> ${result.cefr} / ${result.dialect} / ${result.topic}`);
  } catch (e) {
    console.error(`FAIL ${ep.id}: ${e.message.slice(0, 150)}`);
  }
}
console.log('Done.');
