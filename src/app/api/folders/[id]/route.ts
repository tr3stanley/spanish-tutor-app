import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { name } = await request.json();

    if (!name?.trim()) {
      return NextResponse.json({ error: 'Folder name is required' }, { status: 400 });
    }

    const supabase = getSupabase();
    const { data: folder, error } = await supabase
      .from('folders')
      .update({ name: name.trim() })
      .eq('id', parseInt(id))
      .select()
      .maybeSingle();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Folder name already exists' }, { status: 400 });
      }
      throw error;
    }

    if (!folder) {
      return NextResponse.json({ error: 'Folder not found' }, { status: 404 });
    }

    return NextResponse.json({ folder });
  } catch (error) {
    console.error('Error updating folder:', error);
    return NextResponse.json(
      { error: 'Failed to update folder' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = getSupabase();

    const { count } = await supabase
      .from('episodes')
      .select('id', { count: 'exact', head: true })
      .eq('folder_id', parseInt(id));

    if ((count ?? 0) > 0) {
      return NextResponse.json(
        { error: 'Cannot delete folder with podcasts. Move podcasts to another folder first.' },
        { status: 400 }
      );
    }

    const { error } = await supabase.from('folders').delete().eq('id', parseInt(id));
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting folder:', error);
    return NextResponse.json(
      { error: 'Failed to delete folder' },
      { status: 500 }
    );
  }
}
