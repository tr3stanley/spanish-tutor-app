# Spanish & Russian Podcast Tutor

An AI-powered language learning app that transforms podcasts into interactive lessons with automated transcription, grammar analysis, and vocabulary extraction.

## Features

- 🎧 **Local Audio Processing** - Upload MP3/WAV files or download from YouTube
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

1. **Upload** - Drop an audio file or paste a YouTube URL
2. **Transcribe** - Local Whisper AI converts speech to text (private)
3. **Learn** - AI generates vocabulary, grammar notes, and summaries
4. **Study** - Interactive transcript with translations and AI tutoring
5. **Organize** - Create folders and track listening progress

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

## Troubleshooting

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
