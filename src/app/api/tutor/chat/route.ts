import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { callOpenRouterChat, ChatMessage } from '@/lib/ai';
import { buildStudentContext, tutorSystemPrompt } from '@/lib/tutor';

export async function GET() {
  try {
    const supabase = getSupabase();
    const { data } = await supabase
      .from('tutor_messages')
      .select('id, role, content, kind, created_at')
      .neq('kind', 'placement')
      .order('id', { ascending: false })
      .limit(50);
    return NextResponse.json({ messages: (data || []).reverse() });
  } catch (error) {
    console.error('Error fetching tutor history:', error);
    return NextResponse.json({ error: 'Failed to fetch history' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { message } = await request.json();
    if (!message?.trim()) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    const supabase = getSupabase();

    const [context, historyRes] = await Promise.all([
      buildStudentContext(),
      supabase
        .from('tutor_messages')
        .select('role, content')
        .order('id', { ascending: false })
        .limit(20),
    ]);

    const history = (historyRes.data || []).reverse() as ChatMessage[];

    const reply = await callOpenRouterChat([
      { role: 'system', content: tutorSystemPrompt(context) },
      ...history,
      { role: 'user', content: message.trim() },
    ]);

    const { error } = await supabase.from('tutor_messages').insert([
      { role: 'user', content: message.trim() },
      { role: 'assistant', content: reply },
    ]);
    if (error) console.error('Failed to save tutor messages:', error.message);

    return NextResponse.json({ response: reply });
  } catch (error) {
    console.error('Tutor chat error:', error);
    return NextResponse.json({ error: 'Failed to process message' }, { status: 500 });
  }
}
