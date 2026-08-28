import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import type { EmailOtpType } from '@supabase/supabase-js';
import { REMEMBER_COOKIE, withSessionLifetime, wantsRemember } from '@/lib/session';

// Magic-link landing: verifies the emailed token and sets the session cookies.
// Handles both token_hash links (works in any browser) and PKCE code links.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get('token_hash');
  const type = (searchParams.get('type') || 'email') as EmailOtpType;
  const code = searchParams.get('code');

  const cookieStore = await cookies();
  // Set by the login page before the link was requested; absent (e.g. the link
  // was opened in another browser) means remember, the friendlier default.
  const remember = wantsRemember(cookieStore.get(REMEMBER_COOKIE)?.value);
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: cookiesToSet => {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, withSessionLifetime(options, remember))
          );
        },
      },
    }
  );

  let ok = false;
  try {
    if (tokenHash) {
      ok = !(await supabase.auth.verifyOtp({ type, token_hash: tokenHash })).error;
    } else if (code) {
      ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
    }
  } catch (e) {
    console.error('Auth confirm failed:', e);
  }

  return NextResponse.redirect(new URL(ok ? '/' : '/login?error=expired', request.url));
}
