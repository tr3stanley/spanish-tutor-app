import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { transcribeAudio } from '@/lib/whisper';
import { getAuth, unauthorized } from '@/lib/auth';

const execAsync = promisify(exec);

export const runtime = 'nodejs';
export const maxDuration = 60;

// Speech-to-text for the mic button. Groq Whisper when GROQ_API_KEY is set
// (works on Vercel, $0.04/hr); local whisper-cli otherwise (dev machine only).
export async function POST(request: NextRequest) {
  try {
    if (!(await getAuth(request))) return unauthorized();

    const form = await request.formData();
    const file = form.get('audio');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No audio file provided' }, { status: 400 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    if (buf.length < 1000) {
      return NextResponse.json({ error: 'Recording too short' }, { status: 400 });
    }
    if (buf.length > 25 * 1024 * 1024) {
      return NextResponse.json({ error: 'Recording too large (25MB max)' }, { status: 400 });
    }

    const groqKey = process.env.GROQ_API_KEY;
    if (groqKey) {
      const fd = new FormData();
      fd.append('file', new Blob([new Uint8Array(buf)], { type: file.type || 'audio/webm' }), file.name || 'recording.webm');
      fd.append('model', 'whisper-large-v3-turbo');
      fd.append('language', 'es');
      fd.append('temperature', '0');

      const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${groqKey}` },
        body: fd,
      });
      if (!res.ok) {
        const detail = await res.text();
        throw new Error(`Groq transcription failed (${res.status}): ${detail.slice(0, 300)}`);
      }
      const data = await res.json();
      return NextResponse.json({ text: (data.text || '').trim(), engine: 'groq' });
    }

    if (process.env.VERCEL) {
      return NextResponse.json(
        { error: 'Voice input needs a GROQ_API_KEY set in the Vercel environment' },
        { status: 503 }
      );
    }

    // Local fallback: convert whatever the browser recorded to 16kHz wav, then whisper-cli.
    const tempDir = path.join(process.cwd(), 'temp-downloads');
    await fs.mkdir(tempDir, { recursive: true });
    const base = path.join(tempDir, `mic-${Date.now()}`);
    const ext = (file.name && path.extname(file.name)) || '.webm';
    const inputPath = `${base}${ext}`;
    const wavPath = `${base}.wav`;

    try {
      await fs.writeFile(inputPath, buf);
      await execAsync(`ffmpeg -i "${inputPath}" -ar 16000 -ac 1 -c:a pcm_s16le "${wavPath}" -y`);
      const segments = await transcribeAudio(wavPath, 'spanish');
      const text = segments.map(s => s.text).join(' ').trim();
      return NextResponse.json({ text, engine: 'local-whisper' });
    } finally {
      await Promise.allSettled([fs.unlink(inputPath), fs.unlink(wavPath)]);
    }
  } catch (error) {
    console.error('Transcribe error:', error);
    return NextResponse.json({ error: 'Transcription failed' }, { status: 500 });
  }
}
