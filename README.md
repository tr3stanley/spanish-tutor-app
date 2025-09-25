# Spanish & Russian Podcast Tutor

An AI-powered language learning app that transforms podcasts into interactive lessons with automated transcription, grammar analysis, and vocabulary extraction.

## Features

- 🎧 **Flexible Audio Input** - Upload MP3/WAV files directly or from URLs (Internet Archive)
- 🤖 **Private AI Transcription** - Uses local Whisper AI (completely offline)
- 📚 **Smart Lesson Generation** - AI creates vocabulary lists, grammar explanations, and summaries
- ⏯️ **Interactive Audio Player** - Synced transcript with clickable segments
- 💬 **Interactive Learning** - Click transcript words for translations, chat with AI tutor
- 📁 **Folder Organization** - Organize podcasts in custom folders
- ✅ **Progress Tracking** - Mark podcasts as listened/unlistened
- 🔒 **Privacy First** - All transcription happens locally on your machine

## Tech Stack

- **Frontend**: Next.js 15, React 19, TypeScript, Tailwind CSS
- **Backend**: Node.js, SQLite database
- **AI**: Local Whisper (transcription), OpenRouter (lessons)
- **Audio**: WaveSurfer.js, YouTube integration

## Quick Start

For detailed setup instructions, see **[SETUP_GUIDE.md](./SETUP_GUIDE.md)**

### Prerequisites
- Node.js 18+
- Homebrew (Mac)
- OpenRouter API key (free signup)

### Basic Setup
```bash
# Clone and install
git clone https://github.com/tr3stanley/spanish-tutor-app.git
cd spanish-tutor-app
npm install

# Install Whisper for transcription
brew install whisper-cpp

# Download AI model
mkdir models
curl -o models/ggml-base.bin https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin

# Configure environment
cp .env.local.example .env.local
# Edit .env.local with your OpenRouter API key

# Start the app
npm run dev
```

Visit http://localhost:3000 to start learning!

## How It Works

1. **Upload** - Upload files directly or provide URLs from Internet Archive
2. **Transcribe** - Local Whisper AI converts speech to text (completely private)
3. **Learn** - AI generates vocabulary, grammar notes, and summaries
4. **Study** - Interactive transcript with translations and AI tutoring
5. **Organize** - Create folders and track listening progress
6. **Download** - Save episodes offline for study anywhere

## Adding Content

The app supports two upload methods:
- **File Upload**: Drag & drop MP3/WAV files directly from your computer
- **URL Upload**: Provide direct links to audio files (recommended for Internet Archive)

📖 **For complete upload instructions and best practices, see [instructions.md](./instructions.md)**

## Privacy & Security

- **Local transcription** - Audio never leaves your computer
- **Minimal data sharing** - Only text sent to AI for lesson generation
- **No tracking** - No analytics or user behavior collection
- **Open source** - Review the code yourself

## Supported Languages

- 🇪🇸 **Spanish** - Full support with grammar explanations
- 🇷🇺 **Russian** - Full support with Cyrillic handling
- Easily extensible to other languages

## File Structure

```
src/
├── app/
│   ├── api/           # API routes
│   ├── podcast/[id]/  # Podcast detail page
│   └── page.tsx       # Home page
├── components/        # React components
│   ├── AudioPlayer.tsx
│   ├── LessonPlan.tsx
│   ├── PodcastUpload.tsx
│   └── TranscriptView.tsx
└── lib/              # Core logic
    ├── database.ts   # SQLite database
    ├── youtube.ts    # YouTube API integration
    └── ai.ts         # OpenRouter AI integration
```

## Development

### Database Schema
- `podcasts`: Metadata and processing status
- `transcripts`: Timestamped transcript segments
- `lessons`: AI-generated lesson plans
- `explanations`: AI explanations for segments

### Adding New Languages
1. Update language options in `PodcastUpload.tsx`
2. Add language support in AI prompts (`ai.ts`)
3. Ensure YouTube supports auto-captions for the language

## Audio Hosting Setup

### For Safari Compatibility

Safari browsers have strict CORS policies that block GitHub Release audio files. For Safari support, upload your audio files to Archive.org:

1. **Process podcasts locally**:
   ```bash
   npm run dev
   # Upload MP3 files through the web interface
   # Files are saved to uploads/ folder after processing
   ```

2. **Upload to Archive.org**:
   - Go to https://archive.org/create
   - Create a free account
   - Upload all MP3 files from `uploads/` folder
   - Set item type to "Community Audio" or "Podcasts"
   - Make the item public

3. **Update database with Archive.org URLs**:
   ```bash
   # Update each podcast's file_path in the database
   # Format: https://archive.org/download/[item-id]/[filename].mp3
   sqlite3 data/podcasts.db "UPDATE podcasts SET file_path = 'https://archive.org/download/your-item-id/filename.mp3' WHERE id = X;"
   ```

4. **Deploy changes**:
   ```bash
   git add data/podcasts.db
   git commit -m "Update podcast URLs to Archive.org"
   git push
   ```

### Why Archive.org?

- ✅ **Free forever** - No storage limits or costs
- ✅ **Safari compatible** - Proper CORS headers
- ✅ **Educational mission** - Perfect for language learning content
- ✅ **Permanent hosting** - Files never expire
- ✅ **Global CDN** - Fast loading worldwide

## Troubleshooting

### "Audio won't load in Safari"
- Ensure audio URLs point to Archive.org (not GitHub releases)
- Check that Archive.org item is set to public
- Verify the direct MP3 URL works in a browser

### "YouTube upload failed"
- Check YouTube API key is valid
- Ensure API quotas aren't exceeded
- Verify file format is supported

### "No captions generated"
- Wait longer (can take 15-20 minutes)
- Check if language is supported by YouTube
- Try a clearer audio file

### "AI explanation failed"
- Check OpenRouter API key
- Verify model availability
- Try a different free model

## License

MIT License - feel free to use for personal or commercial projects.
