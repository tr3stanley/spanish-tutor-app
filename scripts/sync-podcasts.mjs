// Curated podcast pipeline: pull new episodes from level-tagged feeds into Supabase.
// Feeds are resolved by name via the iTunes Search API (free, no key). Transcripts
// come from the feed's <podcast:transcript> when offered, otherwise Groq Whisper
// large-v3-turbo ($0.04/audio-hour). Lessons via OpenRouter, same format as the app.
//
// Signs in as the pipeline service account (PIPELINE_EMAIL/PIPELINE_PASSWORD in
// .env.local) — writes go through normal authed RLS like any user.
//
// Usage:
//   node scripts/sync-podcasts.mjs                 # up to 3 new episodes per show
//   node scripts/sync-podcasts.mjs --limit 5
//   node scripts/sync-podcasts.mjs --show "Hoy Hablamos"
//   node scripts/sync-podcasts.mjs --dry-run       # resolve + list, write nothing

import { createClient } from '@supabase/supabase-js';
import { XMLParser } from 'fast-xml-parser';
import { readFileSync } from 'fs';
import { mkdir, readFile, stat, unlink, writeFile } from 'fs/promises';
import { execFile } from 'child_process';
import path from 'path';
import { decodeEntities } from './lib/pipeline.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const env = readFileSync(path.join(ROOT, '.env.local'), 'utf8');
const get = k => env.match(new RegExp(`^${k}=(.+)$`, 'm'))?.[1]?.trim();

const SUPABASE_URL = get('NEXT_PUBLIC_SUPABASE_URL');
const ANON_KEY = get('NEXT_PUBLIC_SUPABASE_ANON_KEY');
const OPENROUTER_KEY = get('OPENROUTER_API_KEY');
const GROQ_KEY = get('GROQ_API_KEY');
const PIPELINE_EMAIL = get('PIPELINE_EMAIL');
const PIPELINE_PASSWORD = get('PIPELINE_PASSWORD');

// Curated shows chosen to fill the library's level gaps (A1/A2 and B2+).
const SHOWS = [
  { search: 'Chill Spanish Listening Practice', level: 'A1', dialect: 'neutral_latam', folder: 'Chill Spanish (A1-A2)' },
  { search: 'Cuentame Spanish Comprehensible Input', level: 'A2', dialect: 'neutral_latam', folder: 'Cuéntame (A2)' },
  { search: 'Simple Stories in Spanish', level: 'A2', dialect: 'neutral_latam', folder: 'Simple Stories in Spanish (A2)' },
  { search: 'Duolingo Spanish Podcast', level: 'B1', dialect: 'neutral_latam', folder: 'Duolingo Podcast (B1)' },
  { search: 'Espanol con Juan', level: 'B2', dialect: 'castilian', folder: 'Español con Juan (B1-B2)' },
  { search: 'Hoy Hablamos', level: 'B1', dialect: 'castilian', folder: 'Hoy Hablamos (B1-B2)' },
  { search: 'No Hay Tos', level: 'B2', dialect: 'mexican', folder: 'No Hay Tos (B2)' },
  { search: 'Radio Ambulante', level: 'C1', dialect: 'neutral_latam', folder: 'Radio Ambulante (C1)' },
];

const args = process.argv.slice(2);
const LIMIT = parseInt(args[args.indexOf('--limit') + 1]) || 3;
const ONLY_SHOW = args.includes('--show') ? args[args.indexOf('--show') + 1] : null;
const DRY_RUN = args.includes('--dry-run');

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

async function resolveFeed(search) {
  const res = await fetch(`https://itunes.apple.com/search?media=podcast&limit=3&term=${encodeURIComponent(search)}`);
  const data = await res.json();
  const hit = (data.results || []).find(r => r.feedUrl);
  return hit ? { feedUrl: hit.feedUrl, name: hit.collectionName } : null;
}

function asArray(x) {
  return Array.isArray(x) ? x : x == null ? [] : [x];
}

async function fetchFeedItems(feedUrl) {
  const res = await fetch(feedUrl, { headers: { 'User-Agent': 'spanish-tutor-pipeline/1.0' } });
  if (!res.ok) throw new Error(`Feed fetch failed: ${res.status}`);
  const xml = parser.parse(await res.text());
  const items = asArray(xml?.rss?.channel?.item);
  return items
    .map(it => {
      const enclosure = asArray(it.enclosure)[0];
      const transcript = asArray(it['podcast:transcript']).find(t =>
        /srt|vtt|subrip/i.test(t?.['@_type'] || '') || /\.(srt|vtt)$/i.test(t?.['@_url'] || '')
      );
      return {
        title: decodeEntities(it.title ?? ''),
        url: enclosure?.['@_url'] || null,
        pubDate: it.pubDate ? new Date(it.pubDate) : null,
        transcriptUrl: transcript?.['@_url'] || null,
      };
    })
    .filter(it => it.title && it.url);
}

// SRT or VTT -> [{text, start, end}]
function parseCaptions(raw) {
  const toSec = ts => {
    const m = ts.trim().match(/(?:(\d+):)?(\d+):(\d+)[.,](\d+)/);
    if (!m) return null;
    return (parseInt(m[1] || 0) * 3600) + (parseInt(m[2]) * 60) + parseInt(m[3]) + parseInt(m[4].padEnd(3, '0').slice(0, 3)) / 1000;
  };
  const segments = [];
  for (const block of raw.replace(/\r/g, '').split(/\n\n+/)) {
    const lines = block.split('\n').filter(l => l.trim());
    const timeLine = lines.find(l => l.includes('-->'));
    if (!timeLine) continue;
    const [a, b] = timeLine.split('-->');
    const start = toSec(a), end = toSec(b);
    const text = lines.slice(lines.indexOf(timeLine) + 1).join(' ').replace(/<[^>]+>/g, '').trim();
    if (start != null && end != null && end > start && text) segments.push({ text, start, end });
  }
  return segments;
}

const ffmpeg = args_ => new Promise((resolve, reject) => {
  execFile('ffmpeg', args_, { maxBuffer: 10 * 1024 * 1024 }, err => (err ? reject(err) : resolve()));
});

async function downloadWithRetry(url, dest, attempts = 3) {
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': 'spanish-tutor-pipeline/1.0' } });
      if (!res.ok) throw new Error(`status ${res.status}`);
      await writeFile(dest, Buffer.from(await res.arrayBuffer()));
      return;
    } catch (e) {
      if (i === attempts) throw new Error(`audio download failed after ${attempts} tries: ${e.message}`);
      await new Promise(r => setTimeout(r, i * 3000));
    }
  }
}

async function postToGroq(filePath) {
  const bytes = await readFile(filePath);
  const fd = new FormData();
  fd.append('model', 'whisper-large-v3-turbo');
  fd.append('language', 'es');
  fd.append('response_format', 'verbose_json');
  fd.append('temperature', '0');
  fd.append('file', new Blob([new Uint8Array(bytes)]), path.basename(filePath));

  const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${GROQ_KEY}` },
    body: fd,
  });
  if (!res.ok) throw new Error(`Groq failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  return (await res.json()).segments || [];
}

// Groq's own URL fetcher doesn't follow podcast CDN redirects, so download the
// audio ourselves and re-encode to 16kHz mono Opus (~7MB/hour — Whisper
// downsamples to 16kHz anyway, so nothing useful is lost). Episodes still over
// the 25MB API limit are split into 45-minute chunks and stitched back together.
const GROQ_MAX_BYTES = 24 * 1024 * 1024;
const CHUNK_SECONDS = 45 * 60;

async function transcribeWithGroq(url) {
  const tmpDir = path.join(ROOT, 'temp-downloads');
  await mkdir(tmpDir, { recursive: true });
  const stamp = Date.now();
  const rawPath = path.join(tmpDir, `sync-${stamp}${path.extname(new URL(url).pathname) || '.mp3'}`);
  const oggPath = path.join(tmpDir, `sync-${stamp}.ogg`);
  const chunkPaths = [];

  try {
    await downloadWithRetry(url, rawPath);
    await ffmpeg(['-i', rawPath, '-vn', '-ar', '16000', '-ac', '1', '-c:a', 'libopus', '-b:a', '16k', oggPath, '-y']);

    const { size } = await stat(oggPath);
    if (size <= GROQ_MAX_BYTES) {
      const segments = await postToGroq(oggPath);
      return segments
        .map(s => ({ text: (s.text || '').trim(), start: s.start ?? 0, end: s.end ?? 0 }))
        .filter(s => s.text && s.end > s.start);
    }

    // Long episode: split, transcribe each chunk, shift timestamps back into place
    const pattern = path.join(tmpDir, `sync-${stamp}-chunk%03d.ogg`);
    await ffmpeg(['-i', oggPath, '-vn', '-f', 'segment', '-segment_time', String(CHUNK_SECONDS),
      '-ar', '16000', '-ac', '1', '-c:a', 'libopus', '-b:a', '16k', pattern, '-y']);

    const all = [];
    for (let i = 0; ; i++) {
      const chunk = path.join(tmpDir, `sync-${stamp}-chunk${String(i).padStart(3, '0')}.ogg`);
      try { await stat(chunk); } catch { break; }
      chunkPaths.push(chunk);
      const offset = i * CHUNK_SECONDS;
      const segments = await postToGroq(chunk);
      all.push(...segments
        .map(s => ({ text: (s.text || '').trim(), start: (s.start ?? 0) + offset, end: (s.end ?? 0) + offset }))
        .filter(s => s.text && s.end > s.start));
    }
    console.log(`    (split into ${chunkPaths.length} chunks)`);
    return all;
  } finally {
    await Promise.allSettled([unlink(rawPath), unlink(oggPath), ...chunkPaths.map(unlink)]);
  }
}

async function callOpenRouter(prompt, maxTokens = 4000) {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENROUTER_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: process.env.MODEL_CHAT || 'openai/gpt-oss-120b',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: maxTokens,
    }),
  });
  if (!res.ok) throw new Error(`OpenRouter failed (${res.status})`);
  return (await res.json()).choices?.[0]?.message?.content || '';
}

// Same lesson shape the app generates (---SUMMARY---/---GRAMMAR---/---VOCABULARY---).
async function generateLesson(transcript) {
  const raw = await callOpenRouter(`You are an expert Spanish language teacher. Analyze this podcast transcript and create a comprehensive lesson plan.

TRANSCRIPT:
${transcript.slice(0, 12000)}

CRITICAL: DO NOT return JSON. Return PLAIN TEXT ONLY in this EXACT format:

---SUMMARY---
A clear, engaging summary of what the podcast covers in 2-3 paragraphs

---GRAMMAR---
5-8 key grammar concepts from the podcast. For each: a descriptive title, when/why it's used, concrete examples from the transcript, practical tips. Translate ALL Spanish to English.

---VOCABULARY---
15-20 vocabulary words from the podcast. For each: the Spanish word, English translation, part of speech, example sentence from the transcript with translation, usage notes.`);
  const section = name => raw.split(`---${name}---`)[1]?.split(/---[A-Z]+---/)[0]?.trim() || null;
  return { summary: section('SUMMARY'), grammar_rules: section('GRAMMAR'), vocabulary: section('VOCABULARY') };
}

async function fetchAll(supabase, table, cols, order = 'id') {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select(cols).order(order).range(from, from + 999);
    if (error) throw new Error(error.message);
    rows.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

async function main() {
  for (const [k, v] of Object.entries({ SUPABASE_URL, ANON_KEY, OPENROUTER_KEY, GROQ_KEY, PIPELINE_EMAIL, PIPELINE_PASSWORD })) {
    if (!v) { console.error(`Missing ${k} in .env.local`); process.exit(1); }
  }

  const supabase = createClient(SUPABASE_URL, ANON_KEY);
  const { error: authError } = await supabase.auth.signInWithPassword({ email: PIPELINE_EMAIL, password: PIPELINE_PASSWORD });
  if (authError) { console.error('Pipeline sign-in failed:', authError.message); process.exit(1); }

  const existing = await fetchAll(supabase, 'episodes', 'id, title, file_path');
  const knownUrls = new Set(existing.map(e => e.file_path));
  const knownTitles = new Set(existing.map(e => e.title));
  const folders = await fetchAll(supabase, 'folders', 'id, name');
  const folderIds = new Map(folders.map(f => [f.name, f.id]));

  let totalAdded = 0;
  for (const show of SHOWS) {
    if (ONLY_SHOW && !show.folder.toLowerCase().includes(ONLY_SHOW.toLowerCase()) && !show.search.toLowerCase().includes(ONLY_SHOW.toLowerCase())) continue;

    console.log(`\n── ${show.search} [${show.level}]`);
    const feed = await resolveFeed(show.search);
    if (!feed) { console.log('  feed not found on iTunes, skipping'); continue; }
    console.log(`  resolved: "${feed.name}" -> ${feed.feedUrl}`);

    let items;
    try {
      items = await fetchFeedItems(feed.feedUrl);
    } catch (e) {
      console.log(`  ${e.message}, skipping`);
      continue;
    }
    items.sort((a, b) => (b.pubDate ?? 0) - (a.pubDate ?? 0));
    const fresh = items.filter(it => !knownUrls.has(it.url) && !knownTitles.has(it.title)).slice(0, LIMIT);
    console.log(`  ${items.length} episodes in feed, ${fresh.length} new (limit ${LIMIT})`);

    if (DRY_RUN) {
      fresh.forEach(it => console.log(`  [dry-run] would add: ${it.title}${it.transcriptUrl ? ' (publisher transcript)' : ''}`));
      continue;
    }
    if (fresh.length === 0) continue;

    let folderId = folderIds.get(show.folder);
    if (!folderId) {
      const { data, error } = await supabase.from('folders').insert({ name: show.folder }).select('id').single();
      if (error) throw new Error(error.message);
      folderId = data.id;
      folderIds.set(show.folder, folderId);
    }

    for (const it of fresh) {
      let episodeId = null;
      try {
        console.log(`  + ${it.title}`);
        const { data: ep, error } = await supabase
          .from('episodes')
          .insert({
            title: it.title,
            filename: path.basename(new URL(it.url).pathname) || 'episode.mp3',
            file_path: it.url,
            language: 'spanish',
            folder_id: folderId,
            cefr_level: show.level,
            dialect: show.dialect,
            classified_at: new Date().toISOString(),
          })
          .select('id')
          .single();
        if (error) throw new Error(error.message);
        episodeId = ep.id;

        let segments = [];
        if (it.transcriptUrl) {
          try {
            const res = await fetch(it.transcriptUrl);
            if (res.ok) segments = parseCaptions(await res.text());
            if (segments.length > 0) console.log(`    publisher transcript: ${segments.length} segments`);
          } catch { /* fall through to Groq */ }
        }
        if (segments.length === 0) {
          segments = await transcribeWithGroq(it.url);
          console.log(`    groq transcript: ${segments.length} segments`);
        }

        const { error: segError } = await supabase.from('transcript_segments').insert(
          segments.map(s => ({ episode_id: ep.id, text: s.text, start_time: s.start, end_time: s.end, confidence: 0.9 }))
        );
        if (segError) throw new Error(segError.message);

        const lesson = await generateLesson(segments.map(s => s.text).join(' '));
        const { error: lessonError } = await supabase.from('lessons').insert({ episode_id: ep.id, ...lesson });
        if (lessonError) throw new Error(lessonError.message);

        await supabase.from('episodes').update({ processed_at: new Date().toISOString(), lesson_generated: true }).eq('id', ep.id);
        knownUrls.add(it.url);
        knownTitles.add(it.title);
        totalAdded++;
      } catch (e) {
        console.error(`    FAILED: ${e.message}`);
        // Don't leave a half-imported episode behind (no transcript = broken row)
        if (episodeId) {
          await supabase.from('transcript_segments').delete().eq('episode_id', episodeId);
          await supabase.from('lessons').delete().eq('episode_id', episodeId);
          await supabase.from('episodes').delete().eq('id', episodeId);
        }
      }
    }
  }

  console.log(`\nDone. Added ${totalAdded} episodes.`);
}

main().catch(e => { console.error(e); process.exit(1); });
