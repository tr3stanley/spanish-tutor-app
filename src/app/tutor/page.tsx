'use client';

import { useState, useEffect, useRef, useCallback, ReactNode } from 'react';
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
  at?: string;
  // Placement only: the interviewer's private assessment. Never rendered —
  // students who see themselves being marked answer below their real level.
  notes?: string;
}

interface Profile {
  cefr_level: string | null;
  target_dialect: string | null;
  goals: { summary?: string };
}

interface CourseUnit {
  position: number;
  block: number;
  title: string;
  status: 'pending' | 'in_progress' | 'done';
}

interface TodayInfo {
  due_cards: number;
  syllabus: { total: number; done: number; current: CourseUnit | null; units: CourseUnit[] } | null;
}

interface LessonEntry {
  id: number;
  topic: string;
  cefr_level: string | null;
  content: string;
  created_at: string;
}

interface MistakeGroup {
  category: string;
  count: number;
  errors: { id: number; error: string; correction: string | null; note: string | null; created_at: string }[];
  explainer: { explanation: string; created_at: string } | null;
}

const PLACEMENT_STORAGE_KEY = 'tutor-placement-progress';

// Minimal rich text: **bold** plus preserved line breaks.
function renderRich(text: string): ReactNode {
  return text.split('\n').map((line, li) => {
    const parts = line.split(/\*\*(.+?)\*\*/g);
    return (
      <span key={li}>
        {li > 0 && <br />}
        {parts.map((p, pi) => (pi % 2 === 1 ? <strong key={pi} className="font-semibold">{p}</strong> : p))}
      </span>
    );
  });
}

// Tutor replies mix English explanation with Spanish examples. Reading the English
// aloud in a Spanish voice teaches nothing, so auto-play speaks only the Spanish:
// quoted/emphasised fragments, or lines that look Spanish by their function words.
function spanishOnly(text: string): string {
  const clean = text.replace(/[*_`]/g, '');
  const quoted = [...clean.matchAll(/[""«]([^""»]{3,})[""»]/g)].map(m => m[1].trim());
  if (quoted.length > 0) return quoted.join('. ');

  const spanishish = /\b(el|la|los|las|un|una|es|son|está|están|que|de|en|por|para|con|no|sí|y|pero|porque|me|te|se|mi|tu|su|qué|cómo|dónde|cuándo|muy|más|hola|gracias|puedo|puedes|tengo|tienes|vamos|quiero)\b/i;
  const lines = clean
    .split(/\n|(?<=[.!?¡¿])\s+/)
    .map(l => l.trim())
    .filter(l => l.length > 8 && spanishish.test(l) && !/^[A-Z][a-z]+ (is|are|means|the|to|for|when|you)\b/.test(l));
  return lines.join(' ').slice(0, 600);
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function loadSavedPlacement(): Message[] | null {
  try {
    const raw = localStorage.getItem(PLACEMENT_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
  } catch {
    return null;
  }
}

function savePlacement(messages: Message[] | null) {
  try {
    if (messages) localStorage.setItem(PLACEMENT_STORAGE_KEY, JSON.stringify(messages));
    else localStorage.removeItem(PLACEMENT_STORAGE_KEY);
  } catch {
    // storage unavailable — placement just won't survive reloads
  }
}

export default function TutorPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [placementMode, setPlacementMode] = useState(false);
  const [savedPlacement, setSavedPlacement] = useState<Message[] | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [today, setToday] = useState<TodayInfo | null>(null);
  const [showSyllabus, setShowSyllabus] = useState(false);
  const [tab, setTab] = useState<'chat' | 'lessons' | 'mistakes'>('chat');
  const [lessons, setLessons] = useState<LessonEntry[] | null>(null);
  const [openLesson, setOpenLesson] = useState<number | null>(null);
  const [mistakes, setMistakes] = useState<{ groups: MistakeGroup[]; total: number } | null>(null);
  const [openCategory, setOpenCategory] = useState<string | null>(null);
  const [explaining, setExplaining] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [autoPlay, setAutoPlay] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ttsCacheRef = useRef<Map<string, string>>(new Map());
  const autoPlayedRef = useRef<Set<string>>(new Set());
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const chatCardRef = useRef<HTMLDivElement>(null);
  const [chatHeight, setChatHeight] = useState<number | null>(null);

  useEffect(() => {
    if (tab === 'chat') messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, busy, tab, chatHeight]);

  useEffect(() => {
    try { setAutoPlay(localStorage.getItem('tutor-autoplay') === '1'); } catch { /* no storage */ }
  }, []);

  // iOS shrinks the VISUAL viewport when the keyboard opens but leaves the layout
  // viewport alone, so a normally-flowed composer ends up stranded behind the
  // keyboard. Sizing the panel from its own top to the visual viewport's bottom
  // keeps the input pinned just above the keyboard, like a messaging app.
  useEffect(() => {
    const compute = () => {
      const el = chatCardRef.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top;
      const vv = window.visualViewport;
      const vh = vv?.height ?? window.innerHeight;
      // With the keyboard up the tab bar hides itself, so only reserve room for
      // it when it's actually on screen.
      const hidden = vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0;
      const tabBar = window.innerWidth < 768 && hidden <= 120 ? 68 : 0;
      setChatHeight(Math.max(280, Math.round(vh - top - tabBar - 8)));
    };
    compute();
    const vv = window.visualViewport;
    window.addEventListener('resize', compute);
    window.addEventListener('orientationchange', compute);
    vv?.addEventListener('resize', compute);
    vv?.addEventListener('scroll', compute);
    return () => {
      window.removeEventListener('resize', compute);
      window.removeEventListener('orientationchange', compute);
      vv?.removeEventListener('resize', compute);
      vv?.removeEventListener('scroll', compute);
    };
  }, [tab, placementMode, profileLoaded, showSyllabus]);

  const toggleAutoPlay = () => {
    setAutoPlay(prev => {
      const next = !prev;
      try { localStorage.setItem('tutor-autoplay', next ? '1' : '0'); } catch { /* no storage */ }
      if (!next) stopSpeaking();
      return next;
    });
  };

  const loadToday = useCallback(async () => {
    try {
      const res = await fetch('/api/tutor/today');
      setToday(await res.json());
    } catch (e) {
      console.error('Failed to load today summary:', e);
    }
  }, []);

  const loadChatHistory = useCallback(async () => {
    const res = await fetch('/api/tutor/chat');
    const data = await res.json();
    setMessages(
      (data.messages || []).map((m: { id: number; role: string; content: string; kind: string; created_at: string }) => ({
        id: String(m.id),
        role: m.role,
        content: m.content,
        kind: m.kind,
        at: m.created_at,
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
        } else {
          setSavedPlacement(loadSavedPlacement());
        }
      } catch (e) {
        console.error('Failed to load profile:', e);
      } finally {
        setProfileLoaded(true);
      }
    })();
  }, [loadChatHistory, loadToday]);

  const loadLessons = useCallback(async () => {
    try {
      const res = await fetch('/api/tutor/lessons');
      setLessons((await res.json()).lessons || []);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const loadMistakes = useCallback(async () => {
    try {
      const res = await fetch('/api/tutor/mistakes');
      const data = await res.json();
      setMistakes({ groups: data.groups || [], total: data.total || 0 });
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    if (tab === 'lessons' && lessons === null) loadLessons();
    if (tab === 'mistakes' && mistakes === null) loadMistakes();
  }, [tab, lessons, mistakes, loadLessons, loadMistakes]);

  const startPlacement = async (resume = false) => {
    setPlacementMode(true);
    setTab('chat');
    const resumed = resume ? (savedPlacement || []) : [];
    setMessages(resumed);
    if (!resume) savePlacement(null);
    if (resumed.length > 0) return; // picks up where the saved interview left off

    setBusy(true);
    try {
      const res = await fetch('/api/tutor/placement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ history: [] }),
      });
      const data = await res.json();
      if (!res.ok || !String(data.message || '').trim()) {
        setPlacementMode(false);
        alert("Couldn't start the interview just now — please try again.");
        return;
      }
      const opening = [{ id: `a-${Date.now()}`, role: 'assistant' as const, content: data.message, notes: data.notes, at: new Date().toISOString() }];
      setMessages(opening);
      savePlacement(opening);
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
    const userMsg: Message = { id: `u-${Date.now()}`, role: 'user', content: text, at: new Date().toISOString() };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setBusy(true);

    try {
      if (placementMode) {
        const history = nextMessages.map(m => ({ role: m.role, content: m.content, notes: m.notes }));
        const res = await fetch('/api/tutor/placement', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ history }),
        });
        const data = await res.json();

        // A failed turn must not enter the history: an empty assistant message
        // made the interviewer lose its place and re-ask the same question.
        // Roll the student's message back so they can simply resend.
        if (!res.ok || data.error === 'retry' || (!data.done && !String(data.message || '').trim())) {
          setMessages(messages);
          setInput(text);
          alert(data.message || "That didn't come through — please try sending it again.");
          return;
        }

        const withReply = [...nextMessages, { id: `a-${Date.now()}`, role: 'assistant' as const, content: data.message, notes: data.notes, at: new Date().toISOString() }];
        setMessages(withReply);
        if (data.done) {
          setPlacementMode(false);
          savePlacement(null);
          setSavedPlacement(null);
          const profRes = await fetch('/api/tutor/profile');
          setProfile((await profRes.json()).profile);
          await loadToday();
        } else {
          savePlacement(withReply);
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
          at: new Date().toISOString(),
        }]);
        setMistakes(null); // may have new entries next time the tab opens
      }
    } catch (e) {
      console.error(e);
      setMessages(prev => [...prev, { id: `err-${Date.now()}`, role: 'assistant', content: 'Sorry, that failed. Try again.', at: new Date().toISOString() }]);
    } finally {
      setBusy(false);
    }
  };

  const startLesson = async () => {
    if (busy) return;
    setTab('chat');
    setBusy(true);
    try {
      const res = await fetch('/api/tutor/lesson', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.lesson) {
        setMessages(prev => [...prev, { id: `l-${Date.now()}`, role: 'assistant', content: data.lesson, kind: 'lesson', at: new Date().toISOString() }]);
        setLessons(null);
        await loadToday();
      } else if (data.error) {
        setMessages(prev => [...prev, { id: `l-${Date.now()}`, role: 'assistant', content: data.error, at: new Date().toISOString() }]);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(false);
    }
  };

  const completeUnit = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch('/api/tutor/complete-unit', { method: 'POST' });
      const data = await res.json();
      if (data.completed) {
        setMessages(prev => [...prev, {
          id: `c-${Date.now()}`,
          role: 'assistant',
          content: `🎉 Unit ${data.completed.position} complete: ${data.completed.title}. On to the next one whenever you're ready!`,
          at: new Date().toISOString(),
        }]);
        await loadToday();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(false);
    }
  };

  const startFreeChat = () => {
    setTab('chat');
    send('Vamos a hacer 5 minutos de conversación libre, solo en español. Empieza tú con una pregunta sobre mi día o mis planes.');
  };

  const explainCategory = async (category: string) => {
    setExplaining(category);
    try {
      const res = await fetch('/api/tutor/mistakes/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category }),
      });
      const data = await res.json();
      if (data.explainer) {
        setMistakes(prev => prev ? {
          ...prev,
          groups: prev.groups.map(g => g.category === category ? { ...g, explainer: data.explainer } : g),
        } : prev);
        setOpenCategory(category);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setExplaining(null);
    }
  };

  // Voice input: record with the browser mic, transcribe server-side, drop the
  // text into the input box so the student can check what was heard before sending.
  const toggleRecording = async () => {
    if (recording) {
      mediaRecorderRef.current?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];

      // Auto-stop after a beat of silence, so it's talk-and-done rather than
      // tap-talk-tap. Cheaper and simpler than a always-on mic, and it avoids
      // transcribing an open room.
      try {
        const ctx = new AudioContext();
        audioCtxRef.current = ctx;
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        ctx.createMediaStreamSource(stream).connect(analyser);
        const buf = new Uint8Array(analyser.frequencyBinCount);
        let spokeYet = false;

        const tick = () => {
          if (mr.state !== 'recording') return;
          analyser.getByteTimeDomainData(buf);
          let peak = 0;
          for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
          const speaking = peak > 8; // ~3% deviation from silence

          if (speaking) {
            spokeYet = true;
            if (silenceTimerRef.current) {
              clearTimeout(silenceTimerRef.current);
              silenceTimerRef.current = null;
            }
          } else if (spokeYet && !silenceTimerRef.current) {
            silenceTimerRef.current = setTimeout(() => {
              if (mr.state === 'recording') mr.stop();
            }, 2000);
          }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      } catch {
        // No AudioContext (or blocked) — the stop button still works.
      }
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        if (silenceTimerRef.current) {
          clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = null;
        }
        audioCtxRef.current?.close().catch(() => {});
        audioCtxRef.current = null;
        setRecording(false);
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || 'audio/webm' });
        if (blob.size < 2000) return;
        setTranscribing(true);
        try {
          const fd = new FormData();
          fd.append('audio', blob, 'recording.webm');
          const res = await fetch('/api/tutor/transcribe', { method: 'POST', body: fd });
          const data = await res.json();
          if (data.text) {
            setInput(prev => (prev ? prev.trimEnd() + ' ' : '') + data.text);
            textareaRef.current?.focus();
          } else if (data.error) {
            alert(data.error);
          }
        } catch (e) {
          console.error('Transcription failed:', e);
        } finally {
          setTranscribing(false);
        }
      };
      mr.start();
      mediaRecorderRef.current = mr;
      setRecording(true);
    } catch (e) {
      console.error('Microphone unavailable:', e);
      alert('Could not access the microphone. Check browser permissions.');
    }
  };

  const stopSpeaking = useCallback(() => {
    audioRef.current?.pause();
    audioRef.current = null;
    try { window.speechSynthesis?.cancel(); } catch { /* not supported */ }
    setSpeakingId(null);
  }, []);

  useEffect(() => () => {
    stopSpeaking();
    for (const url of ttsCacheRef.current.values()) URL.revokeObjectURL(url);
  }, [stopSpeaking]);

  // Voice output: Azure audio when the server has a key, browser speech otherwise.
  const speak = async (id: string, text: string) => {
    if (speakingId === id) {
      stopSpeaking();
      return;
    }
    stopSpeaking();
    setSpeakingId(id);
    const clean = text.replace(/\*\*/g, '');
    try {
      let url = ttsCacheRef.current.get(id);
      if (!url) {
        const res = await fetch('/api/tutor/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: clean }),
        });
        if ((res.headers.get('content-type') || '').includes('audio')) {
          url = URL.createObjectURL(await res.blob());
          ttsCacheRef.current.set(id, url);
        }
      }
      if (url) {
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.onended = () => setSpeakingId(cur => (cur === id ? null : cur));
        await audio.play();
      } else if (window.speechSynthesis) {
        const u = new SpeechSynthesisUtterance(clean);
        const esVoice = window.speechSynthesis.getVoices().find(v => /^es[-_]/i.test(v.lang));
        if (esVoice) u.voice = esVoice;
        u.lang = esVoice?.lang || 'es-ES';
        u.rate = 0.9;
        u.onend = () => setSpeakingId(cur => (cur === id ? null : cur));
        u.onerror = () => setSpeakingId(cur => (cur === id ? null : cur));
        window.speechSynthesis.speak(u);
      } else {
        setSpeakingId(null);
      }
    } catch (e) {
      console.error('Playback failed:', e);
      setSpeakingId(null);
    }
  };

  // Auto-play deliberately uses the FREE browser voice, not Azure. Azure's tier is
  // 500k chars/month for everyone combined — about 14 replies a day — so reading
  // every message aloud through it would exhaust the quota in a fortnight. The
  // 🔊 button still uses the good neural voice on demand.
  const speakWithBrowserVoice = useCallback((id: string, text: string) => {
    if (!window.speechSynthesis) return;
    const spanish = spanishOnly(text);
    if (!spanish) return; // nothing worth hearing — reply was pure English
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(spanish);
    const esVoice = window.speechSynthesis.getVoices().find(v => /^es[-_]/i.test(v.lang));
    if (esVoice) u.voice = esVoice;
    u.lang = esVoice?.lang || 'es-ES';
    u.rate = 0.9;
    u.onend = () => setSpeakingId(cur => (cur === id ? null : cur));
    u.onerror = () => setSpeakingId(cur => (cur === id ? null : cur));
    setSpeakingId(id);
    window.speechSynthesis.speak(u);
  }, []);

  useEffect(() => {
    if (!autoPlay || placementMode || busy) return;
    const last = messages[messages.length - 1];
    if (!last || last.role !== 'assistant' || autoPlayedRef.current.has(last.id)) return;
    autoPlayedRef.current.add(last.id);
    // Browsers block audio without a prior gesture; sending a message counts,
    // but iOS can still refuse, in which case this simply no-ops.
    speakWithBrowserVoice(last.id, last.content);
  }, [messages, autoPlay, placementMode, busy, speakWithBrowserVoice]);

  const hasProfile = !!profile?.cefr_level;
  const currentUnit = today?.syllabus?.current || null;

  const chips = [
    { label: 'Explain that again', action: () => send('Can you explain that again more simply, with another example?') },
    { label: 'Give me an example', action: () => send('Give me another example of that, with the English translation.') },
    { label: 'Más despacio', action: () => send('Más despacio por favor — use simpler Spanish and shorter sentences.') },
    { label: '¿Cómo se dice…?', action: () => { setInput('¿Cómo se dice "" en español?'); textareaRef.current?.focus(); } },
  ];

  let lastDay = '';

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
              <button onClick={() => startPlacement(false)} disabled={busy}
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
                {currentUnit
                  ? `${currentUnit.status === 'in_progress' ? 'Practice' : 'Start'} Unit ${currentUnit.position}: ${currentUnit.title.slice(0, 40)}${currentUnit.title.length > 40 ? '…' : ''}`
                  : 'New Lesson'}
              </button>
              {currentUnit?.status === 'in_progress' && (
                <button onClick={completeUnit} disabled={busy}
                  className="bg-green-400/20 text-green-200 border border-green-400/40 hover:bg-green-400/30 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                  title="Your instructor will tell you when you've earned this">
                  ✓ Complete Unit
                </button>
              )}
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
              {[...new Set(today.syllabus.units.map(u => u.block))].map(block => (
                <div key={block} className="mb-3 last:mb-0">
                  <div className="text-xs font-semibold text-gray-400 uppercase mb-1.5">Block {block}</div>
                  <ol className="space-y-1.5 text-sm">
                    {today.syllabus!.units.filter(u => u.block === block).map(u => (
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
              ))}
              <p className="text-xs text-gray-500 mt-3">When a block is finished, the next one is generated from your current mistakes and progress.</p>
            </div>
          )}

          {/* Tabs */}
          {hasProfile && !placementMode && (
            <div className="flex space-x-1 mb-4">
              {([['chat', 'Chat'], ['lessons', 'Lessons'], ['mistakes', 'My Mistakes']] as const).map(([key, label]) => (
                <button key={key} onClick={() => setTab(key)}
                  className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${
                    tab === key ? 'bg-white/15 text-white' : 'bg-white/5 text-gray-400 hover:text-gray-200'
                  }`}>
                  {label}
                </button>
              ))}
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
                Start with a short placement interview (10 minutes, part English, part Spanish).
                Your instructor will estimate your level, learn your goals and target dialect,
                and build your course from there.
              </p>
              <div className="flex items-center justify-center space-x-3">
                {savedPlacement && (
                  <button onClick={() => startPlacement(true)} className="cosmic-button px-6 py-3 rounded-lg font-medium">
                    Resume Placement Interview
                  </button>
                )}
                <button onClick={() => startPlacement(false)}
                  className={savedPlacement
                    ? 'bg-white/10 text-gray-200 hover:bg-white/20 px-6 py-3 rounded-lg font-medium transition-colors'
                    : 'cosmic-button px-6 py-3 rounded-lg font-medium'}>
                  {savedPlacement ? 'Start Over' : 'Start Placement Interview'}
                </button>
              </div>
            </GlassCard>
          ) : tab === 'lessons' && !placementMode ? (
            <GlassCard className="p-6">
              <h2 className="text-lg font-semibold text-white mb-4">Your lessons</h2>
              {lessons === null ? (
                <p className="text-gray-400">Loading…</p>
              ) : lessons.length === 0 ? (
                <p className="text-gray-400">No lessons yet — hit the unit button above to start your first one.</p>
              ) : (
                <div className="space-y-2">
                  {lessons.map(l => (
                    <div key={l.id} className="border border-white/15 rounded-lg">
                      <button onClick={() => setOpenLesson(openLesson === l.id ? null : l.id)}
                        className="w-full text-left p-3 flex items-center justify-between hover:bg-white/5 transition-colors">
                        <span className="text-white text-sm font-medium">{l.topic}</span>
                        <span className="text-xs text-gray-400">
                          {l.cefr_level && `${l.cefr_level} · `}{new Date(l.created_at).toLocaleDateString()} {openLesson === l.id ? '▾' : '▸'}
                        </span>
                      </button>
                      {openLesson === l.id && (
                        <div className="p-4 border-t border-white/10 text-sm text-gray-200 leading-relaxed break-words">
                          {renderRich(l.content)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </GlassCard>
          ) : tab === 'mistakes' && !placementMode ? (
            <GlassCard className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white">My mistakes</h2>
                {mistakes && <span className="text-sm text-gray-400">{mistakes.total} recorded</span>}
              </div>
              {mistakes === null ? (
                <p className="text-gray-400">Loading…</p>
              ) : mistakes.groups.length === 0 ? (
                <p className="text-gray-400">Nothing recorded yet. Mistakes you make in chat and lessons are collected here automatically — with explanations of the patterns behind them.</p>
              ) : (
                <div className="space-y-3">
                  {mistakes.groups.map(g => (
                    <div key={g.category} className="border border-white/15 rounded-lg">
                      <button onClick={() => setOpenCategory(openCategory === g.category ? null : g.category)}
                        className="w-full text-left p-3 flex items-center justify-between hover:bg-white/5 transition-colors">
                        <span className="text-white text-sm font-medium capitalize">{g.category}</span>
                        <span className="text-xs text-gray-400">
                          {g.count} mistake{g.count === 1 ? '' : 's'} {openCategory === g.category ? '▾' : '▸'}
                        </span>
                      </button>
                      {openCategory === g.category && (
                        <div className="p-4 border-t border-white/10 space-y-3">
                          {g.errors.slice(0, 8).map(e => (
                            <div key={e.id} className="text-sm">
                              <span className="text-red-300 line-through">{e.error}</span>
                              {e.correction && <span className="text-green-300"> → {e.correction}</span>}
                              {e.note && <span className="text-gray-400 text-xs"> ({e.note})</span>}
                            </div>
                          ))}
                          {g.explainer ? (
                            <div className="mt-3 p-3 bg-purple-400/10 border-l-4 border-purple-400 rounded-md">
                              <div className="flex justify-between items-center mb-2">
                                <span className="text-xs font-semibold text-purple-300">THE PATTERN</span>
                                <button onClick={() => explainCategory(g.category)} disabled={explaining === g.category}
                                  className="text-xs text-gray-400 hover:text-gray-200 disabled:opacity-50">
                                  {explaining === g.category ? 'Updating…' : 'Refresh'}
                                </button>
                              </div>
                              <div className="text-sm text-gray-200 leading-relaxed break-words">{renderRich(g.explainer.explanation)}</div>
                            </div>
                          ) : (
                            <button onClick={() => explainCategory(g.category)} disabled={explaining === g.category}
                              className="cosmic-button px-3 py-1.5 rounded-lg text-xs disabled:opacity-50">
                              {explaining === g.category ? 'Thinking…' : 'Explain this pattern'}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </GlassCard>
          ) : (
            <GlassCard
              ref={chatCardRef}
              className="flex flex-col overflow-hidden"
              style={chatHeight ? { height: `${chatHeight}px` } : { minHeight: '50vh' }}
            >
              <div className="flex-1 p-4 space-y-4 overflow-y-auto">
                {messages.length === 0 && !busy && (
                  <p className="text-gray-400 text-center py-8">
                    Say hola, ask a question, or hit the unit button above to continue your course.
                  </p>
                )}
                {messages.map(m => {
                  const day = m.at ? dayLabel(m.at) : '';
                  const showDay = day && day !== lastDay;
                  if (showDay) lastDay = day;
                  return (
                    <div key={m.id}>
                      {showDay && (
                        <div className="flex items-center my-4">
                          <div className="flex-1 border-t border-white/10"></div>
                          <span className="px-3 text-xs text-gray-500">{day}</span>
                          <div className="flex-1 border-t border-white/10"></div>
                        </div>
                      )}
                      <div className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[85%] min-w-0 break-words rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                          m.role === 'user'
                            ? 'bg-gradient-to-r from-purple-500/40 to-blue-500/40 text-white'
                            : m.kind === 'lesson'
                              ? 'bg-emerald-400/10 border border-emerald-400/30 text-gray-100'
                              : 'bg-white/10 text-gray-100'
                        }`}>
                          {m.kind === 'lesson' && (
                            <div className="text-emerald-300 text-xs font-semibold mb-2">📚 LESSON</div>
                          )}
                          {renderRich(m.content)}
                          {m.role === 'assistant' && (
                            <button onClick={() => speak(m.id, m.content)}
                              className="block mt-2 text-xs text-gray-400 hover:text-gray-200 transition-colors"
                              title="Hear this out loud">
                              {speakingId === m.id ? '⏹ Stop' : '🔊 Listen'}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
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

              <div className="shrink-0 p-4 border-t border-white/20">
                {!placementMode && (
                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    <button
                      onClick={toggleAutoPlay}
                      title={autoPlay
                        ? 'Spanish in replies is read aloud automatically'
                        : 'Read the Spanish in each reply aloud automatically'}
                      aria-pressed={autoPlay}
                      className={`px-3 py-1 text-xs rounded-full transition-colors ${
                        autoPlay
                          ? 'bg-purple-500/30 text-purple-100 border border-purple-400/50'
                          : 'bg-white/10 text-gray-300 hover:bg-white/20 hover:text-white'
                      }`}
                    >
                      {autoPlay ? '🔊 Auto-play on' : '🔈 Auto-play'}
                    </button>
                    {chips.map(c => (
                      <button key={c.label} onClick={c.action} disabled={busy}
                        className="px-3 py-1 text-xs rounded-full bg-white/10 text-gray-300 hover:bg-white/20 hover:text-white transition-colors disabled:opacity-50">
                        {c.label}
                      </button>
                    ))}
                  </div>
                )}
                {recording && (
                  <p className="text-xs text-purple-300 mb-2">
                    Listening… just stop talking and it&apos;ll send itself.
                  </p>
                )}
                <form onSubmit={(e) => { e.preventDefault(); send(); }} className="flex space-x-3">
                  <textarea
                    ref={textareaRef}
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
                  <button type="button" onClick={toggleRecording} disabled={busy || transcribing}
                    className={`px-4 rounded-lg border transition-colors disabled:opacity-50 ${
                      recording
                        ? 'bg-red-500/30 border-red-400/60 text-red-200 animate-pulse'
                        : 'bg-white/10 border-white/20 text-gray-300 hover:bg-white/20'
                    }`}
                    title={recording ? 'Stop recording' : 'Speak instead of typing'}>
                    {transcribing ? '…' : recording ? '⏹' : '🎤'}
                  </button>
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
