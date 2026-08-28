// Phase 1: classify all episodes by CEFR level, topic, and dialect via DeepSeek,
// and compute word-frequency coverage against the top-2k Spanish list.
// Resumable: skips episodes with classified_at already set. Run: node scripts/classify-episodes.mjs

import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import path from 'path';

const ROOT = path.resolve(import.meta.dirname, '..');
const db = new Database(path.join(ROOT, 'data', 'podcasts.db'));

const envFile = readFileSync(path.join(ROOT, '.env.local'), 'utf8');
const API_KEY = envFile.match(/OPENROUTER_API_KEY=(\S+)/)?.[1];
if (!API_KEY) {
  console.error('OPENROUTER_API_KEY not found in .env.local');
  process.exit(1);
}

const TOP2K = new Set(
  readFileSync(path.join(ROOT, 'scripts', 'data', 'es_top2k.txt'), 'utf8')
    .split('\n').map(w => w.trim()).filter(Boolean)
);

const CEFR = new Set(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']);
const DIALECTS = new Set([
  'mexican', 'castilian', 'rioplatense', 'caribbean', 'andean',
  'central_american', 'neutral_latam', 'mixed', 'unknown'
]);
const CONCURRENCY = 5;
const MAX_CHARS = 6000;

function coverage(text) {
  const tokens = text.toLowerCase()
    .replace(/[^\p{L}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length === 0) return null;
  const known = tokens.filter(t => TOP2K.has(t)).length;
  return Math.round((known / tokens.length) * 1000) / 10;
}

async function classify(title, excerpt) {
  const prompt = `You are classifying a Spanish-language podcast episode for a language-learning library.

EPISODE TITLE: ${title}

TRANSCRIPT EXCERPT (auto-transcribed, may contain errors):
${excerpt}

Return ONLY a JSON object, no markdown, no explanation:
{"cefr": "<A1|A2|B1|B2|C1|C2 - difficulty for a Spanish LEARNER, judged on vocabulary range, grammar complexity, speech speed implied by phrasing, and topic abstractness>", "topic": "<2-4 word English topic label, e.g. 'daily life story', 'true crime', 'history', 'paranormal mystery'>", "dialect": "<mexican|castilian|rioplatense|caribbean|andean|central_american|neutral_latam|mixed|unknown - based on vocabulary, voseo/ustedeo, and expressions in the text>"}`;

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'deepseek/deepseek-chat',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 100,
      response_format: { type: 'json_object' },
    }),
  });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content || '';
  const json = JSON.parse(raw.replace(/^```(json)?|```$/g, '').trim());
  const cefr = String(json.cefr || '').toUpperCase().trim();
  const dialect = String(json.dialect || 'unknown').toLowerCase().trim();
  const topic = String(json.topic || '').slice(0, 60).trim();
  if (!CEFR.has(cefr)) throw new Error(`bad cefr: ${raw}`);
  return { cefr, topic, dialect: DIALECTS.has(dialect) ? dialect : 'unknown', cost: data.usage?.cost ?? 0 };
}

const getText = db.prepare(`
  SELECT group_concat(text, ' ') AS full FROM (
    SELECT text FROM transcripts WHERE podcast_id = ? ORDER BY start_time
  )
`);
const update = db.prepare(`
  UPDATE podcasts SET cefr_level = ?, topic = ?, dialect = ?, freq_coverage = ?,
    classified_at = CURRENT_TIMESTAMP WHERE id = ?
`);

const limit = Number(process.argv[2]) || 100000;
const pending = db.prepare(
  'SELECT id, title FROM podcasts WHERE classified_at IS NULL ORDER BY id LIMIT ?'
).all(limit);
console.log(`${pending.length} episodes to classify`);

let done = 0, failed = 0, totalCost = 0;

async function worker(queue) {
  for (;;) {
    const ep = queue.shift();
    if (!ep) return;
    try {
      const full = getText.get(ep.id)?.full;
      if (!full || full.trim().length < 100) {
        console.log(`SKIP ${ep.id} "${ep.title}" — no transcript`);
        failed++;
        continue;
      }
      // sample from ~10% in, past intros/theme music
      const start = Math.min(Math.floor(full.length * 0.1), Math.max(0, full.length - MAX_CHARS));
      const excerpt = full.slice(start, start + MAX_CHARS);
      const cov = coverage(full);
      let result;
      for (let attempt = 1; ; attempt++) {
        try { result = await classify(ep.title, excerpt); break; }
        catch (e) {
          if (attempt >= 3) throw e;
          await new Promise(r => setTimeout(r, 2000 * attempt));
        }
      }
      update.run(result.cefr, result.topic, result.dialect, cov, ep.id);
      totalCost += result.cost;
      done++;
      if (done % 25 === 0) console.log(`${done}/${pending.length} done, $${totalCost.toFixed(3)} spent`);
    } catch (e) {
      failed++;
      console.error(`FAIL ${ep.id} "${ep.title}": ${e.message.slice(0, 200)}`);
    }
  }
}

const queue = [...pending];
await Promise.all(Array.from({ length: CONCURRENCY }, () => worker(queue)));
console.log(`\nDone: ${done} classified, ${failed} failed, total cost $${totalCost.toFixed(3)}`);

console.log('\n--- CEFR distribution ---');
for (const r of db.prepare('SELECT cefr_level, COUNT(*) n, ROUND(AVG(freq_coverage),1) avg_cov FROM podcasts WHERE cefr_level IS NOT NULL GROUP BY cefr_level ORDER BY cefr_level').all()) {
  console.log(`${r.cefr_level}: ${r.n} episodes, avg top-2k coverage ${r.avg_cov}%`);
}
