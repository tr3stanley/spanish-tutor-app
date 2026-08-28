import { NextRequest, NextResponse } from 'next/server';
import { getProfile } from '@/lib/tutor';

export const maxDuration = 60;

// Azure neural voice per target dialect (all included in the free tier).
const VOICE_BY_DIALECT: Record<string, string> = {
  costa_rican: 'es-CR-MariaNeural',
  mexican: 'es-MX-DaliaNeural',
  castilian: 'es-ES-ElviraNeural',
  rioplatense: 'es-AR-ElenaNeural',
  neutral_latam: 'es-US-PalomaNeural',
};

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Text-to-speech for tutor replies. Azure neural TTS when AZURE_SPEECH_KEY is
// set; otherwise tells the client to use the browser's built-in speech synthesis.
export async function POST(request: NextRequest) {
  try {
    const { text } = await request.json();
    if (!text?.trim()) {
      return NextResponse.json({ error: 'Text is required' }, { status: 400 });
    }

    const key = process.env.AZURE_SPEECH_KEY;
    if (!key) {
      return NextResponse.json({ fallback: 'browser' });
    }

    const region = process.env.AZURE_SPEECH_REGION || 'eastus';
    const profile = await getProfile();
    const voice = VOICE_BY_DIALECT[profile?.target_dialect || ''] || 'es-US-PalomaNeural';

    const clean = text
      .replace(/\*\*/g, '')
      .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '')
      .slice(0, 5000);

    const ssml = `<speak version="1.0" xml:lang="${voice.slice(0, 5)}"><voice name="${voice}"><prosody rate="-10%">${escapeXml(clean)}</prosody></voice></speak>`;

    const res = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': key,
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
      },
      body: ssml,
    });
    if (!res.ok) {
      const detail = await res.text();
      throw new Error(`Azure TTS failed (${res.status}): ${detail.slice(0, 300)}`);
    }

    const audio = await res.arrayBuffer();
    return new NextResponse(audio, {
      headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    console.error('TTS error:', error);
    return NextResponse.json({ error: 'Speech generation failed' }, { status: 500 });
  }
}
