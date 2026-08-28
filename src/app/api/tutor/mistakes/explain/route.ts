import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { callOpenRouterChat } from '@/lib/ai';
import { normalizeCategory, getProfile, dialectInstructions } from '@/lib/tutor';

// Generate (or regenerate) the explainer for one mistake category, anchored to
// the student's own sentences. Cached in error_explainers.
export async function POST(request: NextRequest) {
  try {
    const { category: rawCategory } = await request.json();
    const category = normalizeCategory(rawCategory);

    const supabase = getSupabase();
    const [{ data: errors }, profile] = await Promise.all([
      supabase
        .from('error_log')
        .select('error, correction, note')
        .eq('category', category)
        .order('created_at', { ascending: false })
        .limit(15),
      getProfile(),
    ]);

    if (!errors || errors.length === 0) {
      return NextResponse.json({ error: 'No recorded mistakes in this category' }, { status: 400 });
    }

    const explanation = await callOpenRouterChat(
      [
        {
          role: 'user',
          content: `You are a Spanish tutor. Your student (level ${profile?.cefr_level || 'B1'}) keeps making mistakes in the category "${category}". Here are their actual mistakes:

${errors.map(e => `- They wrote: "${e.error}"${e.correction ? ` (should be: "${e.correction}")` : ''}${e.note ? ` [${e.note}]` : ''}`).join('\n')}

${dialectInstructions(profile?.target_dialect || null)}

Write a focused explainer (plain text, no markdown headers) that:
1. States the underlying rule or pattern in plain English, in 2-3 sentences.
2. Walks through THEIR sentences: why each was wrong and the fix. Group similar ones.
3. Gives 3-4 fresh example pairs (wrong -> right, with English translations) showing the same pattern in other common situations they'd meet in conversation.
4. Ends with one memorable tip or rule of thumb.

Keep it under 350 words and encouraging.`,
        },
      ],
      { temperature: 0.3, maxTokens: 1200 }
    );

    const { data: saved, error } = await supabase
      .from('error_explainers')
      .upsert(
        {
          user_id: '00000000-0000-0000-0000-000000000000',
          category,
          explanation,
          created_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,category' }
      )
      .select('category, explanation, created_at')
      .single();
    if (error) throw error;

    return NextResponse.json({ explainer: saved });
  } catch (error) {
    console.error('Explain error:', error);
    return NextResponse.json({ error: 'Failed to generate explanation' }, { status: 500 });
  }
}
