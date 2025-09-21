import sqlite3 from 'sqlite3';
import { Database, open } from 'sqlite';
import path from 'path';

let db: Database | null = null;

export async function getDatabase(): Promise<Database> {
  if (db) return db;

  db = await open({
    filename: path.join(process.cwd(), 'data', 'podcasts.db'),
    driver: sqlite3.Database
  });

  // Initialize tables
  await db.exec(`
    CREATE TABLE IF NOT EXISTS folders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS podcasts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      filename TEXT NOT NULL,
      file_path TEXT NOT NULL,
      language TEXT NOT NULL,
      duration REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      processed_at DATETIME,
      youtube_video_id TEXT,
      transcript_path TEXT,
      lesson_generated BOOLEAN DEFAULT FALSE,
      folder_id INTEGER,
      listened BOOLEAN DEFAULT FALSE,
      FOREIGN KEY (folder_id) REFERENCES folders (id)
    );

    CREATE TABLE IF NOT EXISTS transcripts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      podcast_id INTEGER NOT NULL,
      text TEXT NOT NULL,
      start_time REAL NOT NULL,
      end_time REAL NOT NULL,
      confidence REAL,
      FOREIGN KEY (podcast_id) REFERENCES podcasts (id)
    );

    CREATE TABLE IF NOT EXISTS lessons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      podcast_id INTEGER NOT NULL,
      summary TEXT,
      grammar_rules TEXT,
      vocabulary TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (podcast_id) REFERENCES podcasts (id)
    );

    CREATE TABLE IF NOT EXISTS explanations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      podcast_id INTEGER NOT NULL,
      start_time REAL NOT NULL,
      end_time REAL NOT NULL,
      explanation TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (podcast_id) REFERENCES podcasts (id)
    );
  `);

  return db;
}

export interface Folder {
  id?: number;
  name: string;
  created_at?: string;
}

export interface Podcast {
  id?: number;
  title: string;
  filename: string;
  file_path: string;
  language: 'spanish' | 'russian';
  duration?: number;
  created_at?: string;
  processed_at?: string;
  youtube_video_id?: string;
  transcript_path?: string;
  lesson_generated?: boolean;
  folder_id?: number;
  listened?: boolean;
}

export interface Transcript {
  id?: number;
  podcast_id: number;
  text: string;
  start_time: number;
  end_time: number;
  confidence?: number;
}

export interface Lesson {
  id?: number;
  podcast_id: number;
  summary?: string;
  grammar_rules?: string;
  vocabulary?: string;
  created_at?: string;
}

export interface Explanation {
  id?: number;
  podcast_id: number;
  start_time: number;
  end_time: number;
  explanation: string;
  created_at?: string;
}