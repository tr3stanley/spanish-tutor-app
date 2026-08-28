import { createClient, SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

// Server-side only. The key stays in env; the browser never talks to Supabase directly.
export function getSupabase(): SupabaseClient {
  if (client) return client;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_KEY must be set');
  }

  client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}

export interface Folder {
  id: number;
  name: string;
  created_at: string;
}

export interface Episode {
  id: number;
  title: string;
  filename: string;
  file_path: string;
  language: 'spanish' | 'russian';
  duration?: number;
  youtube_video_id?: string;
  folder_id?: number | null;
  listened: boolean;
  lesson_generated: boolean;
  cefr_level?: string | null;
  topic?: string | null;
  dialect?: string | null;
  freq_coverage?: number | null;
  classified_at?: string | null;
  created_at: string;
  processed_at?: string | null;
}

export interface TranscriptSegment {
  id: number;
  episode_id: number;
  text: string;
  start_time: number;
  end_time: number;
  confidence?: number | null;
}

export interface Lesson {
  id: number;
  episode_id: number;
  summary?: string | null;
  grammar_rules?: string | null;
  vocabulary?: string | null;
  created_at: string;
}
