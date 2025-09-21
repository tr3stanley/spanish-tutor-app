import { google } from 'googleapis';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { createReadStream } from 'fs';

const execAsync = promisify(exec);

// Create OAuth2 client
const oauth2Client = new google.auth.OAuth2(
  process.env.YOUTUBE_CLIENT_ID,
  process.env.YOUTUBE_CLIENT_SECRET,
  process.env.YOUTUBE_REDIRECT_URI
);

const youtube = google.youtube({
  version: 'v3',
  auth: oauth2Client
});

export interface CaptionData {
  text: string;
  start: number;
  duration: number;
}

// OAuth2 helper functions
export function getAuthUrl(): string {
  const scopes = [
    'https://www.googleapis.com/auth/youtube.upload',
    'https://www.googleapis.com/auth/youtube',
    'https://www.googleapis.com/auth/youtube.force-ssl'
  ];

  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
  });
}

export async function setCredentials(code: string) {
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);
  return tokens;
}

export function setAccessToken(accessToken: string) {
  oauth2Client.setCredentials({ access_token: accessToken });
}

export async function uploadPodcastForCaptions(
  audioFilePath: string,
  title: string,
  language: 'spanish' | 'russian'
): Promise<string> {
  try {
    // Upload video to YouTube as unlisted
    const response = await youtube.videos.insert({
      part: ['snippet', 'status'],
      requestBody: {
        snippet: {
          title: `temp-podcast-${Date.now()}`,
          description: `Temporary upload for caption extraction - ${language}`,
          tags: [language, 'podcast', 'temporary'],
          defaultLanguage: language === 'spanish' ? 'es' : 'ru'
        },
        status: {
          privacyStatus: 'unlisted',
          selfDeclaredMadeForKids: false
        }
      },
      media: {
        body: createReadStream(audioFilePath)
      }
    });

    const videoId = response.data.id;
    if (!videoId) {
      throw new Error('Failed to upload video to YouTube');
    }

    console.log(`Uploaded to YouTube: ${videoId}`);
    return videoId;
  } catch (error) {
    console.error('YouTube upload error:', error);
    throw error;
  }
}

export async function waitForCaptions(videoId: string, maxWaitMinutes: number = 20): Promise<boolean> {
  const maxAttempts = maxWaitMinutes * 2; // Check every 30 seconds
  let attempts = 0;

  while (attempts < maxAttempts) {
    try {
      // Try downloading captions directly instead of checking API
      const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
      const testCommand = `yt-dlp --list-subs "${videoUrl}" 2>/dev/null | grep -E "(es|ru)" || echo "no captions"`;

      const { stdout } = await execAsync(testCommand);

      if (stdout && !stdout.includes('no captions') && stdout.trim().length > 0) {
        console.log('Captions are ready!');
        return true;
      }

      console.log(`Waiting for captions... (${attempts + 1}/${maxAttempts})`);
      await new Promise(resolve => setTimeout(resolve, 30000)); // Wait 30 seconds
      attempts++;
    } catch (error) {
      console.error('Error checking captions:', error);
      // Try direct download approach on errors
      try {
        const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
        const transcriptDir = path.join(process.cwd(), 'transcripts');
        await fs.mkdir(transcriptDir, { recursive: true });

        const outputPath = path.join(transcriptDir, `test-${videoId}`);
        const command = `yt-dlp --write-auto-sub --sub-format vtt --skip-download -o "${outputPath}" "${videoUrl}" 2>/dev/null`;

        await execAsync(command);
        console.log('Captions downloaded successfully!');
        return true;
      } catch (downloadError) {
        console.log('Captions not ready yet, retrying...');
      }

      attempts++;
      await new Promise(resolve => setTimeout(resolve, 30000));
    }
  }

  return false;
}

export async function downloadCaptions(videoId: string): Promise<CaptionData[]> {
  try {
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const transcriptDir = path.join(process.cwd(), 'transcripts');

    // Ensure transcript directory exists
    await fs.mkdir(transcriptDir, { recursive: true });

    // Download captions using yt-dlp
    const outputPath = path.join(transcriptDir, `${videoId}.vtt`);
    const command = `yt-dlp --write-auto-sub --sub-format vtt --skip-download -o "${outputPath}" "${videoUrl}"`;

    await execAsync(command);

    // Read and parse VTT file
    const vttContent = await fs.readFile(`${outputPath}.vtt`, 'utf-8');
    const captions = parseVTT(vttContent);

    return captions;
  } catch (error) {
    console.error('Error downloading captions:', error);
    throw error;
  }
}

export async function deleteYouTubeVideo(videoId: string): Promise<void> {
  try {
    await youtube.videos.delete({
      id: videoId
    });
    console.log(`Deleted YouTube video: ${videoId}`);
  } catch (error) {
    console.error('Error deleting YouTube video:', error);
    // Don't throw - we don't want to fail the whole process if cleanup fails
  }
}

function parseVTT(vttContent: string): CaptionData[] {
  const captions: CaptionData[] = [];
  const lines = vttContent.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Look for timestamp lines (format: 00:00:00.000 --> 00:00:03.000)
    if (line.includes('-->')) {
      const [startTime, endTime] = line.split(' --> ');
      const start = parseVTTTime(startTime);
      const duration = parseVTTTime(endTime) - start;

      // Get the text from the next line(s)
      let text = '';
      let j = i + 1;
      while (j < lines.length && lines[j].trim() && !lines[j].includes('-->')) {
        text += lines[j].trim() + ' ';
        j++;
      }

      if (text.trim()) {
        captions.push({
          text: text.trim(),
          start,
          duration
        });
      }

      i = j - 1; // Skip processed lines
    }
  }

  return captions;
}

function parseVTTTime(timeString: string): number {
  const [hours, minutes, seconds] = timeString.split(':');
  return parseInt(hours) * 3600 + parseInt(minutes) * 60 + parseFloat(seconds);
}

export async function processYouTubeCaptions(
  audioFilePath: string,
  title: string,
  language: 'spanish' | 'russian'
): Promise<CaptionData[]> {
  console.log('Starting YouTube caption process...');

  // Upload to YouTube
  const videoId = await uploadPodcastForCaptions(audioFilePath, title, language);

  try {
    // Wait for captions to be generated
    const captionsReady = await waitForCaptions(videoId);

    if (!captionsReady) {
      throw new Error('Captions were not generated within the time limit');
    }

    // Download captions
    const captions = await downloadCaptions(videoId);

    return captions;
  } finally {
    // Always try to clean up the video
    await deleteYouTubeVideo(videoId);
  }
}