// Phase 2: one-time migration of data/podcasts.db (SQLite) into Supabase.
// Preserves ids. Dedupes double-transcribed segments and keeps only the latest
// lesson per episode. Idempotent-ish: upserts by id. Run: node scripts/migrate-to-supabase.mjs

import Database from 'better-sqlite3';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import path from 'path';

const ROOT = path.resolve(import.meta.dirname, '..');
const env = readFileSync(path.join(ROOT, '.env.local'), 'utf8');
const url = env.match(/SUPABASE_URL=(\S+)/)?.[1];
const key = env.match(/SUPABASE_KEY=(\S+)/)?.[1];
if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_KEY missing from .env.local');

const supabase = createClient(url, key);
const db = new Database(path.join(ROOT, 'data', 'podcasts.db'), { readonly: true });

async function upsertBatch(table, rows, batchSize = 1000) {
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await supabase.from(table).upsert(batch);
    if (error) throw new Error(`${table} batch ${i}: ${error.message}`);
    process.stdout.write(`\r${table}: ${Math.min(i + batchSize, rows.length)}/${rows.length}`);
  }
  console.log();
}

// --- folders ---
const folders = db.prepare('SELECT id, name, created_at FROM folders').all()
  .map(f => ({ id: f.id, name: f.name, created_at: new Date(f.created_at + 'Z').toISOString() }));
await upsertBatch('folders', folders);

// --- episodes ---
const episodes = db.prepare('SELECT * FROM podcasts').all().map(p => ({
  id: p.id,
  title: p.title,
  filename: p.filename,
  file_path: p.file_path,
  language: p.language,
  duration: p.duration,
  youtube_video_id: p.youtube_video_id,
  folder_id: p.folder_id,
  listened: !!p.listened,
  lesson_generated: !!p.lesson_generated,
  cefr_level: p.cefr_level,
  topic: p.topic,
  dialect: p.dialect,
  freq_coverage: p.freq_coverage,
  classified_at: p.classified_at ? new Date(p.classified_at + 'Z').toISOString() : null,
  created_at: p.created_at ? new Date(p.created_at + 'Z').toISOString() : null,
  processed_at: p.processed_at ? new Date(p.processed_at + 'Z').toISOString() : null,
}));
await upsertBatch('episodes', episodes);

// --- transcript segments (dedupe exact duplicates from double transcription) ---
const segments = db.prepare(
  `SELECT MIN(id) id, podcast_id, text, start_time, end_time, MAX(confidence) confidence
   FROM transcripts GROUP BY podcast_id, start_time, end_time, text ORDER BY MIN(id)`
).all().map(t => ({
  id: t.id,
  episode_id: t.podcast_id,
  text: t.text,
  start_time: t.start_time,
  end_time: t.end_time,
  confidence: t.confidence,
}));
console.log(`segments after dedupe: ${segments.length} (raw: ${db.prepare('SELECT COUNT(*) n FROM transcripts').get().n})`);
await upsertBatch('transcript_segments', segments, 2000);

// --- lessons (latest per episode only) ---
const lessons = db.prepare(
  `SELECT l.* FROM lessons l
   WHERE l.id = (SELECT MAX(id) FROM lessons WHERE podcast_id = l.podcast_id)`
).all().map(l => ({
  id: l.id,
  episode_id: l.podcast_id,
  summary: l.summary,
  grammar_rules: l.grammar_rules,
  vocabulary: l.vocabulary,
  created_at: l.created_at ? new Date(l.created_at + 'Z').toISOString() : null,
}));
console.log(`lessons kept (latest per episode): ${lessons.length}`);
await upsertBatch('lessons', lessons);

// --- explanations ---
const explanations = db.prepare('SELECT * FROM explanations').all().map(e => ({
  id: e.id,
  episode_id: e.podcast_id,
  start_time: e.start_time,
  end_time: e.end_time,
  explanation: e.explanation,
  created_at: e.created_at ? new Date(e.created_at + 'Z').toISOString() : null,
}));
await upsertBatch('explanations', explanations);

console.log('\nMigration complete. Re-sync sequences with fix-sequences SQL (see PLAN.md) before inserting new rows.');
