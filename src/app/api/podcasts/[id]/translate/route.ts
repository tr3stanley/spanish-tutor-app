import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/database';

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
    const db = await getDatabase();
    const podcast = await db.get('SELECT language FROM podcasts WHERE id = ?', [podcastId]);

    if (!podcast) {
      return NextResponse.json({ error: 'Podcast not found' }, { status: 404 });
    }

    // Determine source and target language
    const sourceLanguage = podcast.language === 'spanish' ? 'Spanish' : 'Russian';
    const targetLanguage = 'English';

    // Call OpenRouter API for translation
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.SITE_URL || 'http://localhost:3000',
        'X-Title': 'Spanish Tutor App',
      },
      body: JSON.stringify({
        model: 'deepseek/deepseek-chat',
        messages: [
          {
            role: 'system',
            content: `You are a professional translator. Translate the following ${sourceLanguage} text to ${targetLanguage}. Provide only the translation, no explanations or additional text.`
          },
          {
            role: 'user',
            content: text
          }
        ],
        temperature: 0.3,
        max_tokens: 500
      })
    });

    if (!response.ok) {
      throw new Error('Translation API request failed');
    }

    const data = await response.json();
    const translation = data.choices[0]?.message?.content;

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