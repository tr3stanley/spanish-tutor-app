// Shared helpers for the content pipeline scripts (sync-podcasts, import-librivox,
// generate-stories). All of them sign in as the pipeline service account and write
// through normal authed RLS.

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { mkdir, readFile, stat, unlink, writeFile } from 'fs/promises';
import { execFile } from 'child_process';
import path from 'path';

export const ROOT = path.resolve(import.meta.dirname, '..', '..');
const env = readFileSync(path.join(ROOT, '.env.local'), 'utf8');
export const get = k => env.match(new RegExp(`^${k}=(.+)$`, 'm'))?.[1]?.trim();

export const TMP = path.join(ROOT, 'temp-downloads');

// Feeds and Archive.org metadata often double-encode entities (&aacute;, &#8230;).
export function decodeEntities(s) {
  const named = { aacute:'á', eacute:'é', iacute:'í', oacute:'ó', uacute:'ú', ntilde:'ñ',
    Aacute:'Á', Eacute:'É', Iacute:'Í', Oacute:'Ó', Uacute:'Ú', Ntilde:'Ñ',
    uuml:'ü', Uuml:'Ü', iquest:'¿', iexcl:'¡', hellip:'…', mdash:'—', ndash:'–',
    quot:'"', apos:"'", lt:'<', gt:'>', nbsp:' ', laquo:'«', raquo:'»' };
  let out = String(s);
  for (let i = 0; i < 2; i++) {
    out = out
      .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n)))
      .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
      .replace(/&([a-zA-Z]+);/g, (m, name) => named[name] ?? m)
      .replace(/&amp;/g, '&');
  }
  return out.trim();
}

export function ffmpeg(args) {
  return new Promise((resolve, reject) => {
    execFile('ffmpeg', args, { maxBuffer: 10 * 1024 * 1024 }, err => (err ? reject(err) : resolve()));
  });
}

export function ffprobeDuration(file) {
  return new Promise((resolve, reject) => {
    execFile('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file],
      (err, stdout) => (err ? reject(err) : resolve(parseFloat(String(stdout).trim()))));
  });
}

export async function signIn() {
  const supabase = createClient(get('NEXT_PUBLIC_SUPABASE_URL'), get('NEXT_PUBLIC_SUPABASE_ANON_KEY'));
  const { error } = await supabase.auth.signInWithPassword({
    email: get('PIPELINE_EMAIL'),
    password: get('PIPELINE_PASSWORD'),
  });
  if (error) throw new Error(`Pipeline sign-in failed: ${error.message}`);
  return supabase;
}

export async function fetchAll(supabase, table, cols, order = 'id') {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select(cols).order(order).range(from, from + 999);
    if (error) throw new Error(error.message);
    rows.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

export async function getOrCreateFolder(supabase, name, cache) {
  if (cache?.has(name)) return cache.get(name);
  const { data: existing } = await supabase.from('folders').select('id').eq('name', name).maybeSingle();
  if (existing) {
    cache?.set(name, existing.id);
    return existing.id;
  }
  const { data, error } = await supabase.from('folders').insert({ name }).select('id').single();
  if (error) throw new Error(error.message);
  cache?.set(name, data.id);
  return data.id;
}

export async function callOpenRouter(prompt, { maxTokens = 4000, temperature = 0.3, json = false } = {}) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${get('OPENROUTER_API_KEY')}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'deepseek/deepseek-chat',
          messages: [{ role: 'user', content: prompt }],
          temperature,
          max_tokens: maxTokens,
          ...(json ? { response_format: { type: 'json_object' } } : {}),
        }),
      });
      if (!res.ok) throw new Error(`OpenRouter ${res.status}`);
      return (await res.json()).choices?.[0]?.message?.content || '';
    } catch (e) {
      if (attempt === 3) throw e;
      await new Promise(r => setTimeout(r, attempt * 3000));
    }
  }
}

// Same lesson shape the app generates (---SUMMARY---/---GRAMMAR---/---VOCABULARY---).
export async function generateLesson(transcript) {
  const raw = await callOpenRouter(`You are an expert Spanish language teacher. Analyze this transcript and create a comprehensive lesson plan.

TRANSCRIPT:
${transcript.slice(0, 12000)}

CRITICAL: DO NOT return JSON. Return PLAIN TEXT ONLY in this EXACT format:

---SUMMARY---
A clear, engaging summary of what this covers in 2-3 paragraphs

---GRAMMAR---
5-8 key grammar concepts from the text. For each: a descriptive title, when/why it's used, concrete examples from the text, practical tips. Translate ALL Spanish to English.

---VOCABULARY---
15-20 vocabulary words from the text. For each: the Spanish word, English translation, part of speech, example sentence from the text with translation, usage notes.`);
  const section = name => raw.split(`---${name}---`)[1]?.split(/---[A-Z]+---/)[0]?.trim() || null;
  return { summary: section('SUMMARY'), grammar_rules: section('GRAMMAR'), vocabulary: section('VOCABULARY') };
}

// Level/topic/dialect tagging — same contract as scripts/classify-supabase.mjs.
export async function classify(title, transcript) {
  try {
    const raw = await callOpenRouter(`You are classifying Spanish-language audio for a language-learning library.

TITLE: ${title}

TRANSCRIPT EXCERPT (auto-transcribed, may contain errors):
${transcript.slice(0, 6000)}

Return ONLY a JSON object, no markdown, no explanation:
{"cefr": "<A1|A2|B1|B2|C1|C2 - difficulty for a Spanish LEARNER>", "topic": "<2-4 word English topic label>", "dialect": "<mexican|castilian|rioplatense|caribbean|andean|central_american|neutral_latam|mixed|unknown>"}`,
      { maxTokens: 100, temperature: 0.1, json: true });
    const p = JSON.parse(raw.replace(/^```(json)?|```$/g, '').trim());
    return { cefr_level: p.cefr || null, topic: p.topic || null, dialect: p.dialect || null };
  } catch {
    return { cefr_level: null, topic: null, dialect: null };
  }
}

export async function downloadWithRetry(url, dest, attempts = 3) {
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': 'spanish-tutor-pipeline/1.0' } });
      if (!res.ok) throw new Error(`status ${res.status}`);
      await writeFile(dest, Buffer.from(await res.arrayBuffer()));
      return;
    } catch (e) {
      if (i === attempts) throw new Error(`download failed after ${attempts} tries: ${e.message}`);
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
    headers: { Authorization: `Bearer ${get('GROQ_API_KEY')}` },
    body: fd,
  });
  if (!res.ok) throw new Error(`Groq failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  return (await res.json()).segments || [];
}

// Download, re-encode to 16kHz mono Opus (~7MB/hour), transcribe. Groq's own URL
// fetcher doesn't follow CDN redirects and its API caps uploads at 25MB, so long
// audio is split into 45-minute chunks and stitched back together.
const GROQ_MAX_BYTES = 24 * 1024 * 1024;
const CHUNK_SECONDS = 45 * 60;

export async function transcribeWithGroq(url) {
  await mkdir(TMP, { recursive: true });
  const stamp = Date.now();
  const rawPath = path.join(TMP, `dl-${stamp}${path.extname(new URL(url).pathname) || '.mp3'}`);
  const oggPath = path.join(TMP, `dl-${stamp}.ogg`);
  const chunkPaths = [];

  try {
    await downloadWithRetry(url, rawPath);
    await ffmpeg(['-i', rawPath, '-vn', '-ar', '16000', '-ac', '1', '-c:a', 'libopus', '-b:a', '16k', oggPath, '-y']);

    const { size } = await stat(oggPath);
    if (size <= GROQ_MAX_BYTES) {
      return (await postToGroq(oggPath))
        .map(s => ({ text: (s.text || '').trim(), start: s.start ?? 0, end: s.end ?? 0 }))
        .filter(s => s.text && s.end > s.start);
    }

    const pattern = path.join(TMP, `dl-${stamp}-chunk%03d.ogg`);
    await ffmpeg(['-i', oggPath, '-vn', '-f', 'segment', '-segment_time', String(CHUNK_SECONDS),
      '-ar', '16000', '-ac', '1', '-c:a', 'libopus', '-b:a', '16k', pattern, '-y']);

    const all = [];
    for (let i = 0; ; i++) {
      const chunk = path.join(TMP, `dl-${stamp}-chunk${String(i).padStart(3, '0')}.ogg`);
      try { await stat(chunk); } catch { break; }
      chunkPaths.push(chunk);
      const offset = i * CHUNK_SECONDS;
      all.push(...(await postToGroq(chunk))
        .map(s => ({ text: (s.text || '').trim(), start: (s.start ?? 0) + offset, end: (s.end ?? 0) + offset }))
        .filter(s => s.text && s.end > s.start));
    }
    console.log(`    (split into ${chunkPaths.length} chunks)`);
    return all;
  } finally {
    await Promise.allSettled([unlink(rawPath), unlink(oggPath), ...chunkPaths.map(unlink)]);
  }
}

// Insert an episode with its transcript and lesson. Cleans up the episode row if
// any step fails, so no half-imported episodes linger.
export async function importEpisode(supabase, { title, filename, filePath, folderId, segments, level, dialect, topic }) {
  let episodeId = null;
  try {
    const { data: ep, error } = await supabase
      .from('episodes')
      .insert({
        title,
        filename,
        file_path: filePath,
        language: 'spanish',
        folder_id: folderId,
        cefr_level: level || null,
        dialect: dialect || null,
        topic: topic || null,
        classified_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    episodeId = ep.id;

    const { error: segError } = await supabase.from('transcript_segments').insert(
      segments.map(s => ({ episode_id: episodeId, text: s.text, start_time: s.start, end_time: s.end, confidence: 0.9 }))
    );
    if (segError) throw new Error(segError.message);

    const lesson = await generateLesson(segments.map(s => s.text).join(' '));
    const { error: lessonError } = await supabase.from('lessons').insert({ episode_id: episodeId, ...lesson });
    if (lessonError) throw new Error(lessonError.message);

    await supabase.from('episodes')
      .update({ processed_at: new Date().toISOString(), lesson_generated: true })
      .eq('id', episodeId);
    return episodeId;
  } catch (e) {
    if (episodeId) {
      await supabase.from('transcript_segments').delete().eq('episode_id', episodeId);
      await supabase.from('lessons').delete().eq('episode_id', episodeId);
      await supabase.from('episodes').delete().eq('id', episodeId);
    }
    throw e;
  }
}
