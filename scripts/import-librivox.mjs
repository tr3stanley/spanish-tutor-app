// Import Spanish LibriVox audiobooks (public domain — legally re-hostable) as
// episodes, so they get the existing player: transcript, click-to-translate,
// lessons, vocab. Audio streams from Archive.org; we only store the URL.
//
// Chapters become episodes inside a folder per book. Transcripts come from Groq
// Whisper, then each chapter is level-tagged like the rest of the library.
//
// Usage:
//   node scripts/import-librivox.mjs --dry-run          # list what would import
//   node scripts/import-librivox.mjs                    # 2 books, 6 chapters each
//   node scripts/import-librivox.mjs --books 3 --chapters 4
//   node scripts/import-librivox.mjs --id elclavo_2305_librivox

import {
  signIn, fetchAll, getOrCreateFolder, transcribeWithGroq, classify, importEpisode, decodeEntities,
} from './lib/pipeline.mjs';

const args = process.argv.slice(2);
const flag = (name, dflt) => (args.includes(name) ? parseInt(args[args.indexOf(name) + 1]) || dflt : dflt);
const BOOKS = flag('--books', 2);
const CHAPTERS = flag('--chapters', 6);
const ONLY_ID = args.includes('--id') ? args[args.indexOf('--id') + 1] : null;
const DRY_RUN = args.includes('--dry-run');

// Most-downloaded first — popularity tracks reading quality on LibriVox.
async function findSpanishBooks(rows) {
  const url = 'https://archive.org/advancedsearch.php?q=' +
    encodeURIComponent('collection:librivoxaudio AND language:spa') +
    '&fl[]=identifier&fl[]=title&fl[]=creator&fl[]=downloads' +
    `&sort[]=downloads+desc&rows=${rows}&page=1&output=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Archive.org search failed: ${res.status}`);
  return (await res.json()).response.docs;
}

async function bookChapters(identifier) {
  const res = await fetch(`https://archive.org/metadata/${identifier}`);
  if (!res.ok) throw new Error(`metadata failed: ${res.status}`);
  const data = await res.json();
  const files = data.files || [];
  // Prefer the 64kbps encodes; fall back to whatever mp3s exist.
  let mp3s = files.filter(f => /_64kb\.mp3$/i.test(f.name || ''));
  if (mp3s.length === 0) mp3s = files.filter(f => /\.mp3$/i.test(f.name || ''));
  return mp3s
    .map(f => ({
      name: f.name,
      title: decodeEntities(f.title || f.name.replace(/\.mp3$/i, '')),
      seconds: (() => {
        const parts = String(f.length || '').split(':').map(Number);
        if (parts.some(isNaN) || parts.length === 0) return null;
        return parts.reduce((acc, p) => acc * 60 + p, 0);
      })(),
      url: `https://archive.org/download/${identifier}/${encodeURIComponent(f.name)}`,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}

async function main() {
  const supabase = await signIn();
  const existing = await fetchAll(supabase, 'episodes', 'id, title, file_path');
  const knownUrls = new Set(existing.map(e => e.file_path));
  const folderCache = new Map();

  let books;
  if (ONLY_ID) {
    const res = await fetch(`https://archive.org/metadata/${ONLY_ID}`);
    const meta = (await res.json()).metadata || {};
    books = [{ identifier: ONLY_ID, title: meta.title, creator: meta.creator }];
  } else {
    // Over-fetch: some results are Bible readings or collections we skip.
    books = await findSpanishBooks(BOOKS * 4);
  }

  let imported = 0;
  let booksUsed = 0;
  for (const book of books) {
    if (!ONLY_ID && booksUsed >= BOOKS) break;

    const author = Array.isArray(book.creator) ? book.creator[0] : book.creator;
    const bookTitle = decodeEntities(book.title);
    const label = `${bookTitle}${author ? ` — ${author}` : ''}`;
    console.log(`\n── ${label}`);

    let chapters;
    try {
      chapters = await bookChapters(book.identifier);
    } catch (e) {
      console.log(`  ${e.message}, skipping`);
      continue;
    }

    const fresh = chapters.filter(c => !knownUrls.has(c.url)).slice(0, CHAPTERS);
    console.log(`  ${chapters.length} chapters, ${fresh.length} to import`);
    if (fresh.length === 0) continue;

    if (DRY_RUN) {
      fresh.forEach(c => console.log(`  [dry-run] ${c.title} (${c.seconds ? Math.round(c.seconds / 60) + 'min' : '?'})`));
      booksUsed++;
      continue;
    }

    const folderName = `LibriVox · ${bookTitle}`.slice(0, 90);
    const folderId = await getOrCreateFolder(supabase, folderName, folderCache);

    for (const ch of fresh) {
      try {
        console.log(`  + ${ch.title}`);
        const segments = await transcribeWithGroq(ch.url);
        console.log(`    ${segments.length} segments`);
        const text = segments.map(s => s.text).join(' ');
        const tags = await classify(`${bookTitle} — ${ch.title}`, text);
        await importEpisode(supabase, {
          title: `${bookTitle} · ${ch.title}`.slice(0, 200),
          filename: ch.name,
          filePath: ch.url,
          folderId,
          segments,
          level: tags.cefr_level,
          dialect: tags.dialect,
          topic: tags.topic,
        });
        console.log(`    imported [${tags.cefr_level || '?'}]`);
        knownUrls.add(ch.url);
        imported++;
      } catch (e) {
        console.error(`    FAILED: ${e.message}`);
      }
    }
    booksUsed++;
  }

  console.log(`\nDone. Imported ${imported} chapters.`);
}

main().catch(e => { console.error(e); process.exit(1); });
