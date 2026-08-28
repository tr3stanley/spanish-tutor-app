import fs from 'fs/promises';
import path from 'path';
import { TranscriptSegment } from '@/lib/whisper';

// Cloud transcription with Groq whisper-large-v3-turbo ($0.04/audio-hour).
// Accepts a URL (Groq fetches it — no download needed, works on Vercel) or a local file path.
export async function transcribeWithGroq(
  pathOrUrl: string,
  language: 'spanish' | 'russian'
): Promise<TranscriptSegment[]> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error('GROQ_API_KEY not set');

  const fd = new FormData();
  fd.append('model', 'whisper-large-v3-turbo');
  fd.append('language', language === 'spanish' ? 'es' : 'ru');
  fd.append('response_format', 'verbose_json');
  fd.append('temperature', '0');

  if (/^https?:\/\//.test(pathOrUrl)) {
    fd.append('url', pathOrUrl);
  } else {
    const buf = await fs.readFile(pathOrUrl);
    fd.append('file', new Blob([new Uint8Array(buf)]), path.basename(pathOrUrl));
  }

  const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    body: fd,
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Groq transcription failed (${res.status}): ${detail.slice(0, 300)}`);
  }

  const data = await res.json();
  interface GroqSegment { text?: string; start?: number; end?: number }
  const segments: TranscriptSegment[] = ((data.segments || []) as GroqSegment[])
    .map(s => ({
      text: (s.text || '').trim(),
      start: s.start ?? 0,
      end: s.end ?? 0,
      confidence: 0.9,
    }))
    .filter(s => s.text.length > 0 && s.end > s.start);

  if (segments.length === 0) throw new Error('Groq returned no transcript segments');
  return segments;
}
