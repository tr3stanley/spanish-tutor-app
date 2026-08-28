// Generate graded Spanish audio stories: an LLM writes a level-appropriate story,
// Azure neural TTS narrates it sentence by sentence, and the per-sentence audio
// durations give exact transcript timings for free (no Whisper needed — we already
// know the text). Audio lands in Supabase Storage; the story becomes a normal
// episode, so it inherits the player, click-to-translate, lessons and vocab.
//
// This is how the A1/A2 end of the library gets filled: comprehensible input at
// exactly the level we want, on demand.
//
// Usage:
//   node scripts/generate-stories.mjs --level A1 --count 2
//   node scripts/generate-stories.mjs --level B1 --count 3 --dialect mexican
//   node scripts/generate-stories.mjs --level A2 --dry-run     # write text only, no audio

import { mkdir, readFile, unlink, writeFile } from 'fs/promises';
import path from 'path';
import {
  signIn, fetchAll, getOrCreateFolder, callOpenRouter, generateLesson,
  ffmpeg, ffprobeDuration, get, TMP,
} from './lib/pipeline.mjs';

const VOICES = {
  costa_rican: 'es-CR-MariaNeural',
  mexican: 'es-MX-DaliaNeural',
  castilian: 'es-ES-ElviraNeural',
  rioplatense: 'es-AR-ElenaNeural',
  neutral_latam: 'es-US-PalomaNeural',
};

const args = process.argv.slice(2);
const val = (name, dflt) => (args.includes(name) ? args[args.indexOf(name) + 1] : dflt);
const LEVEL = (val('--level', 'A2') || 'A2').toUpperCase();
const COUNT = parseInt(val('--count', '2')) || 2;
const DIALECT = val('--dialect', 'neutral_latam');
const DRY_RUN = args.includes('--dry-run');

const VOICE = VOICES[DIALECT] || VOICES.neutral_latam;
const AZURE_KEY = get('AZURE_SPEECH_KEY');
const AZURE_REGION = get('AZURE_SPEECH_REGION') || 'eastus';

// Rough guidance per level so stories stay genuinely comprehensible.
const LEVEL_GUIDE = {
  A1: 'Present tense only. Very short sentences (5-10 words). The ~500 most common words. Lots of repetition of key words.',
  A2: 'Present and simple past (preterite). Short sentences (8-14 words). Everyday vocabulary. Some connectors (pero, porque, entonces).',
  B1: 'Past tenses including imperfect, future, basic subjunctive in set phrases. Normal sentence length. Everyday plus some abstract vocabulary.',
  B2: 'All common tenses, subjunctive, idiomatic expressions. Complex sentences with subordination. Natural spoken register.',
  C1: 'Full range including nuanced subjunctive and idiom. Sophisticated structure and vocabulary.',
};

function escapeXml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// One WAV per sentence. The trailing break is inside the synthesized audio, so
// measured durations line up exactly with the concatenated track.
async function speak(text, outPath) {
  const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${VOICE.slice(0, 5)}">` +
    `<voice name="${VOICE}"><prosody rate="-8%">${escapeXml(text)}</prosody><break time="400ms"/></voice></speak>`;

  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(`https://${AZURE_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': AZURE_KEY,
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'riff-24khz-16bit-mono-pcm',
      },
      body: ssml,
    });
    if (res.ok) {
      await writeFile(outPath, Buffer.from(await res.arrayBuffer()));
      return;
    }
    if (attempt === 3) throw new Error(`Azure TTS failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
    await new Promise(r => setTimeout(r, attempt * 2000));
  }
}

async function writeStories(existingTitles) {
  const raw = await callOpenRouter(`You are writing graded listening material for Spanish learners at CEFR level ${LEVEL}.

LEVEL RULES: ${LEVEL_GUIDE[LEVEL] || LEVEL_GUIDE.B1}

Write ${COUNT} SHORT, engaging stories in Spanish. Requirements:
- Each story is a complete little narrative with a beginning, middle and satisfying end — not a description or a list.
- Everyday situations a learner would actually meet: travel, food, work, family, misunderstandings, small adventures.
- ${LEVEL === 'A1' || LEVEL === 'A2' ? '10-16 sentences' : '16-24 sentences'} each.
- Natural spoken Spanish that sounds good read aloud. Neutral Latin American usage unless the story's setting calls for otherwise.
- Split into sentences yourself: each array item is ONE sentence, exactly as it should be spoken. No sentence numbers or bullets.
${existingTitles.length ? `- Do NOT repeat these existing story topics: ${existingTitles.join('; ')}` : ''}

Return ONLY JSON:
{"stories": [{"title": "<short Spanish title>", "topic": "<2-4 word English topic label>", "sentences": ["<sentence>", "..."]}]}`,
    { maxTokens: 4000, temperature: 0.8, json: true });

  const parsed = JSON.parse(raw.replace(/^```(json)?|```$/g, '').trim());
  return (parsed.stories || []).filter(s => s.title && Array.isArray(s.sentences) && s.sentences.length >= 5);
}

async function narrate(story, stamp) {
  const parts = [];
  const segments = [];
  let cursor = 0;

  for (let i = 0; i < story.sentences.length; i++) {
    const wav = path.join(TMP, `story-${stamp}-${String(i).padStart(3, '0')}.wav`);
    await speak(story.sentences[i], wav);
    const dur = await ffprobeDuration(wav);
    parts.push(wav);
    segments.push({ text: story.sentences[i], start: cursor, end: cursor + dur });
    cursor += dur;
  }

  const listFile = path.join(TMP, `story-${stamp}.txt`);
  await writeFile(listFile, parts.map(p => `file '${p.replace(/'/g, "'\\''")}'`).join('\n'));
  const mp3 = path.join(TMP, `story-${stamp}.mp3`);
  await ffmpeg(['-f', 'concat', '-safe', '0', '-i', listFile, '-c:a', 'libmp3lame', '-b:a', '64k', mp3, '-y']);

  await Promise.allSettled([...parts.map(unlink), unlink(listFile)]);
  return { mp3, segments, duration: cursor };
}

async function main() {
  if (!AZURE_KEY && !DRY_RUN) {
    console.error('AZURE_SPEECH_KEY is required to narrate stories (or use --dry-run)');
    process.exit(1);
  }
  await mkdir(TMP, { recursive: true });

  const supabase = await signIn();
  const folderName = `Graded Stories (${LEVEL})`;
  const existing = await fetchAll(supabase, 'episodes', 'id, title, topic');
  const existingTitles = existing
    .filter(e => (e.title || '').startsWith('Historia:'))
    .map(e => e.topic || e.title)
    .slice(0, 40);

  console.log(`Writing ${COUNT} ${LEVEL} stories (voice ${VOICE})…`);
  const stories = await writeStories(existingTitles);
  console.log(`Got ${stories.length} stories.`);

  if (DRY_RUN) {
    stories.forEach(s => {
      console.log(`\n── ${s.title} [${s.topic}] — ${s.sentences.length} sentences`);
      s.sentences.slice(0, 3).forEach(x => console.log(`   ${x}`));
      if (s.sentences.length > 3) console.log('   …');
    });
    return;
  }

  const folderId = await getOrCreateFolder(supabase, folderName);
  let made = 0;

  for (const story of stories) {
    const stamp = `${Date.now()}-${made}`;
    let episodeId = null;
    let mp3 = null;
    try {
      console.log(`\n── ${story.title} (${story.sentences.length} sentences)`);
      const narrated = await narrate(story, stamp);
      mp3 = narrated.mp3;
      console.log(`  narrated: ${Math.round(narrated.duration)}s`);

      const objectPath = `${LEVEL.toLowerCase()}/${stamp}.mp3`;
      const bytes = await readFile(mp3);
      const { error: upError } = await supabase.storage
        .from('story-audio')
        .upload(objectPath, bytes, { contentType: 'audio/mpeg', upsert: true });
      if (upError) throw new Error(`upload: ${upError.message}`);
      const { data: pub } = supabase.storage.from('story-audio').getPublicUrl(objectPath);

      const { data: ep, error } = await supabase
        .from('episodes')
        .insert({
          title: `Historia: ${story.title}`,
          filename: `${stamp}.mp3`,
          file_path: pub.publicUrl,
          language: 'spanish',
          folder_id: folderId,
          duration: Math.round(narrated.duration),
          cefr_level: LEVEL,
          dialect: DIALECT,
          topic: story.topic || null,
          classified_at: new Date().toISOString(),
        })
        .select('id')
        .single();
      if (error) throw new Error(error.message);
      episodeId = ep.id;

      const { error: segError } = await supabase.from('transcript_segments').insert(
        narrated.segments.map(s => ({
          episode_id: episodeId,
          text: s.text,
          start_time: s.start,
          end_time: s.end,
          confidence: 1, // we wrote the text; timings are exact
        }))
      );
      if (segError) throw new Error(segError.message);

      const lesson = await generateLesson(story.sentences.join(' '));
      const { error: lessonError } = await supabase.from('lessons').insert({ episode_id: episodeId, ...lesson });
      if (lessonError) throw new Error(lessonError.message);

      await supabase.from('episodes')
        .update({ processed_at: new Date().toISOString(), lesson_generated: true })
        .eq('id', episodeId);

      console.log(`  published → ${pub.publicUrl}`);
      made++;
    } catch (e) {
      console.error(`  FAILED: ${e.message}`);
      if (episodeId) {
        await supabase.from('transcript_segments').delete().eq('episode_id', episodeId);
        await supabase.from('lessons').delete().eq('episode_id', episodeId);
        await supabase.from('episodes').delete().eq('id', episodeId);
      }
    } finally {
      if (mp3) await unlink(mp3).catch(() => {});
    }
  }

  console.log(`\nDone. Published ${made} stories at ${LEVEL}.`);
}

main().catch(e => { console.error(e); process.exit(1); });
