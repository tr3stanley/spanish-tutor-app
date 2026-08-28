'use client';

import { useState, useEffect, useCallback } from 'react';
import Navigation from '@/components/Navigation';
import GlassCard from '@/components/GlassCard';
import CosmicBackground from '@/components/CosmicBackground';
import { levelInfo } from '@/lib/levels';

interface SongSummary {
  id: number;
  title: string;
  artist: string;
  media_url: string | null;
  region: string | null;
  cefr_level: string | null;
  has_sheet: boolean;
  created_at: string;
}

interface StudyLine {
  es: string;
  en: string;
  note?: string;
}

interface StudySheet {
  about: string;
  region?: string;
  cefr_level?: string;
  lines: StudyLine[];
  slang?: { term: string; region: string; meaning: string }[];
  culture?: string[];
}

interface SongDetail {
  id: number;
  title: string;
  artist: string;
  media_url: string | null;
  lyrics: string | null;
  study_sheet: StudySheet | null;
  region: string | null;
  cefr_level: string | null;
}

// YouTube or Spotify link -> embeddable player URL (playback stays on the licensed service).
function embedUrl(mediaUrl: string | null): { src: string; kind: 'youtube' | 'spotify' } | null {
  if (!mediaUrl) return null;
  try {
    const url = new URL(mediaUrl);
    const host = url.hostname.replace(/^www\./, '');
    if (host === 'youtu.be') {
      return { src: `https://www.youtube.com/embed/${url.pathname.slice(1).split('/')[0]}`, kind: 'youtube' };
    }
    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
      const v = url.searchParams.get('v');
      if (v) return { src: `https://www.youtube.com/embed/${v}`, kind: 'youtube' };
      const shorts = url.pathname.match(/^\/shorts\/([\w-]+)/);
      if (shorts) return { src: `https://www.youtube.com/embed/${shorts[1]}`, kind: 'youtube' };
    }
    if (host === 'open.spotify.com') {
      const m = url.pathname.match(/\/(?:intl-[a-z]+\/)?(track|album|playlist)\/(\w+)/);
      if (m) return { src: `https://open.spotify.com/embed/${m[1]}/${m[2]}`, kind: 'spotify' };
    }
  } catch {
    return null;
  }
  return null;
}

export default function MusicPage() {
  const [songs, setSongs] = useState<SongSummary[] | null>(null);
  const [selected, setSelected] = useState<SongDetail | null>(null);
  const [vocabCount, setVocabCount] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', artist: '', media_url: '', lyrics: '' });
  const [busy, setBusy] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [addingVocab, setAddingVocab] = useState(false);
  const [vocabMessage, setVocabMessage] = useState<string | null>(null);
  const [showTranslations, setShowTranslations] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSongs = useCallback(async () => {
    try {
      const res = await fetch('/api/songs');
      setSongs((await res.json()).songs || []);
    } catch (e) {
      console.error(e);
      setSongs([]);
    }
  }, []);

  useEffect(() => { loadSongs(); }, [loadSongs]);

  const openSong = async (id: number) => {
    setError(null);
    setVocabMessage(null);
    setShowTranslations(false);
    try {
      const res = await fetch(`/api/songs/${id}`);
      const data = await res.json();
      if (data.song) {
        setSelected(data.song);
        setVocabCount(data.vocab_count || 0);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const addSong = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/songs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setShowForm(false);
        setForm({ title: '', artist: '', media_url: '', lyrics: '' });
        await loadSongs();
        await openSong(data.song.id);
      }
    } catch (err) {
      console.error(err);
      setError('Failed to add song');
    } finally {
      setBusy(false);
    }
  };

  const generateSheet = async () => {
    if (!selected || generating) return;
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch(`/api/songs/${selected.id}/study`, { method: 'POST' });
      const data = await res.json();
      if (data.study_sheet) {
        setSelected(prev => prev ? { ...prev, study_sheet: data.study_sheet, region: data.region, cefr_level: data.cefr_level } : prev);
        loadSongs();
      } else if (data.error) {
        setError(data.error);
      }
    } catch (e) {
      console.error(e);
      setError('Study sheet generation failed — try again');
    } finally {
      setGenerating(false);
    }
  };

  const addVocab = async () => {
    if (!selected || addingVocab) return;
    setAddingVocab(true);
    setVocabMessage(null);
    try {
      const res = await fetch(`/api/songs/${selected.id}/vocab`, { method: 'POST' });
      const data = await res.json();
      if (data.error) setVocabMessage(data.error);
      else if (data.message) setVocabMessage(data.message);
      else {
        setVocabMessage(`Added ${data.added} words to your review queue.`);
        setVocabCount(data.added);
      }
    } catch (e) {
      console.error(e);
      setVocabMessage('Failed to extract vocabulary');
    } finally {
      setAddingVocab(false);
    }
  };

  const deleteSong = async () => {
    if (!selected) return;
    if (!confirm(`Delete "${selected.title}" and its vocabulary?`)) return;
    try {
      await fetch(`/api/songs/${selected.id}`, { method: 'DELETE' });
      setSelected(null);
      await loadSongs();
    } catch (e) {
      console.error(e);
    }
  };

  const embed = selected ? embedUrl(selected.media_url) : null;
  const sheet = selected?.study_sheet || null;

  return (
    <div className="min-h-screen cosmic-container">
      <CosmicBackground />
      <div className="relative z-10">
        <Navigation />
        <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
                Music
              </h1>
              <p className="text-sm text-gray-300 mt-1">Learn from real songs — slang, culture, and what the lyrics actually say</p>
            </div>
            {!selected && (
              <button onClick={() => { setShowForm(s => !s); setError(null); }}
                className="cosmic-button px-4 py-2 rounded-lg font-medium">
                {showForm ? 'Cancel' : '+ Add Song'}
              </button>
            )}
          </div>

          {selected ? (
            <div className="space-y-4">
              <button onClick={() => { setSelected(null); setError(null); }}
                className="text-gray-400 hover:text-gray-200 text-sm">← All songs</button>

              <GlassCard className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h2 className="text-xl font-semibold text-white">{selected.title}</h2>
                    <p className="text-gray-300">{selected.artist}</p>
                    <div className="flex items-center gap-2 mt-2">
                      {selected.cefr_level && levelInfo(selected.cefr_level) && (
                        <span className={`text-xs px-2 py-0.5 rounded-full ${levelInfo(selected.cefr_level)!.badgeClass}`}
                          title={levelInfo(selected.cefr_level)!.listening}>
                          {selected.cefr_level} · {levelInfo(selected.cefr_level)!.label}
                        </span>
                      )}
                      {selected.region && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-white/10 text-gray-300">
                          {selected.region} Spanish
                        </span>
                      )}
                    </div>
                  </div>
                  <button onClick={deleteSong} className="text-gray-500 hover:text-red-300 text-sm" title="Delete song">
                    Delete
                  </button>
                </div>

                {embed && (
                  <div className="mb-4">
                    {embed.kind === 'youtube' ? (
                      <div className="aspect-video rounded-lg overflow-hidden">
                        <iframe src={embed.src} className="w-full h-full" allow="autoplay; encrypted-media" allowFullScreen title="Song player" />
                      </div>
                    ) : (
                      <iframe src={embed.src} className="w-full rounded-lg" height="152" allow="autoplay; encrypted-media" title="Song player" />
                    )}
                  </div>
                )}

                {error && <p className="text-red-300 text-sm mb-3">{error}</p>}

                {!sheet ? (
                  <button onClick={generateSheet} disabled={generating}
                    className="cosmic-button px-4 py-2 rounded-lg font-medium disabled:opacity-50">
                    {generating ? 'Studying the lyrics… (~30s)' : 'Generate Study Sheet'}
                  </button>
                ) : (
                  <div className="space-y-5">
                    <div className="p-3 bg-purple-400/10 border-l-4 border-purple-400 rounded-md">
                      <div className="text-xs font-semibold text-purple-300 mb-1">WHAT THE SONG IS SAYING</div>
                      <p className="text-sm text-gray-200 leading-relaxed">{sheet.about}</p>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-gray-400 uppercase">Lyrics, line by line</span>
                        <button onClick={() => setShowTranslations(s => !s)}
                          className="text-xs px-3 py-1 rounded-full bg-white/10 text-gray-300 hover:bg-white/20 transition-colors">
                          {showTranslations ? 'Hide translations' : 'Show translations'}
                        </button>
                      </div>
                      <div className="space-y-1.5 text-sm">
                        {sheet.lines.map((l, i) => (
                          <div key={i} className="group">
                            <span className="text-gray-100">{l.es}</span>
                            {showTranslations && (
                              <span className="text-blue-200/80 block pl-4">{l.en}</span>
                            )}
                            {showTranslations && l.note && (
                              <span className="text-purple-300/80 text-xs block pl-4">💡 {l.note}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {(sheet.slang?.length ?? 0) > 0 && (
                      <div>
                        <div className="text-xs font-semibold text-gray-400 uppercase mb-2">Slang & regionalisms</div>
                        <div className="space-y-1.5 text-sm">
                          {sheet.slang!.map((s, i) => (
                            <div key={i}>
                              <span className="text-yellow-200 font-medium">{s.term}</span>
                              <span className="text-gray-400 text-xs"> ({s.region})</span>
                              <span className="text-gray-200"> — {s.meaning}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {(sheet.culture?.length ?? 0) > 0 && (
                      <div>
                        <div className="text-xs font-semibold text-gray-400 uppercase mb-2">Cultural notes</div>
                        <ul className="space-y-1.5 text-sm text-gray-200 list-disc pl-5">
                          {sheet.culture!.map((c, i) => <li key={i}>{c}</li>)}
                        </ul>
                      </div>
                    )}

                    <div className="flex items-center gap-3 pt-2 border-t border-white/10">
                      {vocabCount > 0 ? (
                        <span className="text-sm text-green-300">✓ {vocabCount} words in your review queue</span>
                      ) : (
                        <button onClick={addVocab} disabled={addingVocab}
                          className="cosmic-button px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
                          {addingVocab ? 'Extracting…' : 'Add Vocab to Review'}
                        </button>
                      )}
                      <button onClick={generateSheet} disabled={generating}
                        className="text-xs text-gray-400 hover:text-gray-200 disabled:opacity-50">
                        {generating ? 'Regenerating…' : 'Regenerate sheet'}
                      </button>
                    </div>
                    {vocabMessage && <p className="text-sm text-gray-300">{vocabMessage}</p>}
                  </div>
                )}
              </GlassCard>
            </div>
          ) : showForm ? (
            <GlassCard className="p-6">
              <h2 className="text-lg font-semibold text-white mb-4">Add a song</h2>
              <form onSubmit={addSong} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                    placeholder="Song title" required
                    className="bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:ring-2 focus:ring-purple-400 focus:outline-none" />
                  <input value={form.artist} onChange={e => setForm(f => ({ ...f, artist: e.target.value }))}
                    placeholder="Artist" required
                    className="bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:ring-2 focus:ring-purple-400 focus:outline-none" />
                </div>
                <input value={form.media_url} onChange={e => setForm(f => ({ ...f, media_url: e.target.value }))}
                  placeholder="YouTube or Spotify link (for playback)"
                  className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:ring-2 focus:ring-purple-400 focus:outline-none" />
                <textarea value={form.lyrics} onChange={e => setForm(f => ({ ...f, lyrics: e.target.value }))}
                  placeholder="Paste the lyrics here (for your personal study sheet)" rows={8} required
                  className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:ring-2 focus:ring-purple-400 focus:outline-none" />
                {error && <p className="text-red-300 text-sm">{error}</p>}
                <button type="submit" disabled={busy}
                  className="cosmic-button px-6 py-2 rounded-lg font-medium disabled:opacity-50">
                  {busy ? 'Adding…' : 'Add Song'}
                </button>
              </form>
            </GlassCard>
          ) : songs === null ? (
            <div className="text-center py-16">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-400 mx-auto"></div>
            </div>
          ) : songs.length === 0 ? (
            <GlassCard className="p-8 text-center">
              <h2 className="text-xl font-semibold text-white mb-3">🎵 No songs yet</h2>
              <p className="text-gray-300 mb-6 max-w-lg mx-auto">
                Add a Spanish song you like — paste the lyrics and a YouTube or Spotify link.
                You&apos;ll get a study sheet explaining what it&apos;s actually saying, the slang and where
                it&apos;s from, and the cultural references. Vocab feeds your review deck.
              </p>
              <button onClick={() => setShowForm(true)} className="cosmic-button px-6 py-3 rounded-lg font-medium">
                Add Your First Song
              </button>
            </GlassCard>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {songs.map(s => (
                <button key={s.id} onClick={() => openSong(s.id)}
                  className="glass-card rounded-lg p-4 text-left hover:bg-white/10 transition-colors">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-white font-medium">{s.title}</div>
                      <div className="text-sm text-gray-300">{s.artist}</div>
                    </div>
                    <span className="text-lg">🎵</span>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    {s.cefr_level && levelInfo(s.cefr_level) && (
                      <span className={`text-xs px-2 py-0.5 rounded-full ${levelInfo(s.cefr_level)!.badgeClass}`}>
                        {s.cefr_level}
                      </span>
                    )}
                    {s.region && <span className="text-xs text-gray-400">{s.region}</span>}
                    {!s.has_sheet && <span className="text-xs text-gray-500 italic">no study sheet yet</span>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
