'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import Navigation from '@/components/Navigation';
import GlassCard from '@/components/GlassCard';
import CosmicBackground from '@/components/CosmicBackground';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  kind?: string;
}

interface Profile {
  cefr_level: string | null;
  target_dialect: string | null;
  goals: { summary?: string };
}

export default function TutorPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [placementMode, setPlacementMode] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, busy]);

  const loadChatHistory = useCallback(async () => {
    const res = await fetch('/api/tutor/chat');
    const data = await res.json();
    setMessages(
      (data.messages || []).map((m: { id: number; role: string; content: string; kind: string }) => ({
        id: String(m.id),
        role: m.role,
        content: m.content,
        kind: m.kind,
      }))
    );
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/tutor/profile');
        const data = await res.json();
        setProfile(data.profile);
        if (data.profile?.cefr_level) {
          await loadChatHistory();
        }
      } catch (e) {
        console.error('Failed to load profile:', e);
      } finally {
        setProfileLoaded(true);
      }
    })();
  }, [loadChatHistory]);

  const startPlacement = async () => {
    setPlacementMode(true);
    setMessages([]);
    setBusy(true);
    try {
      const res = await fetch('/api/tutor/placement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ history: [] }),
      });
      const data = await res.json();
      setMessages([{ id: `a-${Date.now()}`, role: 'assistant', content: data.message }]);
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(false);
    }
  };

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    const userMsg: Message = { id: `u-${Date.now()}`, role: 'user', content: text };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setBusy(true);

    try {
      if (placementMode) {
        const history = nextMessages.map(m => ({ role: m.role, content: m.content }));
        const res = await fetch('/api/tutor/placement', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ history }),
        });
        const data = await res.json();
        setMessages(prev => [...prev, { id: `a-${Date.now()}`, role: 'assistant', content: data.message }]);
        if (data.done) {
          setPlacementMode(false);
          const profRes = await fetch('/api/tutor/profile');
          setProfile((await profRes.json()).profile);
        }
      } else {
        const res = await fetch('/api/tutor/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: text }),
        });
        const data = await res.json();
        setMessages(prev => [...prev, {
          id: `a-${Date.now()}`,
          role: 'assistant',
          content: data.response || data.error || 'Something went wrong.',
        }]);
      }
    } catch (e) {
      console.error(e);
      setMessages(prev => [...prev, { id: `err-${Date.now()}`, role: 'assistant', content: 'Sorry, that failed. Try again.' }]);
    } finally {
      setBusy(false);
    }
  };

  const startLesson = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch('/api/tutor/lesson', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.lesson) {
        setMessages(prev => [...prev, { id: `l-${Date.now()}`, role: 'assistant', content: data.lesson, kind: 'lesson' }]);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(false);
    }
  };

  const hasProfile = !!profile?.cefr_level;

  return (
    <div className="min-h-screen cosmic-container">
      <CosmicBackground />
      <div className="relative z-10">
        <Navigation />
        <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
                Spanish Instructor
              </h1>
              {hasProfile && (
                <p className="text-sm text-gray-300 mt-1">
                  Level {profile.cefr_level}
                  {profile.target_dialect && ` • ${profile.target_dialect.replace(/_/g, ' ')}`}
                </p>
              )}
            </div>
            {hasProfile && !placementMode && (
              <div className="flex items-center space-x-3">
                <button onClick={startLesson} disabled={busy}
                  className="cosmic-button px-4 py-2 rounded-lg text-sm disabled:opacity-50">
                  New Lesson
                </button>
                <Link href="/review"
                  className="bg-white/10 text-gray-200 hover:bg-white/20 px-4 py-2 rounded-lg text-sm transition-colors">
                  Vocab Review
                </Link>
                <button onClick={startPlacement} disabled={busy}
                  className="text-gray-400 hover:text-gray-200 text-sm">
                  Retake placement
                </button>
              </div>
            )}
          </div>

          {!profileLoaded ? (
            <div className="text-center py-16">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-400 mx-auto"></div>
            </div>
          ) : !hasProfile && !placementMode ? (
            <GlassCard className="p-8 text-center">
              <h2 className="text-xl font-semibold text-white mb-3">Welcome to your Spanish course</h2>
              <p className="text-gray-300 mb-6 max-w-lg mx-auto">
                Start with a short placement interview (5 minutes, part English, part Spanish).
                Your instructor will estimate your level, learn your goals and target dialect,
                and build every lesson from there.
              </p>
              <button onClick={startPlacement} className="cosmic-button px-6 py-3 rounded-lg font-medium">
                Start Placement Interview
              </button>
            </GlassCard>
          ) : (
            <GlassCard className="flex flex-col" >
              <div className="p-4 space-y-4 overflow-y-auto" style={{ minHeight: '50vh', maxHeight: '65vh' }}>
                {messages.length === 0 && !busy && (
                  <p className="text-gray-400 text-center py-8">
                    Say hola, ask a question, or hit &quot;New Lesson&quot; to continue your course.
                  </p>
                )}
                {messages.map(m => (
                  <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                      m.role === 'user'
                        ? 'bg-gradient-to-r from-purple-500/40 to-blue-500/40 text-white'
                        : m.kind === 'lesson'
                          ? 'bg-emerald-400/10 border border-emerald-400/30 text-gray-100'
                          : 'bg-white/10 text-gray-100'
                    }`}>
                      {m.kind === 'lesson' && (
                        <div className="text-emerald-300 text-xs font-semibold mb-2">📚 LESSON</div>
                      )}
                      {m.content}
                    </div>
                  </div>
                ))}
                {busy && (
                  <div className="flex justify-start">
                    <div className="bg-white/10 rounded-2xl px-4 py-3">
                      <div className="flex space-x-1">
                        <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce"></div>
                        <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                        <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              <div className="p-4 border-t border-white/20">
                <form onSubmit={(e) => { e.preventDefault(); send(); }} className="flex space-x-3">
                  <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        send();
                      }
                    }}
                    placeholder={placementMode ? 'Answer the interviewer…' : 'Escribe en español o inglés…'}
                    rows={2}
                    className="flex-1 bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:ring-2 focus:ring-purple-400 focus:outline-none resize-none"
                  />
                  <button type="submit" disabled={busy || !input.trim()}
                    className="cosmic-button px-5 rounded-lg disabled:opacity-50">
                    Send
                  </button>
                </form>
              </div>
            </GlassCard>
          )}
        </main>
      </div>
    </div>
  );
}
