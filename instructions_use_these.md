# Spanish/Russian Tutor App - Complete Instructions

## Overview

This is a language learning app that turns podcasts into interactive lessons with AI-powered transcription, lesson plans, and tutoring. It works both locally and deployed on Vercel, with clever use of free services for hosting and processing.

## Technology Stack

- **Framework**: Next.js 15.5.3 with React 19 and TypeScript
- **Database**: SQLite (committed to git for persistence)
- **Transcription**: Local Whisper CLI (ggml-base model)
- **AI**: OpenRouter API (DeepSeek model)
- **Audio Storage**:
  - GitHub Releases (production CDN)
  - Archive.org (unlimited free hosting)
  - Local filesystem (development)
- **Offline Storage**: IndexedDB (browser-based, 500MB limit)
- **Deployment**: Vercel (auto-deploys from GitHub)

## Architecture

### Data Flow
```
1. Audio Input → Local Upload or Archive.org URL
2. Local Processing → Whisper transcription + AI lessons
3. Storage → GitHub Releases or Archive.org URLs
4. Database → SQLite with metadata and transcripts
5. Deployment → Git push triggers Vercel
6. Playback → Stream from CDN or use offline cache
```

### Storage Layers
1. **IndexedDB** (offline) - Cached audio in browser
2. **GitHub/Archive.org** (online) - CDN streaming
3. **API Proxy** (fallback) - CORS/Safari compatibility

## How to Add New Podcasts

### Method 1: Local Upload + GitHub Deployment

**Step 1: Process Locally**
```bash
npm run dev
# Navigate to http://localhost:3000
# Upload audio files through web interface
# Wait for Whisper transcription and AI processing
```

**Step 2: Deploy to Production**
```bash
# Automated (if script exists)
./scripts/deploy-new-podcasts.sh

# Or Manual:
# Upload audio to GitHub Releases
gh release upload audio-files-2025-09-21 uploads/*.mp3

# Update database with GitHub URLs
for file in uploads/*.mp3; do
  filename=$(basename "$file")
  url="https://github.com/tr3stanley/spanish-tutor-app/releases/download/audio-files-2025-09-21/$filename"
  sqlite3 data/podcasts.db "UPDATE podcasts SET file_path='$url' WHERE filename='$filename';"
done

# Commit and deploy
git add -f data/podcasts.db
git commit -m "Add new podcasts"
git push
```

### Method 2: Archive.org Collection Import (Recommended)

**Step 1: Upload to Archive.org**
1. Sign in to [archive.org](https://archive.org)
2. Click "Upload" → Create new item
3. Add metadata:
   - Title: Your collection name
   - Subject: podcast, language learning, spanish/russian
   - Language: Spanish or Russian
4. Upload all MP3 files
5. Publish the collection
6. Copy the collection URL

**Step 2: Import to App (Works Locally)**
1. Start local server: `npm run dev`
2. Click "Upload Podcast"
3. Choose "URL Upload" tab
4. Paste Archive.org collection URL
5. App auto-detects all audio files
6. Select language and base title
7. Click "Upload Collection (X files)"
8. Wait for Whisper processing

**Step 3: Deploy**
```bash
git add -f data/podcasts.db
git commit -m "Add Archive.org collection"
git push
```

### Method 3: Single URL Upload

For individual episodes from Archive.org or other sources:
1. Get direct MP3 URL
2. Use "URL Upload" tab
3. Enter title and language
4. Process locally first
5. Deploy database changes

## Offline Functionality

### Download for Offline
- Each podcast has a download button
- Downloads to IndexedDB (browser storage)
- Works completely offline once downloaded
- Visual indicators show download status
- Progress bars during download

### Storage Management
- **500MB limit** per device
- **Auto-cleanup**:
  - Unlistened: Removed after 30 days
  - Listened: Removed after 24 hours
- **Smart prioritization**: Keeps most recently accessed
- **Manual management**: Remove individual episodes

### Offline Playback Priority
1. Check IndexedDB first (instant playback)
2. Stream from Archive.org/GitHub if not offline
3. Use proxy for CORS issues (Safari)

## Features

### For Each Podcast
- **AI Transcript**: Time-synced, clickable segments
- **Lesson Plan**:
  - Summary of content
  - Grammar rules with examples
  - Vocabulary with translations
- **Interactive Tutor**:
  - Explain any segment
  - Translate selections
  - Chat about content
- **Audio Controls**:
  - Variable speed (0.5x-2x)
  - Precise seeking
  - Visual waveform
- **Progress Tracking**:
  - Mark as listened
  - Folder organization

### URL Support
- **Archive.org**: Individual files or entire collections
- **Direct MP3 URLs**: Any publicly accessible audio
- **GitHub Releases**: Auto-configured for CDN delivery

## Limitations

### Production (Vercel)
- ❌ Cannot upload new files (no persistent storage)
- ❌ Cannot run Whisper (requires local binary)
- ✅ Can play all existing podcasts
- ✅ Can use AI chat/explain features
- ✅ Can download for offline
- ✅ Database persists (in git)

### Local Development
- ✅ Full upload capabilities
- ✅ Whisper transcription works
- ✅ Can process then deploy
- ⚠️ Must deploy database changes manually

## Database Structure

```sql
podcasts: Core podcast metadata
├── file_path: GitHub Release or Archive.org URL
├── transcript_path: Reference to transcript
├── lesson_generated: Processing status
└── listened: User progress

transcripts: Time-coded segments
├── start_time, end_time: Segment boundaries
├── text: Transcribed content
└── confidence: Whisper confidence score

lessons: AI-generated content
├── summary: Episode overview
├── grammar_rules: Language patterns
└── vocabulary: Key terms and translations

explanations: User-requested explanations
└── Cached AI responses for segments
```

## Best Practices

### For Bulk Uploads
1. Process in batches of 5-10 episodes
2. Use Archive.org collections for large sets
3. Test one episode before bulk processing
4. Keep original files as backup

### For Quality
- Use clear audio (better transcription)
- Consistent naming conventions
- Proper language tagging
- Descriptive titles

### For Performance
- Download frequently used episodes
- Clear old downloads periodically
- Use collection imports for related content

## Troubleshooting

### Upload Issues
- **"File too large"**: Use Archive.org URL method
- **"Processing stuck"**: Check Whisper is installed locally
- **"Database not updating"**: Ensure you commit and push

### Playback Issues
- **"Audio not loading"**: Check URL is public
- **"CORS error"**: App should auto-proxy
- **"Offline not working"**: Check IndexedDB storage quota

### Deployment Issues
- **"Podcasts missing on Vercel"**: Database not committed
- **"Can't upload on production"**: This is expected - process locally first

## Quick Commands

```bash
# Start local development
npm run dev

# Check database
sqlite3 data/podcasts.db "SELECT title, file_path FROM podcasts;"

# Force add database to git
git add -f data/podcasts.db

# Upload to GitHub Release
gh release upload audio-files-2025-09-21 new-uploads/*.mp3

# Create new release
gh release create audio-files-$(date +%Y-%m-%d) --title "Audio Files - $(date +%m/%d/%Y)"
```

## Sharing Access

To share with others:
1. Share the Vercel URL: `https://spanish-tutor-app.vercel.app`
2. They can:
   - View all podcasts you've uploaded
   - Play audio (streamed from GitHub/Archive.org)
   - Download for offline use
   - Use all AI features
3. They cannot:
   - Upload new podcasts
   - Delete existing content

For contributors:
- Share GitHub repo
- They clone and run locally
- Process new content locally
- Submit PR with database updates

## Architecture Benefits

This setup provides:
- **Free hosting**: GitHub/Archive.org for audio
- **Free CDN**: Global content delivery
- **Free deployment**: Vercel hobby plan
- **Free AI**: DeepSeek via OpenRouter
- **No auth needed**: Shared content for all users
- **Offline-first**: Works without internet
- **Cross-device**: Each device has own cache

---

*This document represents the actual working state of the app as deployed. Use these instructions rather than conflicting documentation.*