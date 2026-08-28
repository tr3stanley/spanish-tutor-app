import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { folder_id, listened } = await request.json();

    const updates: { folder_id?: number | null; listened?: boolean } = {};
    if (folder_id !== undefined) updates.folder_id = folder_id;
    if (listened !== undefined) updates.listened = !!listened;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No updates provided' }, { status: 400 });
    }

    const supabase = getSupabase();
    const { data: podcast, error } = await supabase
      .from('episodes')
      .update(updates)
      .eq('id', parseInt(id))
      .select()
      .maybeSingle();

    if (error) throw error;

    if (!podcast) {
      return NextResponse.json({ error: 'Podcast not found' }, { status: 404 });
    }

    return NextResponse.json({ podcast });
  } catch (error) {
    console.error('Error updating podcast:', error);
    return NextResponse.json(
      { error: 'Failed to update podcast' },
      { status: 500 }
    );
  }
}
