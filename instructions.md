# Content Upload Instructions

This guide explains how to add new podcast content to your Spanish/Russian Tutor app.

## Overview

The app supports two methods for adding content:
1. **File Upload**: Upload audio files directly from your computer
2. **URL Upload**: Reference audio files hosted online (like Internet Archive)

## Method 1: File Upload

### Steps:
1. **Prepare your files**: Place audio files in a local folder (e.g., `new-uploads/`)
2. **Open the app**: Navigate to your app homepage
3. **Click "Upload Podcast"**: Opens the upload modal
4. **Select "File Upload" tab**
5. **Choose your file**: Browse and select audio file from your computer
6. **Set metadata**:
   - Enter a descriptive title
   - Select language (Spanish or Russian)
7. **Upload**: Click "Upload" button
8. **Wait for processing**: App will automatically:
   - Transcribe audio with Whisper
   - Generate lesson plans with AI
   - Make content available in your library

### Supported Formats:
- MP3, WAV, M4A, OGG
- Maximum file size: depends on server configuration

## Method 2: URL Upload (Recommended)

### Why use URLs?
- No file size limits
- Faster uploads (no file transfer)
- Content stays online permanently
- Better for large collections
- **Auto-detects collections**: Paste an Archive.org collection URL to upload all audio files at once

### Prerequisites:
1. **Internet Archive account**: Sign up at [archive.org](https://archive.org)
2. **Audio files uploaded**: Your content must be hosted online first

### Steps:

#### Part A: Upload to Internet Archive
1. **Login to Archive.org**: Go to [archive.org](https://archive.org) and sign in
2. **Create new item**: Click "Upload" in the top navigation
3. **Add metadata**:
   - Title: Descriptive name for your collection
   - Description: What this content is about
   - Subject tags: "podcast", "language learning", "spanish" or "russian"
   - Language: Select appropriate language
4. **Upload files**: Drag/drop or select your audio files from `new-uploads/`
5. **Publish**: Complete the upload process
6. **Get URLs**: Once processed, get direct links to each audio file
   - Format: `https://archive.org/download/[item-name]/[filename.mp3]`

#### Part B: Add to Your App

**For Single Files:**
1. **Open upload modal**: Click "Upload Podcast" in your app
2. **Select "URL Upload" tab**
3. **Enter details**:
   - **Title**: Episode/podcast title
   - **Audio URL**: Direct link from Internet Archive
   - **Language**: Spanish or Russian
4. **Submit**: Click "Add from URL"

**For Collections (Multiple Files):**
1. **Open upload modal**: Click "Upload Podcast" in your app
2. **Select "URL Upload" tab**
3. **Paste collection URL**: Use the main Archive.org item URL (e.g., `https://archive.org/details/your-collection`)
4. **Wait for detection**: App will automatically detect all audio files in the collection
5. **Enter details**:
   - **Title**: Base title for the collection (individual episodes will be named automatically)
   - **Language**: Spanish or Russian
6. **Submit**: Click "Upload Collection (X files)"

**Processing**: App will:
- Download/stream audio from URLs for transcription
- Generate lesson materials for each episode
- Store references to online files
- Organize episodes with consistent naming

## File Organization Tips

### Local Files (`new-uploads/` folder):
```
new-uploads/
├── spanish/
│   ├── episode-001-introduction.mp3
│   ├── episode-002-family.mp3
│   └── episode-003-food.mp3
└── russian/
    ├── lesson-01-alphabet.mp3
    ├── lesson-02-numbers.mp3
    └── lesson-03-greetings.mp3
```

### Naming Conventions:
- Use descriptive names
- Include episode/lesson numbers
- Avoid spaces (use hyphens or underscores)
- Keep names under 100 characters

## Troubleshooting

### Upload Issues:
- **File too large**: Use URL method instead
- **Unsupported format**: Convert to MP3/WAV
- **Upload fails**: Check internet connection, try again

### URL Issues:
- **Invalid URL**: Ensure direct link to audio file
- **Access denied**: Make sure file is publicly accessible
- **Processing stuck**: Check if URL is reachable

### Processing Problems:
- **Transcription fails**: Check audio quality, ensure clear speech
- **Wrong language detected**: Verify language selection matches audio
- **Slow processing**: Large files take time, be patient

## Best Practices

1. **Test with small files first**: Ensure everything works before bulk uploads
2. **Use descriptive titles**: Makes content easier to find later
3. **Consistent language tagging**: Accurate for AI processing
4. **Quality audio**: Clear speech improves transcription accuracy
5. **Batch processing**: Upload related content together
6. **Backup important files**: Keep original files safe

## Technical Notes

- **Safari compatibility**: App includes proxy for cross-origin issues
- **Offline support**: Content can be downloaded for offline use
- **Mobile friendly**: Works on tablets and phones
- **Progress tracking**: Real-time upload/processing status
- **Auto-cleanup**: Old offline files automatically removed

## Getting Help

If you encounter issues:
1. Check browser console for errors
2. Verify file formats and URLs
3. Test with known-working content first
4. Check Internet Archive accessibility

---

*This app automatically handles transcription, lesson generation, and content organization. Focus on uploading quality audio content - the AI handles the rest!*