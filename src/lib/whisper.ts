import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import https from 'https';
import http from 'http';

const execAsync = promisify(exec);

async function downloadFile(url: string, outputPath: string, retries = 3): Promise<void> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await downloadFileAttempt(url, outputPath);
      return; // Success
    } catch (error: any) {
      console.log(`Download attempt ${attempt}/${retries} failed: ${error.message}`);
      if (attempt === retries) {
        throw error; // Final attempt failed
      }
      // Wait before retrying (exponential backoff)
      const waitTime = attempt * 2000; // 2s, 4s, 6s
      console.log(`Waiting ${waitTime / 1000}s before retry...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
}

async function downloadFileAttempt(url: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https:') ? https : http;

    const request = client.get(url, (response) => {
      // Handle redirects
      if (response.statusCode === 301 || response.statusCode === 302) {
        if (response.headers.location) {
          downloadFileAttempt(response.headers.location, outputPath)
            .then(resolve)
            .catch(reject);
          return;
        }
      }

      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: ${response.statusCode} ${response.statusMessage}`));
        return;
      }

      const writeStream = require('fs').createWriteStream(outputPath);
      response.pipe(writeStream);

      writeStream.on('finish', () => {
        writeStream.close();
        resolve();
      });

      writeStream.on('error', reject);
    });

    request.on('error', reject);
    request.setTimeout(240000, () => {  // 4 minutes timeout
      request.destroy();
      reject(new Error('Download timeout'));
    });
  });
}

function isUrl(path: string): boolean {
  return path.startsWith('http://') || path.startsWith('https://');
}

export interface TranscriptSegment {
  text: string;
  start: number;
  end: number;
  confidence?: number;
}

export async function transcribeAudio(
  audioFilePath: string,
  language: 'spanish' | 'russian'
): Promise<TranscriptSegment[]> {
  try {
    console.log(`Starting Whisper transcription for ${language}...`);

    // Map language codes
    const langCode = language === 'spanish' ? 'es' : 'ru';

    // Create output directory
    const outputDir = path.join(process.cwd(), 'transcripts');
    await fs.mkdir(outputDir, { recursive: true });

    // Check if file needs conversion (m4a to wav)
    let processedAudioPath = audioFilePath;
    const fileExt = path.extname(audioFilePath).toLowerCase();

    if (fileExt === '.m4a') {
      console.log('Converting m4a to wav for Whisper...');
      const wavPath = audioFilePath.replace(/\.m4a$/i, '.wav');

      // Use ffmpeg to convert m4a to wav
      const convertCommand = `ffmpeg -i "${audioFilePath}" -ar 16000 -ac 1 -c:a pcm_s16le "${wavPath}" -y`;

      try {
        await execAsync(convertCommand);
        processedAudioPath = wavPath;
        console.log('Audio conversion complete');
      } catch (error) {
        console.error('FFmpeg conversion failed:', error);
        throw new Error('Failed to convert audio format');
      }
    }

    // Generate output filename
    const audioFilename = path.basename(audioFilePath, path.extname(audioFilePath));
    const outputBase = path.join(outputDir, `${audioFilename}-${Date.now()}`);

    // Whisper command - using the base model we downloaded
    const modelPath = path.join(process.cwd(), 'models', 'ggml-base.bin');
    const command = [
      'whisper-cli',
      `-m "${modelPath}"`,
      `-l ${langCode}`,
      '--output-srt',
      '--output-json',
      `--output-file "${outputBase}"`,
      '--no-prints',
      `"${processedAudioPath}"`
    ].join(' ');

    console.log('Running Whisper transcription...');
    console.log('Command:', command);
    const startTime = Date.now();

    // Execute Whisper
    const result = await execAsync(command);
    console.log('Whisper stdout:', result.stdout);
    if (result.stderr) console.log('Whisper stderr:', result.stderr);

    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(1);
    console.log(`Whisper transcription completed in ${duration} seconds`);

    // Read the JSON output
    const jsonFile = `${outputBase}.json`;
    const jsonContent = await fs.readFile(jsonFile, 'utf-8');
    const whisperOutput = JSON.parse(jsonContent);

    // Convert to our format
    const segments: TranscriptSegment[] = [];

    if (whisperOutput.transcription && Array.isArray(whisperOutput.transcription)) {
      for (const segment of whisperOutput.transcription) {
        if (segment.offsets && segment.text && segment.text.trim()) {
          const start = segment.offsets.from / 1000; // Convert ms to seconds
          const end = segment.offsets.to / 1000;

          // Ensure start and end are valid numbers
          if (typeof start === 'number' && typeof end === 'number' &&
              !isNaN(start) && !isNaN(end) && start >= 0 && end > start) {
            segments.push({
              text: segment.text.trim(),
              start,
              end,
              confidence: segment.confidence || 0.8 // Higher default since Whisper is generally accurate
            });
          }
        }
      }
    }

    // Clean up temporary files
    try {
      await fs.unlink(jsonFile);
      await fs.unlink(`${outputBase}.srt`);

      // Clean up converted wav file if we created one
      if (fileExt === '.m4a' && processedAudioPath !== audioFilePath) {
        await fs.unlink(processedAudioPath);
        console.log('Cleaned up converted wav file');
      }
    } catch (cleanupError) {
      console.log('Note: Could not clean up some temporary files');
    }

    console.log(`Transcription complete: ${segments.length} segments extracted`);
    return segments;

  } catch (error) {
    console.error('Whisper transcription error:', error);
    throw new Error(`Failed to transcribe audio: ${error}`);
  }
}

export async function processAudioWithWhisper(
  audioPathOrUrl: string,
  language: 'spanish' | 'russian'
): Promise<TranscriptSegment[]> {
  console.log('Starting local Whisper processing...');

  let actualAudioPath = audioPathOrUrl;
  let tempFilePath: string | null = null;

  try {
    // If it's a URL, download it first
    if (isUrl(audioPathOrUrl)) {
      console.log(`Downloading audio from URL: ${audioPathOrUrl}`);

      // Create temporary downloads directory
      const downloadsDir = path.join(process.cwd(), 'temp-downloads');
      await fs.mkdir(downloadsDir, { recursive: true });

      // Generate temporary file path
      const urlPath = new URL(audioPathOrUrl).pathname;
      const extension = path.extname(urlPath) || '.mp3';
      const filename = `temp-${Date.now()}${extension}`;
      tempFilePath = path.join(downloadsDir, filename);

      // Download the file
      await downloadFile(audioPathOrUrl, tempFilePath);
      actualAudioPath = tempFilePath;

      console.log(`Audio downloaded to: ${tempFilePath}`);
    }

    // Process with Whisper
    const segments = await transcribeAudio(actualAudioPath, language);

    if (segments.length === 0) {
      throw new Error('No transcript segments were generated');
    }

    return segments;

  } finally {
    // Clean up temporary file if we downloaded one
    if (tempFilePath) {
      try {
        await fs.unlink(tempFilePath);
        console.log(`Cleaned up temporary file: ${tempFilePath}`);
      } catch (error) {
        console.warn(`Failed to clean up temporary file: ${tempFilePath}`, error);
      }
    }
  }
}