import { NextRequest, NextResponse } from 'next/server';
import { getAuth, unauthorized } from '@/lib/auth';
import { callOpenRouterChat } from '@/lib/ai';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { text } = await request.json();
    const { id } = await params;
    const podcastId = parseInt(id);

    if (!text) {
      return NextResponse.json({ error: 'Text is required' }, { status: 400 });
    }

    // Get podcast info to determine source language
    const auth = await getAuth(request);
    if (!auth) return unauthorized();
    const { supabase } = auth;
    const { data: podcast } = await supabase
      .from('episodes')
      .select('language')
      .eq('id', podcastId)
      .maybeSingle();

    if (!podcast) {
      return NextResponse.json({ error: 'Podcast not found' }, { status: 404 });
    }

    // Determine source and target language
    const sourceLanguage = podcast.language === 'spanish' ? 'Spanish' : 'Russian';
    const targetLanguage = 'English';

    const translation = await callOpenRouterChat([
      {
        role: 'system',
        content: `You are a professional translator. Translate the following ${sourceLanguage} text to ${targetLanguage}. Provide only the translation, no explanations or additional text.`
      },
      { role: 'user', content: text }
    ], { temperature: 0.3, maxTokens: 500 });

    if (!translation) {
      throw new Error('No translation received from AI');
    }

    return NextResponse.json({ translation });
  } catch (error) {
    console.error('Translation error:', error);
    return NextResponse.json(
      { error: 'Failed to translate text' },
      { status: 500 }
    );
  }
}