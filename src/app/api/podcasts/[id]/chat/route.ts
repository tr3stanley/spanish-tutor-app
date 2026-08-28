import { NextRequest, NextResponse } from 'next/server';
import { getSupabase, fetchAllRows } from '@/lib/supabase';
import { callOpenRouter } from '@/lib/ai';

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { message, conversationHistory } = await request.json();
    const { id } = await params;
    const podcastId = parseInt(id);

    if (!message?.trim()) {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      );
    }

    const supabase = getSupabase();

    const { data: podcast } = await supabase
      .from('episodes')
      .select('title, language')
      .eq('id', podcastId)
      .maybeSingle();

    if (!podcast) {
      return NextResponse.json(
        { error: 'Podcast not found' },
        { status: 404 }
      );
    }

    const transcript = await fetchAllRows<{ text: string }>((from, to) =>
      supabase
        .from('transcript_segments')
        .select('text')
        .eq('episode_id', podcastId)
        .order('start_time')
        .range(from, to)
    );

    if (transcript.length === 0) {
      return NextResponse.json(
        { error: 'No transcript found for this podcast' },
        { status: 404 }
      );
    }

    const { data: lesson } = await supabase
      .from('lessons')
      .select('summary, grammar_rules, vocabulary')
      .eq('episode_id', podcastId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const fullTranscript = transcript.map(t => t.text).join(' ');
    const languageName = podcast.language === 'spanish' ? 'Spanish' : 'Russian';

    // Build conversation history for context
    let conversationContext = '';
    if (conversationHistory && conversationHistory.length > 0) {
      conversationContext = '\n\nPrevious conversation:\n' +
        conversationHistory.map((msg: ConversationMessage) =>
          `${msg.role === 'user' ? 'Student' : 'Tutor'}: ${msg.content}`
        ).join('\n');
    }

    // Create comprehensive prompt with podcast context
    const prompt = `
You are an expert ${languageName} tutor helping a student understand this specific podcast episode. You have complete knowledge of the episode content and should provide detailed, helpful responses.

PODCAST INFORMATION:
Title: "${podcast.title}"
Language: ${languageName}

FULL TRANSCRIPT:
${fullTranscript}

${lesson ? `LESSON SUMMARY:
${lesson.summary}

KEY GRAMMAR CONCEPTS:
${lesson.grammar_rules}

VOCABULARY NOTES:
${lesson.vocabulary}` : ''}

${conversationContext}

STUDENT'S CURRENT QUESTION:
${message}

IMPORTANT GUIDELINES:
- Always provide helpful, educational responses about this specific podcast episode
- Reference specific parts of the transcript when relevant
- Explain grammar and vocabulary in context of this episode
- Include English translations for any ${languageName} phrases you use
- Be encouraging and supportive
- If asked about content not in this episode, politely redirect to the podcast content
- Provide practical examples from the transcript when explaining concepts
- Help with pronunciation tips when relevant
- Offer cultural context when appropriate

Please respond as a knowledgeable, friendly ${languageName} tutor who has listened to this entire episode.
`;

    const response = await callOpenRouter(prompt);

    return NextResponse.json({ response });

  } catch (error) {
    console.error('Error in podcast chat:', error);
    return NextResponse.json(
      { error: 'Failed to process message' },
      { status: 500 }
    );
  }
}
