import { NextRequest, NextResponse } from 'next/server';
import { getAuth, unauthorized } from '@/lib/auth';

interface UsageRow {
  day: string;
  feature: string;
  model: string;
  provider: string;
  calls: number;
  prompt_tokens: number;
  completion_tokens: number;
  cost_usd: number | null;
}

// LLM spend broken down by day, feature and model. Token counts are exact
// (reported by the provider); cost is list price, so Groq free-tier calls
// show what they *would* cost.
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuth(request);
    if (!auth) return unauthorized();

    const days = Math.min(365, Math.max(1, parseInt(request.nextUrl.searchParams.get('days') || '30')));
    const { data, error } = await auth.supabase.rpc('usage_summary', { days });
    if (error) throw error;

    const rows = (data || []) as UsageRow[];
    const num = (v: number | null) => Number(v ?? 0);

    const byFeature = new Map<string, { calls: number; cost: number; in: number; out: number }>();
    const byDay = new Map<string, number>();
    let total = 0, calls = 0;

    for (const r of rows) {
      const cost = num(r.cost_usd);
      total += cost;
      calls += Number(r.calls);
      const f = byFeature.get(r.feature) || { calls: 0, cost: 0, in: 0, out: 0 };
      f.calls += Number(r.calls);
      f.cost += cost;
      f.in += Number(r.prompt_tokens);
      f.out += Number(r.completion_tokens);
      byFeature.set(r.feature, f);
      byDay.set(r.day, (byDay.get(r.day) || 0) + cost);
    }

    return NextResponse.json({
      days,
      total_cost_usd: Number(total.toFixed(6)),
      total_calls: calls,
      by_feature: [...byFeature.entries()]
        .map(([feature, v]) => ({
          feature,
          calls: v.calls,
          prompt_tokens: v.in,
          completion_tokens: v.out,
          cost_usd: Number(v.cost.toFixed(6)),
        }))
        .sort((a, b) => b.cost_usd - a.cost_usd),
      by_day: [...byDay.entries()]
        .map(([day, cost]) => ({ day, cost_usd: Number(cost.toFixed(6)) }))
        .sort((a, b) => (a.day < b.day ? 1 : -1)),
      rows,
    });
  } catch (error) {
    console.error('Usage summary error:', error);
    return NextResponse.json({ error: 'Failed to load usage' }, { status: 500 });
  }
}
