'use client';

import { useState, useEffect, useCallback } from 'react';
import Navigation from '@/components/Navigation';
import GlassCard from '@/components/GlassCard';
import CosmicBackground from '@/components/CosmicBackground';

interface Member {
  user_id: string;
  display_name: string;
  is_me: boolean;
  lessons: number;
  reviews: number;
  minutes: number;
  active_days: number;
  points: number;
}

interface Board {
  id: number;
  name: string;
  invite_code: string;
  is_owner: boolean;
  members: Member[];
}

const MEDALS = ['🥇', '🥈', '🥉'];

export default function LeaderboardPage() {
  const [boards, setBoards] = useState<Board[] | null>(null);
  const [name, setName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/leaderboards');
      const d = await res.json();
      setBoards(d.boards || []);
    } catch (e) {
      console.error(e);
      setBoards([]);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const post = async (body: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/leaderboards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, display_name: displayName.trim() || undefined }),
      });
      const d = await res.json();
      if (d.error) setError(d.error);
      else {
        setName('');
        setJoinCode('');
        await load();
      }
    } catch {
      setError('Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  const leave = async (board: Board) => {
    const msg = board.is_owner
      ? `Delete "${board.name}" for everyone?`
      : `Leave "${board.name}"?`;
    if (!confirm(msg)) return;
    await fetch(`/api/leaderboards/${board.id}`, { method: 'DELETE' });
    load();
  };

  const share = async (board: Board) => {
    const url = `${window.location.origin}/leaderboard?join=${board.invite_code}`;
    const text = `Join my Spanish leaderboard "${board.name}" — code ${board.invite_code}\n${url}`;
    try {
      if (navigator.share) await navigator.share({ title: board.name, text, url });
      else {
        await navigator.clipboard.writeText(text);
        setCopied(board.invite_code);
        setTimeout(() => setCopied(null), 2000);
      }
    } catch { /* user dismissed the share sheet */ }
  };

  // Someone opened an invite link
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('join');
    if (code) setJoinCode(code.toUpperCase());
  }, []);

  return (
    <div className="min-h-screen cosmic-container">
      <CosmicBackground />
      <div className="relative z-10">
        <Navigation />
        <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
            Leaderboard
          </h1>
          <p className="text-sm text-gray-300 mt-1 mb-6">
            This week&apos;s effort, reset every Monday — so whoever starts last can still win.
          </p>

          {boards === null ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-400 mx-auto" />
            </div>
          ) : (
            <div className="space-y-4">
              {boards.map(board => (
                <GlassCard key={board.id} className="p-5">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h2 className="text-lg font-semibold text-white">{board.name}</h2>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {board.members.length} member{board.members.length === 1 ? '' : 's'} · code{' '}
                        <span className="font-mono text-gray-300">{board.invite_code}</span>
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => share(board)}
                        className="cosmic-button px-3 py-1.5 rounded-lg text-xs">
                        {copied === board.invite_code ? 'Copied!' : 'Invite'}
                      </button>
                      <button onClick={() => leave(board)}
                        className="text-gray-500 hover:text-red-300 text-xs">
                        {board.is_owner ? 'Delete' : 'Leave'}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    {board.members.map((m, i) => (
                      <div key={m.user_id}
                        className={`flex items-center gap-3 px-3 py-2 rounded-lg ${
                          m.is_me ? 'bg-purple-400/15 border border-purple-400/30' : 'bg-white/5'
                        }`}>
                        <span className="w-6 text-center text-sm">
                          {MEDALS[i] || <span className="text-gray-500">{i + 1}</span>}
                        </span>
                        <span className={`flex-1 text-sm ${m.is_me ? 'text-white font-medium' : 'text-gray-200'}`}>
                          {m.display_name}{m.is_me && <span className="text-purple-300 text-xs"> (you)</span>}
                        </span>
                        <span className="text-xs text-gray-400 hidden sm:inline">
                          {m.lessons}L · {m.reviews}R · {m.minutes}m
                        </span>
                        <span className="text-xs text-gray-400">{m.active_days}/7</span>
                        <span className="text-sm font-semibold text-purple-300 w-12 text-right tabular-nums">
                          {m.points}
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] text-gray-500 mt-3">
                    Points: lesson 10 · review 3 · 1 per minute listened (capped at 300)
                  </p>
                </GlassCard>
              ))}

              <GlassCard className="p-5 space-y-4">
                <div>
                  <h2 className="text-white font-medium mb-1">Your name on leaderboards</h2>
                  <input value={displayName} onChange={e => setDisplayName(e.target.value)}
                    placeholder="e.g. Thomas"
                    className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white placeholder-gray-500 text-sm focus:ring-2 focus:ring-purple-400 focus:outline-none" />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-white/10">
                  <div>
                    <h3 className="text-sm text-gray-300 mb-2">Start a leaderboard</h3>
                    <div className="flex gap-2">
                      <input value={name} onChange={e => setName(e.target.value)}
                        placeholder="Family Spanish"
                        className="flex-1 min-w-0 bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white placeholder-gray-500 text-sm focus:ring-2 focus:ring-purple-400 focus:outline-none" />
                      <button onClick={() => post({ name })} disabled={busy || !name.trim()}
                        className="cosmic-button px-3 py-2 rounded-lg text-sm disabled:opacity-50">Create</button>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm text-gray-300 mb-2">Join with a code</h3>
                    <div className="flex gap-2">
                      <input value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase())}
                        placeholder="ABC123" maxLength={6}
                        className="flex-1 min-w-0 bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white placeholder-gray-500 text-sm font-mono focus:ring-2 focus:ring-purple-400 focus:outline-none" />
                      <button onClick={() => post({ join_code: joinCode })} disabled={busy || joinCode.length < 4}
                        className="cosmic-button px-3 py-2 rounded-lg text-sm disabled:opacity-50">Join</button>
                    </div>
                  </div>
                </div>
                {error && <p className="text-red-300 text-sm">{error}</p>}
              </GlassCard>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
