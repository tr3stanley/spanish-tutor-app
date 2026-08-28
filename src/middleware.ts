import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { REMEMBER_COOKIE, REMEMBER_MAX_AGE, withSessionLifetime, wantsRemember } from '@/lib/session';

// Gate the whole app behind sign-in and keep sessions refreshed.
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Bearer-token API requests skip cookie auth; the route handler validates the token.
  if (pathname.startsWith('/api') && request.headers.get('authorization')) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });
  // Re-issued on every request, so a returning user's sign-in window keeps
  // rolling forward instead of quietly expiring.
  const remember = wantsRemember(request.cookies.get(REMEMBER_COOKIE)?.value);
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: cookiesToSet => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, withSessionLifetime(options, remember))
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  // Supabase only rewrites its cookies when it rotates tokens, so on a normal
  // request the lifetime would just tick down. Re-stamp the existing auth
  // cookies each visit to keep the "stay signed in" window rolling forward.
  if (user && remember) {
    const secure = request.nextUrl.protocol === 'https:';
    for (const cookie of request.cookies.getAll()) {
      if (!/^sb-.*-auth-token(\.\d+)?$/.test(cookie.name)) continue;
      if (response.cookies.get(cookie.name)) continue; // already re-issued above
      response.cookies.set(cookie.name, cookie.value, {
        path: '/',
        sameSite: 'lax',
        secure,
        maxAge: REMEMBER_MAX_AGE,
      });
    }
  }

  const isPublic = pathname.startsWith('/login') || pathname.startsWith('/auth');
  if (!user && !isPublic) {
    if (pathname.startsWith('/api')) {
      return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    }
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.search = '';
    return NextResponse.redirect(loginUrl);
  }
  if (user && pathname === '/login') {
    const home = request.nextUrl.clone();
    home.pathname = '/';
    home.search = '';
    return NextResponse.redirect(home);
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:png|jpg|jpeg|svg|ico|webmanifest|txt)$).*)'],
};
