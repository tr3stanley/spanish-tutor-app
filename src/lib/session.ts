// Session persistence. Supabase refresh tokens don't expire on their own, so how
// long someone stays signed in is really decided by the auth cookie's lifetime.
// Middleware re-issues these cookies on every request, so an active user's window
// keeps rolling forward and they never have to request another magic link.
//
// No next/headers import here — middleware (edge runtime) imports this too.

export const REMEMBER_COOKIE = 'stay-signed-in';

// 400 days is the ceiling browsers enforce on cookie lifetime (Chrome caps
// Max-Age there), so this is as close to "indefinitely" as a cookie can get.
export const REMEMBER_MAX_AGE = 400 * 24 * 60 * 60;

interface CookieOptions {
  maxAge?: number;
  expires?: Date;
  [key: string]: unknown;
}

// Opted in (the default) → long-lived cookie. Opted out → session cookie that
// dies with the browser, by stripping any lifetime the SDK set.
export function withSessionLifetime(options: CookieOptions | undefined, remember: boolean): CookieOptions {
  if (remember) return { ...(options || {}), maxAge: REMEMBER_MAX_AGE };
  const rest = { ...(options || {}) };
  delete rest.maxAge;
  delete rest.expires;
  return rest;
}

// Absent means remembered: friendlier default, and it's what happens when the
// magic link is opened in a different browser than the one that requested it.
export function wantsRemember(value: string | undefined): boolean {
  return value !== '0';
}
