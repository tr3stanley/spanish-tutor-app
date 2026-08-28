import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = getSupabase();

    const { data: podcast, error } = await supabase
      .from('episodes')
      .update({ listened: true })
      .eq('id', parseInt(id))
      .select()
      .maybeSingle();

    if (error) throw error;

    if (!podcast) {
      return NextResponse.json({ error: 'Podcast not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      podcast,
      message: 'Podcast marked as listened. Offline file will be auto-removed in 24 hours.'
    });
  } catch (error) {
    console.error('Error marking podcast as listened:', error);
    return NextResponse.json(
      { error: 'Failed to mark podcast as listened' },
      { status: 500 }
    );
  }
}
