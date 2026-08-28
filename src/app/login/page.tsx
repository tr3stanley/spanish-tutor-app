'use client';

import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import GlassCard from '@/components/GlassCard';
import CosmicBackground from '@/components/CosmicBackground';
import { getBrowserSupabase } from '@/lib/supabase-browser';
import { REMEMBER_COOKIE, REMEMBER_MAX_AGE } from '@/lib/session';

function LoginForm() {
  const [email, setEmail] = useState('');
  const [remember, setRemember] = useState(true);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const params = useSearchParams();
  const linkError = params.get('error');

  const sendLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !email.trim()) return;
    setBusy(true);
    setError(null);
    try {
      // Recorded now so /auth/confirm knows how long to keep the session when
      // the emailed link comes back.
      document.cookie = `${REMEMBER_COOKIE}=${remember ? '1' : '0'}; path=/; max-age=${REMEMBER_MAX_AGE}; samesite=lax`;
      const supabase = getBrowserSupabase();
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: `${window.location.origin}/auth/confirm` },
      });
      if (error) setError(error.message);
      else setSent(true);
    } catch {
      setError('Something went wrong — try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <GlassCard className="p-8 w-full max-w-md">
      <div className="text-center mb-6">
        <div className="w-12 h-12 bg-gradient-to-br from-purple-400 to-blue-400 rounded-xl flex items-center justify-center mx-auto mb-3">
          <span className="text-2xl">🎓</span>
        </div>
        <h1 className="text-2xl font-bold text-white">Podcast Tutor</h1>
        <p className="text-gray-300 text-sm mt-1">Sign in to your Spanish course</p>
      </div>

      {sent ? (
        <div className="text-center">
          <p className="text-white mb-2">📬 Check your email</p>
          <p className="text-gray-300 text-sm">
            We sent a sign-in link to <span className="text-white">{email}</span>.
            Click it and you&apos;re in — no password needed.
          </p>
          <button onClick={() => setSent(false)} className="text-gray-400 hover:text-gray-200 text-sm mt-4">
            Use a different email
          </button>
        </div>
      ) : (
        <form onSubmit={sendLink} className="space-y-3">
          {linkError && !error && (
            <p className="text-yellow-200 text-sm text-center">That link expired or was already used — request a fresh one.</p>
          )}
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:ring-2 focus:ring-purple-400 focus:outline-none"
          />
          {error && <p className="text-red-300 text-sm">{error}</p>}
          <label className="flex items-center space-x-2 text-sm text-gray-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={remember}
              onChange={e => setRemember(e.target.checked)}
              className="w-4 h-4 rounded border-white/30 bg-white/10 accent-purple-500"
            />
            <span>Keep me signed in on this device</span>
          </label>
          <button type="submit" disabled={busy || !email.trim()}
            className="cosmic-button w-full py-3 rounded-lg font-medium disabled:opacity-50">
            {busy ? 'Sending…' : 'Email me a sign-in link'}
          </button>
          <p className="text-xs text-gray-500 text-center">
            Stay signed in for good — you&apos;ll only need another link if you sign out.
          </p>
        </form>
      )}
    </GlassCard>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen cosmic-container">
      <CosmicBackground />
      <div className="relative z-10 min-h-screen flex items-center justify-center px-4">
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
