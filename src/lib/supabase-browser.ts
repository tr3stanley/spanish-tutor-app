import { createBrowserClient } from '@supabase/ssr';

// Browser-side Supabase client, used ONLY for auth (magic link sign-in,
// session, sign-out). All data access goes through our API routes.
export function getBrowserSupabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
