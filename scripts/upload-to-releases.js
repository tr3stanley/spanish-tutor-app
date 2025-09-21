#!/usr/bin/env node

/**
 * Script to upload audio files to GitHub Releases
 * Usage: node scripts/upload-to-releases.js
 */

const fs = require('fs');
const path = require('path');

const REPO_OWNER = 'tr3stanley';
const REPO_NAME = 'spanish-tutor-app';
const UPLOADS_DIR = './uploads';

async function createRelease() {
  const releaseTag = `audio-files-${new Date().toISOString().split('T')[0]}`;

  console.log(`Creating release: ${releaseTag}`);
  console.log(`\nTo create this release and upload files:`);
  console.log(`\n1. Go to: https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/new`);
  console.log(`2. Set tag: ${releaseTag}`);
  console.log(`3. Set title: "Audio Files - ${new Date().toLocaleDateString()}"`);
  console.log(`4. Upload these files:`);

  // List audio files to upload
  const files = fs.readdirSync(UPLOADS_DIR).filter(file =>
    file.endsWith('.mp3') || file.endsWith('.wav') || file.endsWith('.m4a')
  );

  files.forEach(file => {
    const filePath = path.join(UPLOADS_DIR, file);
    const stats = fs.statSync(filePath);
    const sizeMB = (stats.size / (1024 * 1024)).toFixed(1);
    console.log(`   - ${file} (${sizeMB}MB)`);
  });

  console.log(`\n5. After upload, the URLs will be:`);
  files.forEach(file => {
    const url = `https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/download/${releaseTag}/${file}`;
    console.log(`   ${file} -> ${url}`);
  });

  return { releaseTag, files };
}

async function updateDatabase(releaseTag, files) {
  console.log(`\nDatabase update commands:`);
  console.log(`\n-- Update file_path to use GitHub Release URLs`);

  files.forEach(file => {
    const url = `https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/download/${releaseTag}/${file}`;
    console.log(`UPDATE podcasts SET file_path = '${url}' WHERE filename = '${file}';`);
  });
}

async function main() {
  try {
    const { releaseTag, files } = await createRelease();
    await updateDatabase(releaseTag, files);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}