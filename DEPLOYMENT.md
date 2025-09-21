# Deployment Workflow

This document describes how to add new podcasts to production.

## Quick Start

### Option 1: Automated Script (Recommended)
```bash
# 1. Process podcasts locally (upload via web interface)
# 2. Run automated deployment
./scripts/deploy-new-podcasts.sh
```

### Option 2: Manual Steps
```bash
# 1. Upload audio to GitHub Releases
gh release upload audio-files-2025-09-21 uploads/new-podcast.mp3

# 2. Update database
sqlite3 data/podcasts.db "UPDATE podcasts SET file_path = 'https://github.com/tr3stanley/spanish-tutor-app/releases/download/audio-files-2025-09-21/new-podcast.mp3' WHERE filename = 'new-podcast.mp3';"

# 3. Deploy database
git add -f data/podcasts.db
git commit -m "Add new podcast"
git push
```

## Complete Workflow

### 1. Local Processing
1. Start local development server: `npm run dev`
2. Navigate to `http://localhost:3000`
3. Upload new podcast via web interface
4. Wait for Whisper transcription and AI lesson generation
5. Test all features work locally

### 2. Upload to GitHub Releases
Audio files are hosted on GitHub Releases for global accessibility:

```bash
# Upload to existing release
gh release upload audio-files-2025-09-21 uploads/new-file.mp3

# Or create new weekly release
gh release create audio-files-$(date +%Y-%m-%d) --title "Audio Files - $(date +%m/%d/%Y)" uploads/*.mp3
```

### 3. Update Database URLs
Update the database to point to GitHub Release URLs:

```bash
# For each new file
NEW_URL="https://github.com/tr3stanley/spanish-tutor-app/releases/download/RELEASE_TAG/FILENAME.mp3"
sqlite3 data/podcasts.db "UPDATE podcasts SET file_path = '$NEW_URL' WHERE filename = 'FILENAME.mp3';"
```

### 4. Deploy Database Changes
```bash
git add -f data/podcasts.db  # Force add despite .gitignore
git commit -m "Add new podcast: [Title]"
git push  # Triggers Vercel auto-deployment
```

## Architecture Notes

### Why This Workflow?
- **Local Whisper**: Fast, free transcription without API costs
- **GitHub Releases**: Free, reliable audio hosting with global CDN
- **SQLite + Vercel**: Simple database that deploys with the app
- **Manual Process**: Ensures quality control for weekly uploads

### File Locations
- **Audio Files**: GitHub Releases (public URLs)
- **Database**: `data/podcasts.db` (bundled with deployment)
- **Transcripts**: SQLite database `transcripts` table
- **Lessons**: SQLite database `lessons` table

### Limitations
- **New uploads disabled** in production (Whisper runs locally only)
- **Database resets** on redeploy (explanations/chat history lost)
- **7 podcasts/week max** recommended for GitHub Releases

## Troubleshooting

### Database Not Found on Vercel
```bash
# Ensure database is committed (may need to force add)
git add -f data/podcasts.db
git commit -m "Update database"
git push
```

### Audio Files Not Loading
- Check GitHub Release URLs are public
- Verify file names match database `filename` column
- Test URLs manually in browser

### Local Development Issues
```bash
# Reset to local database
cp podcasts.db data/podcasts.db

# Update URLs for local development
sqlite3 data/podcasts.db "UPDATE podcasts SET file_path = '/api/audio/' || filename WHERE file_path LIKE 'https://github.com%';"
```