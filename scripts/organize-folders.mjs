// Phase 1: file the 725 loose StoryLearning Spanish episodes into per-season folders.
// Run: node scripts/organize-folders.mjs

import Database from 'better-sqlite3';
import path from 'path';

const db = new Database(path.join(import.meta.dirname, '..', 'data', 'podcasts.db'));

const getFolder = db.prepare('SELECT id FROM folders WHERE name = ?');
const addFolder = db.prepare('INSERT INTO folders (name) VALUES (?)');

function folderId(name) {
  const row = getFolder.get(name);
  return row ? row.id : addFolder.run(name).lastInsertRowid;
}

const assign = db.prepare(
  "UPDATE podcasts SET folder_id = ? WHERE folder_id IS NULL AND title LIKE ?"
);

const tx = db.transaction(() => {
  for (const season of [6, 7, 8, 9, 10]) {
    const n = assign.run(folderId(`StoryLearning Spanish S${season}`), `%-Season-${season}-%`).changes;
    console.log(`S${season}: ${n} episodes filed`);
  }
  const extras = assign.run(folderId('StoryLearning Spanish Extras'), 'story learning spanish%').changes;
  console.log(`Extras: ${extras} episodes filed`);
});
tx();

const left = db.prepare('SELECT COUNT(*) n FROM podcasts WHERE folder_id IS NULL').get().n;
console.log(`Unfiled remaining: ${left}`);
