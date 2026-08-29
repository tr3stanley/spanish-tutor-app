'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

interface Progress {
  streak: number;
  active_today: boolean;
  week: { lessons?: number; reviews?: number; listen_seconds?: number };
  goal: { lessons: number; reviews: number };
  words: { known: number; learning: number };
}

// Streak, weekly goal and vocabulary mastery — the "am I actually getting
// somewhere" strip. Shown on the library and review pages.
export default function StreakBar() {
  const [data, setData] = useState<Progress | null>(null);
  const [editing, setEditing] = useState(false);
  const [goalLessons, setGoalLessons] = useState(3);
  const [goalReviews, setGoalReviews] = useState(3);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/progress');
      if (!res.ok) return;
      const d = await res.json();
      setData(d);
      setGoalLessons(d.goal?.lessons ?? 3);
      setGoalReviews(d.goal?.reviews ?? 3);
    } catch (e) {
      console.error('Failed to load progress:', e);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const saveGoal = async () => {
    setEditing(false);
    await fetch('/api/progress', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lessons: goalLessons, reviews: goalReviews }),
    });
    load();
  };

  if (!data) return null;

  const lessons = data.week.lessons ?? 0;
  const reviews = data.week.reviews ?? 0;
  const minutes = Math.round((data.week.listen_seconds ?? 0) / 60);
  const goalTotal = (data.goal?.lessons ?? 0) + (data.goal?.reviews ?? 0);
  const doneTotal = Math.min(lessons, data.goal?.lessons ?? 0) + Math.min(reviews, data.goal?.reviews ?? 0);
  const pct = goalTotal > 0 ? Math.round((doneTotal / goalTotal) * 100) : 0;

  return (
    <div className="glass-card rounded-lg p-3 mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
      <div
        className={`flex items-center gap-1.5 ${data.active_today ? 'text-orange-300' : 'text-gray-400'}`}
        title={data.active_today ? 'Practiced today' : 'Nothing logged today yet'}
      >
        <span className="text-lg leading-none">{data.streak > 0 ? '🔥' : '·'}</span>
        <span className="font-semibold">{data.streak}</span>
        <span className="text-gray-400">day{data.streak === 1 ? '' : 's'}</span>
      </div>

      <div className="flex items-center gap-2 min-w-[150px] flex-1 max-w-xs">
        <div className="flex-1 h-2 rounded-full bg-white/10 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${pct >= 100 ? 'bg-green-400' : 'bg-gradient-to-r from-purple-400 to-blue-400'}`}
            style={{ width: `${Math.min(100, pct)}%` }}
          />
        </div>
        <span className="text-xs text-gray-400 whitespace-nowrap">
          {pct >= 100 ? 'goal met 🎉' : `${pct}% of week`}
        </span>
      </div>

      <span className="text-gray-400 text-xs">
        {lessons} lesson{lessons === 1 ? '' : 's'} · {reviews} review{reviews === 1 ? '' : 's'} · {minutes} min
      </span>

      <span className="text-gray-400 text-xs" title="Words you've fully learned / still learning">
        <span className="text-green-300 font-medium">{data.words.known}</span> known
        {data.words.learning > 0 && <span className="text-gray-500"> · {data.words.learning} learning</span>}
      </span>

      <div className="ml-auto flex items-center gap-3">
        <Link href="/leaderboard" className="text-gray-400 hover:text-gray-200 text-xs">
          🏆 Leaderboard
        </Link>
        <button onClick={() => setEditing(e => !e)} className="text-gray-400 hover:text-gray-200 text-xs">
          {editing ? 'Cancel' : 'Set goal'}
        </button>
      </div>

      {editing && (
        <div className="w-full flex flex-wrap items-center gap-3 pt-2 border-t border-white/10">
          <label className="flex items-center gap-2 text-xs text-gray-300">
            Lessons / week
            <input type="number" min={0} max={30} value={goalLessons}
              onChange={e => setGoalLessons(parseInt(e.target.value) || 0)}
              className="w-16 bg-white/10 border border-white/20 rounded px-2 py-1 text-white" />
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-300">
            Reviews / week
            <input type="number" min={0} max={30} value={goalReviews}
              onChange={e => setGoalReviews(parseInt(e.target.value) || 0)}
              className="w-16 bg-white/10 border border-white/20 rounded px-2 py-1 text-white" />
          </label>
          <button onClick={saveGoal} className="cosmic-button px-3 py-1 rounded-lg text-xs">Save</button>
        </div>
      )}
    </div>
  );
}
