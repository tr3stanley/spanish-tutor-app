# Spanish & Russian Podcast Tutor

An AI-powered language learning app that transforms podcasts into interactive lessons with automated transcription, grammar analysis, and vocabulary extraction.

## Features

- 🎧 **Podcast Upload**: Drag & drop audio files (MP3, WAV, M4A)
- 🔤 **Auto Transcription**: Uses YouTube's free caption service for Spanish/Russian
- 🤖 **AI Lesson Generation**: Creates summaries, grammar rules, and vocabulary lists
- ⏯️ **Interactive Audio Player**: Synced transcript with clickable segments
- 💡 **Real-time AI Explanations**: Click "Explain" for instant segment analysis
- 💰 **Ultra-low Cost**: ~$0-2/month using free AI models

## Tech Stack

- **Frontend**: Next.js 14, React, TypeScript, Tailwind CSS
- **Database**: SQLite (local, no server costs)
- **Transcription**: YouTube Auto-Captions (free)
- **AI**: OpenRouter free models (DeepSeek V3, DeepSeek R1)
- **Audio**: Web Audio API, custom player

## Setup Instructions

### 1. Clone and Install

```bash
git clone <your-repo>
cd spanish-tutor-app
npm install
```

### 2. Environment Variables

```bash
cp .env.example .env.local
```

Edit `.env.local` with your API keys:

```env
YOUTUBE_API_KEY=your_youtube_api_key_here
OPENROUTER_API_KEY=your_openrouter_api_key_here
```

### 3. Get API Keys

#### YouTube API Key (Free)
1. Go to [Google Cloud Console](https://console.developers.google.com/)
2. Create a new project or select existing
3. Enable "YouTube Data API v3"
4. Create credentials → API key
5. Copy to `YOUTUBE_API_KEY`

#### OpenRouter API Key (Free)
1. Sign up at [OpenRouter](https://openrouter.ai/)
2. Generate an API key
3. Copy to `OPENROUTER_API_KEY`
4. **Note**: Many models are free to use!

### 4. Install yt-dlp (Required for captions)

```bash
# macOS
brew install yt-dlp

# Ubuntu/Debian
sudo apt install yt-dlp

# Windows
# Download from https://github.com/yt-dlp/yt-dlp/releases
```

### 5. Run the App

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## How It Works

### Upload Process
1. **Upload**: Drop a Spanish/Russian podcast
2. **YouTube Upload**: Temporarily uploads to YouTube (unlisted)
3. **Caption Generation**: YouTube auto-generates captions (~15 minutes)
4. **Download & Cleanup**: Downloads captions, deletes YouTube video
5. **AI Processing**: Generates lesson plan with OpenRouter AI

### Study Experience
1. **Lesson Plan**: AI-generated summary, grammar, vocabulary
2. **Interactive Transcript**: Click segments to jump to audio
3. **Real-time Help**: "Explain" button for difficult segments
4. **Synced Playback**: Transcript highlights current segment

## Cost Breakdown

- **Database**: $0 (SQLite local)
- **Transcription**: $0 (YouTube Auto-Captions)
- **AI**: $0 (OpenRouter free models)
- **Storage**: $0 (local files)
- **Total**: ~$0-2/month

## Supported Languages

- **Spanish** 🇪🇸
- **Russian** 🇷🇺

YouTube auto-captions work well for both languages.

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
