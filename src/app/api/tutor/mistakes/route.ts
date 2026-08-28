import { NextResponse } from 'next/server';
import { getSupabase, fetchAllRows } from '@/lib/supabase';

interface ErrorRow {
  id: number;
  error: string;
  correction: string | null;
  note: string | null;
  category: string | null;
  source: string;
  created_at: string;
}

// Mistakes grouped by category (most frequent first), with any cached explainer.
export async function GET() {
  try {
    const supabase = getSupabase();

    const [errors, explainersRes] = await Promise.all([
      fetchAllRows<ErrorRow>((from, to) =>
        supabase
          .from('error_log')
          .select('id, error, correction, note, category, source, created_at')
          .order('created_at', { ascending: false })
          .range(from, to)
      ),
      supabase.from('error_explainers').select('category, explanation, created_at'),
    ]);

    const explainers = new Map(
      (explainersRes.data || []).map(e => [e.category, { explanation: e.explanation, created_at: e.created_at }])
    );

    const byCategory = new Map<string, ErrorRow[]>();
    for (const e of errors) {
      const cat = e.category || 'other';
      if (!byCategory.has(cat)) byCategory.set(cat, []);
      byCategory.get(cat)!.push(e);
    }

    const groups = [...byCategory.entries()]
      .map(([category, items]) => ({
        category,
        count: items.length,
        errors: items,
        explainer: explainers.get(category) || null,
      }))
      .sort((a, b) => b.count - a.count);

    return NextResponse.json({ groups, total: errors.length });
  } catch (error) {
    console.error('Mistakes error:', error);
    return NextResponse.json({ error: 'Failed to fetch mistakes' }, { status: 500 });
  }
}
