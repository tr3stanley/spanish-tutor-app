// Single source of truth for how CEFR levels are shown to users.
// Codes stay (they're the standard people can look up); every display
// pairs them with plain language.

export interface LevelInfo {
  code: string;
  label: string;
  // what listening to an episode at this level feels like (library side)
  listening: string;
  // what you can do at this level (tutor/review side)
  speaking: string;
  badgeClass: string;
}

export const CEFR_LEVELS: LevelInfo[] = [
  {
    code: 'A1',
    label: 'New Beginner',
    listening: 'Very slow, simple Spanish — short sentences and everyday words.',
    speaking: 'You can introduce yourself and handle a few memorized phrases.',
    badgeClass: 'bg-green-400/20 text-green-300 border-green-400/30',
  },
  {
    code: 'A2',
    label: 'Beginner',
    listening: 'Slow, clear Spanish about daily life — you\'ll catch most of the story.',
    speaking: 'You can talk about your day, your family, and simple needs.',
    badgeClass: 'bg-emerald-400/20 text-emerald-300 border-emerald-400/30',
  },
  {
    code: 'B1',
    label: 'Intermediate',
    listening: 'Clear everyday Spanish at a moderate pace — some new vocab, but you\'ll follow the main points.',
    speaking: 'You can hold everyday conversations and tell stories in past tense.',
    badgeClass: 'bg-yellow-400/20 text-yellow-300 border-yellow-400/30',
  },
  {
    code: 'B2',
    label: 'Upper Intermediate',
    listening: 'Natural-speed conversation between native speakers — slang and regional expressions appear.',
    speaking: 'You can give opinions, argue a point, and handle most situations comfortably.',
    badgeClass: 'bg-orange-400/20 text-orange-300 border-orange-400/30',
  },
  {
    code: 'C1',
    label: 'Advanced',
    listening: 'Fast native speech on complex topics — humor, idioms, and abstract discussion.',
    speaking: 'You speak fluidly on almost anything, with nuance and few errors.',
    badgeClass: 'bg-red-400/20 text-red-300 border-red-400/30',
  },
  {
    code: 'C2',
    label: 'Near-Native',
    listening: 'Anything a native speaker could follow — dense, fast, culturally loaded.',
    speaking: 'You express yourself with near-native precision in any context.',
    badgeClass: 'bg-purple-400/20 text-purple-300 border-purple-400/30',
  },
];

const BY_CODE = new Map(CEFR_LEVELS.map(l => [l.code, l]));

export function levelInfo(code: string | null | undefined): LevelInfo | null {
  return code ? BY_CODE.get(code) ?? null : null;
}

export function levelLabel(code: string | null | undefined): string {
  const info = levelInfo(code);
  return info ? `${info.code} · ${info.label}` : code || '';
}
