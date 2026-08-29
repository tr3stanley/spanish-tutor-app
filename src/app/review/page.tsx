'use client';

import { useState, useEffect, useCallback } from 'react';
import Navigation from '@/components/Navigation';
import StreakBar from '@/components/StreakBar';
import GlassCard from '@/components/GlassCard';
import CosmicBackground from '@/components/CosmicBackground';
import { levelInfo } from '@/lib/levels';

interface Card {
  id: number;
  word: string;
  lemma: string;
  translation: string;
  part_of_speech: string | null;
  cefr_level: string | null;
  example: string | null;
  example_translation: string | null;
  episode_title: string | null;
}

export default function ReviewPage() {
  const [queue, setQueue] = useState<Card[]>([]);
  const [counts, setCounts] = useState<{ due: number; new: number; total_vocab: number } | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [extracting, setExtracting] = useState(false);
  const [extractStatus, setExtractStatus] = useState('');
  const [reviewed, setReviewed] = useState(0);

  const loadQueue = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/review/queue');
      const data = await res.json();
      setQueue(data.queue || []);
      setCounts(data.counts || null);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadQueue(); }, [loadQueue]);

  const grade = async (g: 'again' | 'hard' | 'good' | 'easy') => {
    const card = queue[0];
    if (!card) return;
    setRevealed(false);
    // 'again' re-queues the card at the back; otherwise it leaves the session
    setQueue(prev => (g === 'again' ? [...prev.slice(1), card] : prev.slice(1)));
    if (g !== 'again') setReviewed(r => r + 1);
    try {
      await fetch('/api/review/grade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lemma: card.lemma, grade: g }),
      });
    } catch (e) {
      console.error(e);
    }
  };

  const importVocab = async () => {
    setExtracting(true);
    setExtractStatus('Extracting vocabulary from listened episodes…');
    try {
      let total = 0;
      for (let i = 0; i < 30; i++) {
        const res = await fetch('/api/review/extract', { method: 'POST' });
        const data = await res.json();
        if (data.error) { setExtractStatus(data.error); break; }
        total += data.extracted || 0;
        setExtractStatus(`Imported ${total} words so far… (${data.remaining} episodes left)`);
        if (!data.remaining) break;
      }
      setExtractStatus(total > 0 ? `Imported ${total} new words.` : 'Nothing new to import — listen to some episodes first!');
      await loadQueue();
    } catch (e) {
      console.error(e);
      setExtractStatus('Import failed. Try again.');
    } finally {
      setExtracting(false);
    }
  };

  const card = queue[0];

  return (
    <div className="min-h-screen cosmic-container">
      <CosmicBackground />
      <div className="relative z-10">
        <Navigation />
        <main className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <StreakBar />
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
              Vocab Review
            </h1>
            {counts && (
              <div className="text-sm text-gray-300">
                {counts.due} due • {counts.new} new • {counts.total_vocab} total
              </div>
            )}
          </div>

          {loading ? (
            <div className="text-center py-16">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-400 mx-auto"></div>
            </div>
          ) : card ? (
            <GlassCard className="p-8">
              <div className="text-center">
                <div className="flex justify-center items-center space-x-2 mb-6 text-xs text-gray-400">
                  {card.part_of_speech && <span className="bg-white/10 px-2 py-1 rounded">{card.part_of_speech}</span>}
                  {card.cefr_level && (
                    <span className="bg-white/10 px-2 py-1 rounded cursor-help" title={levelInfo(card.cefr_level)?.speaking || ''}>
                      {card.cefr_level}{levelInfo(card.cefr_level) ? ` · ${levelInfo(card.cefr_level)!.label}` : ''}
                    </span>
                  )}
                </div>
                <div className="text-4xl font-bold text-white mb-6">{card.word}</div>

                {revealed ? (
                  <div className="space-y-4">
                    <div className="text-2xl text-purple-300">{card.translation}</div>
                    {card.example && (
                      <div className="text-gray-300 text-sm max-w-md mx-auto">
                        <p className="italic">&ldquo;{card.example}&rdquo;</p>
                        {card.example_translation && (
                          <p className="text-gray-400 mt-1">{card.example_translation}</p>
                        )}
                      </div>
                    )}
                    {card.episode_title && (
                      <p className="text-xs text-gray-500">from: {card.episode_title}</p>
                    )}
                    <div className="grid grid-cols-4 gap-3 pt-4">
                      <button onClick={() => grade('again')} className="py-3 rounded-lg bg-red-400/20 text-red-300 border border-red-400/30 hover:bg-red-400/30 transition-colors">Again</button>
                      <button onClick={() => grade('hard')} className="py-3 rounded-lg bg-orange-400/20 text-orange-300 border border-orange-400/30 hover:bg-orange-400/30 transition-colors">Hard</button>
                      <button onClick={() => grade('good')} className="py-3 rounded-lg bg-green-400/20 text-green-300 border border-green-400/30 hover:bg-green-400/30 transition-colors">Good</button>
                      <button onClick={() => grade('easy')} className="py-3 rounded-lg bg-blue-400/20 text-blue-300 border border-blue-400/30 hover:bg-blue-400/30 transition-colors">Easy</button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setRevealed(true)} className="cosmic-button px-8 py-3 rounded-lg font-medium">
                    Show Answer
                  </button>
                )}
              </div>
            </GlassCard>
          ) : (
            <GlassCard className="p-8 text-center">
              <h2 className="text-xl font-semibold text-white mb-3">
                {reviewed > 0 ? `Session done — ${reviewed} words reviewed 🎉` : 'No cards to review'}
              </h2>
              <p className="text-gray-300 mb-6">
                {counts?.total_vocab
                  ? 'Nothing due right now. Come back later, or import words from more episodes.'
                  : 'Your review queue is built from episodes you’ve marked as listened. Import words to get started.'}
              </p>
              <button onClick={importVocab} disabled={extracting}
                className="cosmic-button px-6 py-3 rounded-lg font-medium disabled:opacity-50">
                {extracting ? 'Importing…' : 'Import Words from Listened Episodes'}
              </button>
              {extractStatus && <p className="text-sm text-gray-400 mt-4">{extractStatus}</p>}
            </GlassCard>
          )}

          {card && (
            <p className="text-center text-sm text-gray-400 mt-4">{queue.length} cards left in this session</p>
          )}
        </main>
      </div>
    </div>
  );
}
