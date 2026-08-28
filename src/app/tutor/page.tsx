'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import Navigation from '@/components/Navigation';
import GlassCard from '@/components/GlassCard';
import CosmicBackground from '@/components/CosmicBackground';
import { levelInfo } from '@/lib/levels';

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

interface CourseUnit {
  position: number;
  title: string;
  status: 'pending' | 'in_progress' | 'done';
}

interface TodayInfo {
  due_cards: number;
  syllabus: { total: number; done: number; current: CourseUnit | null; units: CourseUnit[] } | null;
}

export default function TutorPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [placementMode, setPlacementMode] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [today, setToday] = useState<TodayInfo | null>(null);
  const [showSyllabus, setShowSyllabus] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const loadToday = useCallback(async () => {
    try {
      const res = await fetch('/api/tutor/today');
      setToday(await res.json());
    } catch (e) {
      console.error('Failed to load today summary:', e);
    }
  }, []);

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
          await Promise.all([loadChatHistory(), loadToday()]);
        }
      } catch (e) {
        console.error('Failed to load profile:', e);
      } finally {
        setProfileLoaded(true);
      }
    })();
  }, [loadChatHistory, loadToday]);

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

  const send = async (textOverride?: string) => {
    const text = (textOverride ?? input).trim();
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
          await loadToday();
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
        await loadToday();
      } else if (data.error) {
        setMessages(prev => [...prev, { id: `l-${Date.now()}`, role: 'assistant', content: data.error }]);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(false);
    }
  };

  const startFreeChat = () => {
    send('Vamos a hacer 5 minutos de conversación libre, solo en español. Empieza tú con una pregunta sobre mi día o mis planes.');
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
                <p
                  className="text-sm text-gray-300 mt-1 cursor-help"
                  title={levelInfo(profile.cefr_level)?.speaking || ''}
                >
                  Level {profile.cefr_level}
                  {levelInfo(profile.cefr_level) && ` · ${levelInfo(profile.cefr_level)!.label}`}
                  {profile.target_dialect && ` • ${profile.target_dialect.replace(/_/g, ' ')} Spanish`}
                </p>
              )}
            </div>
            {hasProfile && !placementMode && (
              <button onClick={startPlacement} disabled={busy}
                className="text-gray-400 hover:text-gray-200 text-sm">
                Retake placement
              </button>
            )}
          </div>

          {/* Today strip */}
          {hasProfile && !placementMode && (
            <div className="glass-card rounded-lg p-3 mb-4 flex flex-wrap items-center gap-3 text-sm">
              <span className="text-gray-300 font-medium">Today:</span>
              <Link href="/review"
                className={`px-3 py-1.5 rounded-lg transition-colors ${
                  (today?.due_cards ?? 0) > 0
                    ? 'bg-orange-400/20 text-orange-200 border border-orange-400/40 hover:bg-orange-400/30'
                    : 'bg-white/10 text-gray-300 hover:bg-white/20'
                }`}>
                {(today?.due_cards ?? 0) > 0 ? `${today!.due_cards} cards due` : 'Vocab review'}
              </Link>
              <button onClick={startLesson} disabled={busy}
                className="cosmic-button px-3 py-1.5 rounded-lg disabled:opacity-50">
                {today?.syllabus?.current
                  ? `${today.syllabus.current.status === 'in_progress' ? 'Continue' : 'Start'} Unit ${today.syllabus.current.position}: ${today.syllabus.current.title.slice(0, 40)}${today.syllabus.current.title.length > 40 ? '…' : ''}`
                  : 'New Lesson'}
              </button>
              <button onClick={startFreeChat} disabled={busy}
                className="bg-white/10 text-gray-200 hover:bg-white/20 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50">
                5-min chat en español
              </button>
              {today?.syllabus && (
                <button onClick={() => setShowSyllabus(s => !s)}
                  className="ml-auto text-gray-400 hover:text-gray-200">
                  Course {today.syllabus.done}/{today.syllabus.total} {showSyllabus ? '▾' : '▸'}
                </button>
              )}
            </div>
          )}

          {/* Syllabus panel */}
          {hasProfile && !placementMode && showSyllabus && today?.syllabus && (
            <div className="glass-card rounded-lg p-4 mb-4">
              <ol className="space-y-1.5 text-sm">
                {today.syllabus.units.map(u => (
                  <li key={u.position} className={`flex items-start space-x-2 ${
                    u.status === 'done' ? 'text-gray-500 line-through' :
                    u.status === 'in_progress' ? 'text-purple-300 font-medium' : 'text-gray-300'
                  }`}>
                    <span className="flex-shrink-0">
                      {u.status === 'done' ? '✓' : u.status === 'in_progress' ? '▶' : '○'}
                    </span>
                    <span>{u.position}. {u.title}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

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
