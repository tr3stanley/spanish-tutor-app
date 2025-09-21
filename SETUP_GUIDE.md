# Spanish/Russian Podcast Tutor - Local Setup Guide for Mac

This guide will help you set up the podcast learning app locally on your Mac to download, transcribe, and study Spanish/Russian podcasts with AI-generated lessons.

## What This App Does

- **Upload audio files** (MP3, WAV, etc.) or download from YouTube
- **Automatically transcribe** using local Whisper AI (completely private)
- **Generate AI lessons** with vocabulary, grammar explanations, and summaries
- **Interactive learning** with clickable transcripts, translations, and AI tutoring
- **Organize podcasts** in custom folders with listened/unlistened tracking

## Prerequisites

### 1. Install Homebrew (if not already installed)
```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

### 2. Install Required Tools
```bash
# Install Node.js (for running the app)
brew install node

# Install Git (for downloading the code)
brew install git

# Install Whisper CLI (for speech-to-text transcription)
brew install whisper-cpp
```

### 3. Verify Installations
```bash
node --version    # Should show v18+ or higher
npm --version     # Should show 8+ or higher
git --version     # Should show git version
whisper-cli --help # Should show whisper help
```

## Setup Steps

### 1. Clone the Repository
```bash
# Navigate to where you want the project
cd ~/Projects  # or wherever you keep projects
mkdir -p ~/Projects  # create the directory if it doesn't exist

# Clone the project
git clone https://github.com/tr3stanley/spanish-tutor-app.git
cd spanish-tutor-app
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Download Whisper Model
```bash
# Create models directory
mkdir -p models

# Download the base model (good balance of speed/accuracy)
curl -o models/ggml-base.bin https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin

# Optional: Download larger model for better accuracy (slower)
# curl -o models/ggml-medium.bin https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin
```

### 4. Set Up Environment Variables

Copy the example environment file:
```bash
cp .env.local.example .env.local
```

Edit `.env.local` with your preferred text editor:
```bash
# Using nano (simple editor)
nano .env.local

# Or using VS Code if you have it
code .env.local
```

### 5. Configure API Keys

You'll need to set up these services:

#### OpenRouter (Required for AI lessons)
1. Go to [https://openrouter.ai/](https://openrouter.ai/)
2. Sign up for a free account
3. Generate an API key
4. Replace `OPENROUTER_API_KEY=your_key_here` in `.env.local`

#### YouTube OAuth (Optional - only needed for YouTube downloads)
1. Go to [Google Cloud Console](https://console.developers.google.com/)
2. Create a new project
3. Enable "YouTube Data API v3"
4. Create OAuth 2.0 credentials
5. Add redirect URI: `http://localhost:3000/api/auth/callback`
6. Copy Client ID and Secret to `.env.local`

### 6. Create Required Directories
```bash
mkdir -p uploads transcripts data
```

### 7. Start the Development Server
```bash
npm run dev
```

The app will be available at: **http://localhost:3000**

## How to Use the App

### 1. Upload a Podcast
- Click "Upload Podcast" button
- Select an audio file (MP3, WAV, etc.) or paste a YouTube URL
- Choose language (Spanish or Russian)
- Create/select a folder to organize it
- Click "Upload"

### 2. Wait for Processing
- The app will automatically transcribe using local Whisper
- Then generate AI lessons with vocabulary and grammar
- This takes 2-5 minutes depending on file length

### 3. Study the Podcast
- Click on any podcast to open the study interface
- Read the AI-generated summary and vocabulary
- Click on transcript words for instant translations
- Use the AI tutor chat for questions
- Mark as "listened" when finished

### 4. Organize Your Library
- Create folders for different topics/series
- Move podcasts between folders
- Track your listening progress

## Troubleshooting

### Common Issues:

**"whisper-cli: command not found"**
```bash
# Install whisper-cpp via Homebrew
brew install whisper-cpp
```

**"Node version too old"**
```bash
# Update Node.js
brew upgrade node
```

**"npm install fails"**
```bash
# Clear npm cache and try again
npm cache clean --force
rm -rf node_modules package-lock.json
npm install
```

**"Transcription fails"**
- Make sure the Whisper model downloaded correctly
- Check that the audio file isn't corrupted
- Try with a shorter audio file first

**"AI lessons don't generate"**
- Verify your OpenRouter API key is correct
- Check you have credits/quota remaining
- Look at the browser console for error messages

### Performance Tips:

- **For faster transcription**: Use `ggml-base.bin` model
- **For better accuracy**: Download `ggml-medium.bin` and update the code
- **Large files**: Consider splitting very long podcasts (>1 hour)
- **Storage**: Transcripts and audio files are stored locally in the project folder

## File Structure

```
spanish-tutor-app/
├── uploads/          # Your uploaded audio files
├── transcripts/      # Generated transcripts (SRT, JSON)
├── models/          # Whisper AI models
├── data/            # SQLite database
├── src/             # Application code
└── .env.local       # Your configuration
```

## Privacy & Offline Features

- **Completely private**: Whisper transcription runs locally on your Mac
- **Offline capable**: Only AI lesson generation requires internet
- **Your data stays local**: Audio files and transcripts never leave your computer
- **No tracking**: No analytics or data collection

## Support

If you run into issues:

1. Check the terminal output for error messages
2. Verify all prerequisites are installed
3. Make sure your API keys are configured correctly
4. Try restarting the development server (`Ctrl+C` then `npm run dev`)

## Updates

To get the latest features:
```bash
git pull origin main
npm install  # Install any new dependencies
```

---

**Happy learning!** 🎧📚

This app gives you a powerful, private way to learn Spanish and Russian through real podcast content with AI assistance.