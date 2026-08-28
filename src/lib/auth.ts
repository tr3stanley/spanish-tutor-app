import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface AuthContext {
  supabase: SupabaseClient;
  userId: string;
  email: string | null;
}

export function supabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL must be set');
  return url;
}

export function supabaseAnonKey(): string {
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;
  if (!key) throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY must be set');
  return key;
}

// Authenticated per-request Supabase client. The session comes from cookies
// (browser) or an Authorization: Bearer token (non-browser API clients).
// Queries run as the signed-in user; RLS enforces per-user access.
export async function getAuth(request?: Request): Promise<AuthContext | null> {
  const bearer = request?.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (bearer) {
    const client = createClient(supabaseUrl(), supabaseAnonKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${bearer}` } },
    });
    const { data } = await client.auth.getUser(bearer);
    if (!data.user) return null;
    return { supabase: client, userId: data.user.id, email: data.user.email ?? null };
  }

  const cookieStore = await cookies();
  const client = createServerClient(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: () => {}, // token refresh happens in middleware, not route handlers
    },
  });
  const { data } = await client.auth.getUser();
  if (!data.user) return null;
  return { supabase: client, userId: data.user.id, email: data.user.email ?? null };
}

export function unauthorized() {
  return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
}
