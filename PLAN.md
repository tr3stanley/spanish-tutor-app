# Spanish Tutor App — Improvement Plan

_Last updated: 2026-08-28. Reference doc for the rebuild. Local-first, budget-minimized. Going multi-user soon (invite-only: Thomas + brother, sister, friend — all free). May be marketed later — swap points noted at the bottom._

## Decisions made

- **Text instructor first, not realtime voice.** Lesson quality > voice polish. Realtime conversation is a deferred add-on.
- **Voice I/O still included cheaply:** speech-to-text so Thomas can talk instead of type; text-to-speech so tutor replies can be heard in the target dialect (covers "what should it sound like" without pronunciation grading).
- **Database moves to a personal free-tier Supabase project** — NOT the "Iconic Web / Match Kicks" org (that's the paid client org; a project there costs $10/mo). Postbridge lives on the personal account and may be replaced/deleted — Thomas decides, confirm nothing uses it first.
- **Ingestion stays local:** the Mac does downloads and whisper-cpp transcription for free; the cloud only stores results.
- **Target dialects matter:** Costa Rican vs Mexican etc. should shape tutor language (voseo/ustedeo, vocabulary) and playback voice.
- **Multi-user (decided 2026-08-28):** real accounts via Supabase Auth with an email allowlist — private, invite-only, free for family. Content stays shared within the group for now; every content row gets `owner_id` from day one so a marketed version can flip copyrighted items to owner-only without a rebuild.
- **Music as a learning tool (decided 2026-08-28):** embed playback (Spotify/YouTube — legal, free), LLM lyric breakdowns for slang/culture. Complements, doesn't replace, conversation practice (lyrics are poetic register).
- **Audiobooks over ebooks (decided 2026-08-28):** LibriVox (public domain, re-hostable) for classics; LLM graded stories + TTS for leveled audiobooks with perfect text sync — also fixes the A2/B2 content gap.

## Current state (audited 2026-08-27)

- Next.js 15 / React 19 / Tailwind 4 on Vercel. 3 pages: library, podcast player (transcript + lesson + text chat), uploads.
- 740 episodes, 171k transcript rows, in **SQLite committed to git** — deployed site can't persist writes; everything funnels through the Mac.
- STT = local `whisper-cpp` CLI (`src/lib/whisper.ts`) — doesn't work on Vercel.
- LLM = OpenRouter `deepseek/deepseek-chat` via `src/lib/ai.ts`. **Known bug:** lesson prompt demands both "PLAIN TEXT ONLY" and "must be valid JSON" — cause of the fix-lesson/reprocess-failed cleanup endpoints.
- No level/difficulty tagging; 725/740 episodes unfoldered. Lessons/vocab stored as unparsed text blobs (no per-word data, no SRS possible).
- No auth, no users table, no voice features, no TTS/mic anywhere.
- Repo junk: `test.wav`, empty `database.sqlite`, empty `transcripts/`/`lessons/` dirs, `temp-downloads/`, bogus npm deps (`fs`, `path`, `child_process`).

## Phases

### Phase 1 — Organize & level-tag the library (~$2 one-time)
- LLM-classify all 740 transcripts: CEFR level (A1–C2), topic, dialect where identifiable. Cache results.
- Sanity-check levels with word-frequency coverage (% of tokens in top-2k Spanish lemmas, SUBTLEX-ESP list).
- Auto-organize the 725 loose episodes into folders (by show/level); add level + dialect filters to the library UI.
- Fix the contradictory lesson prompt in `src/lib/ai.ts`; delete repo junk and bogus deps.
- No architecture changes; runs locally against SQLite.

### Phase 2 — Migrate to Supabase ($0)
- New project on the **personal free** Supabase account.
- Schema: `episodes`, `transcript_segments`, `lessons` (structured fields, not blobs), `vocabulary_items` (word, lemma, level, source episode), `user_progress` / `known_words`, `folders`, `tags`.
- Migrate SQLite data; point the app at Supabase; remove the SQLite-in-git hack and the fragile Vercel native-module buildCommand.
- Audio files stay on Archive.org / local disk (free). Free tier: 500MB DB — transcripts fit; keep audio out of Supabase Storage.

### Phase 3 — Text instructor (~$1–3/month)
The core product. Cheap model (DeepSeek via OpenRouter) for volume work; better model optional for lesson planning.
- **Placement:** an interview/quiz that estimates CEFR level and records strengths/gaps.
- **Lessons:** generated around level + target dialect + goals; grammar drills with corrections and explanations.
- **Vocabulary:** review queue drawn from episodes actually listened to (now possible with structured vocab tables); simple spaced repetition.
- **Memory:** progress stored in Supabase so lessons build on each other; tutor sees listening history.

### Phase 4 — Voice input/output (~$0–2/month)
- **Mic button** on the tutor chat: record → Whisper transcription (Groq $0.04/hr — near-free, likely covered by Groq's free tier; OpenAI $0.006/min as fallback) → sends as text.
- **Play button** on tutor replies: Azure neural TTS — free tier 500k chars/month, includes real **es-CR** and **es-MX** voices, chosen from the user's target dialect. Hear correct pronunciation for $0.
- Caveat: turn-based (walkie-talkie feel), and nothing scores the student's own pronunciation — but the mic plumbing is exactly what the deferred Azure pronunciation grader plugs into.

### Phase 5 — Music (~$0)
- New "Music" section: add a song by name/artist or Spotify/YouTube link. **Playback via embeds only** (legal, free — audio plays through the licensed service; never host audio or serve full lyrics publicly).
- Lyrics as text (pasted in, or fetched for personal use — Whisper is unreliable over music) → LLM study sheet: what the song is actually saying, line-by-line translation toggle, **slang glossary with region tags** ("chamba — Mexican, work"), cultural notes.
- Song vocab feeds the existing SRS review queue like episodes do. Dialect tie-in: corridos/banda (es-MX), reggaeton (Caribbean), rock nacional (rioplatense).
- One LLM call per song (~$0.01); reuses reader + vocab infrastructure.

### Phase 6 — Multi-user (family, $0 infra)
- **Supabase Auth** (free to 50k MAU) with an **email allowlist** table — only approved addresses can sign up. Private, non-commercial, invite-only.
- Per-user everything personal: placement, course/syllabus, tutor memory, mistakes, SRS, listened-flags. Schema already has `user_id` everywhere — the work is real auth ids through the tutor/review routes + auth-scoped RLS replacing allow-all.
- Content (episodes/transcripts/lessons) shared within the group for now; add `owner_id` to content tables immediately for the marketed-later flip.
- Cost impact: LLM spend scales with active users (~$1–3/mo each). Supabase free tier still fine.

### Phase 7 — Automated podcast pipeline + cloud transcription ($0–2/mo)
- Curated feed list by level to **fix the library's gaps** (current: A2 89, B1 634, B2 13, C1 3): Dreaming Spanish (A1–A2), Duolingo Podcast (B1, free transcripts), Cuéntame / Simple Stories (A2–B1), Español con Juan (B1–B2), Hoy Hablamos (B1–C1), No Hay Tos (B2+, Mexican), Radio Ambulante (C1+). Skip paywalled News in Slow Spanish.
- Discovery via free **Podcast Index API**; prefer feeds exposing `podcast:transcript`.
- Local script (successor to `download-rss-podcast.py`): fetch new episodes → publisher transcript if free, else Whisper → level-tag → sync to Supabase.
- **Groq Whisper fallback in `processing.ts`** (whisper-large-v3-turbo, $0.04/hr): uploads work away from the Mac and for other users; more accurate than the local base model.
- Optional one-time upgrade: re-transcribe the whole 740-episode library with Groq large-v3-turbo (~300 audio hours ≈ **$12**) for better transcript quality.

### Phase 8 — Audiobooks ($0)
- **LibriVox** (public domain — audio is legally re-hostable) Spanish catalog + matching Gutenberg text: run audio through the existing whisper pipeline for timestamped transcripts; drops straight into the podcast player (transcript, click-to-translate, lessons, vocab). Skews C1+/classics.
- **Graded audiobooks — the interesting half:** LLM-generated/simplified stories at a chosen level + dialect (planned already; real graded readers aren't free) + TTS narration. Since we generate audio from text we own, sentence-level sync comes free — no transcription. Fills A1–B1 levels precisely.
- TTS: Azure free tier (500k chars/mo ≈ one novel, es-CR/es-MX voices — same infra as Phase 4); if volume outgrows it, local **Kokoro** on the Mac ($0 at any volume, Spanish voices, fits ingestion-stays-local).
- EPUB import (JSZip + epub.js) stays as a stretch item if text-only reading is ever wanted.

_(Dialect packs are no longer a phase — the tutor side shipped in Phase 3; the TTS voice choice lands in Phase 4 and content filtering by dialect already exists in the library.)_

## Deferred add-ons

- **Realtime voice conversation:** OpenAI gpt-realtime-mini over WebRTC (browser connects direct; Next.js route mints ephemeral token — works on Vercel, no extra server). ~$0.02–0.05/min ≈ $10–20/mo at 15 min/day. Fork reference: `cameronking4/openai-realtime-api-nextjs` (MIT). Gemini Live is the cheaper fallback.
- **Pronunciation grading:** Azure Speech Pronunciation Assessment — phoneme-level scores, es-ES + es-MX (no es-CR; use es-MX as proxy), free tier covers solo use. Feed weak phonemes to the LLM for drills.
- Other reference repos: `baturyilmaz/wordpecker-app` (product analog), `pipecat-ai/pipecat` / `livekit/agents` (only if outgrowing direct-to-provider), `shakedzy/companion` (tutor prompt design).

## Cost summary

**Actuals so far (through 2026-08-28): ~$0.50 total spent** (classification $0.39, re-transcription lessons + testing the rest). Only paid service is OpenRouter; Supabase, Vercel, Archive.org, local whisper all $0.

| Item | Cost |
|---|---|
| Supabase (personal free tier), Vercel hobby, Podcast Index, LibriVox/Gutenberg, music embeds | $0 |
| Local Whisper transcription / local Kokoro TTS | $0 |
| Azure TTS + STT free tiers | $0 |
| Text tutor + lessons + music sheets (DeepSeek), per active user | ~$1–3/mo |
| Groq Whisper (dictation + pipeline fallback), likely inside free tier | ~$0–2/mo |
| Optional one-time: re-transcribe library with Groq large-v3-turbo | ~$12 |
| **Total recurring (solo)** | **~$1–3/mo** |
| **Total recurring (4 family users)** | **~$4–10/mo** |

Cost rules: voice only where it matters; push-to-talk not open mic (when realtime voice arrives); mini/cheap models for volume work; ride free tiers deliberately; keep ingestion local.

## Content legality (family now, marketed later)

- **Family stage (Phase 6):** invite-only, free, not publicly accessible — content shared within the group. The transcribed copyrighted shows (StoryLearning etc.) technically remain personal-use; a private 4-person family app is a deliberate, low-risk call by Thomas, not a marketable posture.
- **Marketed stage — the flip is designed in:** `owner_id` on content tables from Phase 6 means copyrighted items go owner-only with a config change. The shared "legal shelf" is everything we can serve to strangers: public-domain audiobooks (LibriVox), our own LLM-generated graded stories + TTS audio, music via embeds, CC-licensed podcasts, and each user's own uploads (their transcriptions belong to their account).
- Also at marketed stage: paid Supabase tier; voice minutes and LLM spend metered per user.

## Supabase MCP setup (done 2026-08-27)

- Global `supabase` server (in `~/.claude.json`) = **business** account ("Iconic Web / Match Kicks" org, 10 client projects). Do not touch.
- Project-scoped `supabase-personal` server (same hosted URL, local scope for this project only) = **personal** account, authenticated via `/mcp` browser login. Use `supabase-personal` tools for all tutor-app database work.
- Sanity check before any DB change: list orgs/projects on `supabase-personal` and confirm you're NOT looking at the business org.

## Open items

- [x] Verify `supabase-personal` auth works — confirmed 2026-08-27: single org ("thomas@iconicwebhq.com's Org"), only Postbridge in it, no client projects.
- [x] Postbridge: paused (INACTIVE), nothing can be using it. Leaving it; new project costs $0 and doesn't require deleting it.
- [x] OpenRouter key/billing confirmed active (test call 2026-08-27).
- [x] **Phase 1 done (2026-08-27).** 739/740 episodes classified (CEFR + topic + dialect + top-2k coverage), cost $0.39. All 725 loose episodes filed into StoryLearning S6–S10 + Extras folders. Level/dialect filters + badges added to library UI. Junk deleted (test.wav, temp-downloads, empty dirs, package-lock.json, fs/path/child_process deps), lesson prompt contradiction fixed. Also fixed: pnpm-workspace.yaml had `ignoredBuiltDependencies` for sqlite3/better-sqlite3, which left native bindings unbuilt on fresh install — now `onlyBuiltDependencies`.

- [x] **Phase 2 done (2026-08-27).** Supabase project `spanish-tutor` (ref `wocosjrwgpychxeginck`, personal org, $0). Full schema with `user_id` sentinel defaults + Phase-3 tables (vocabulary_items, known_words, user_profile, tags). Data migrated preserving ids: 740 episodes, 116,889 segments (54k whisper duplicates removed), 737 lessons (deduped from 1,330 — kept latest per episode), 10 folders, 6 explanations. All API routes rewritten to supabase-js; writes now work in production (read-only-DB blocks removed). Deleted: fix-lesson route, database.ts, vercel.json buildCommand hack, sqlite/sqlite3 deps (better-sqlite3 kept as devDep for scripts). `data/podcasts.db` untracked from git but kept locally as the migration source. SUPABASE_URL/SUPABASE_KEY in .env.local + Vercel production env. RLS is on with allow-all policies (key is server-side only; replace with auth-scoped policies if ever multi-user).

- [x] **Phase 3 done (2026-08-27).** `/tutor` page: placement interview (adaptive, saves CEFR/goals/dialect/strengths to user_profile) + persistent instructor chat (tutor_messages table; every prompt includes profile, listening history, past lesson topics, due-vocab count). Dialect packs in `src/lib/tutor.ts` (costa_rican with ustedeo/tico vocab, mexican, castilian, rioplatense, neutral_latam) — Phase 7 adds TTS voice on top of these. "New Lesson" generates targeted lessons (logged in tutor_lessons so they build on each other). `/review` page: flashcard SRS (SM-2-lite in `/api/review/grade`); vocab LLM-extracted from listened episodes via `/api/review/extract`. All endpoints tested end-to-end against production stack; test data cleared so placement starts fresh.

- [x] **Post-launch fixes (2026-08-27):** placement v2 (English-first, 7+ task ladder, accent-tolerant, evidence-quoted gaps, transcript persisted); dark-on-dark Explanation/Translation panels fixed; all titles normalized ("S6E5 · ..." style); "Conversations with Alba" collection identified as mislabeled **Learn Spanish and Go** episodes with wrong transcripts attached — all 8 re-transcribed locally, re-classified, lessons regenerated; episode 85 transcribed (audio URL was fine, original failure transient); **Supabase 1000-row cap bug fixed everywhere** via fetchAllRows paging + episodes_missing_transcripts RPC (4 long episodes had silently truncated transcripts; reprocess-failed nearly re-transcribed all 738). Library now 740/740 transcripts + lessons + classifications.

- [x] **Instructor v2 + cleanup (2026-08-27):** placement now generates a 10-unit conversational syllabus (course_units table) that "New Lesson" walks in order; fixed lesson shape (error review → concept → drills → in-character role-play continued in chat); error_log table seeded by placement gaps and fed by per-turn correction extraction in chat — lessons recycle real mistakes; vocab frequency-ranked (src/data/es-frequency.json top-5k), new cards served most-frequent-first, extraction favors conversational words; Today strip + syllabus panel on /tutor with 5-min free-chat button; OpenRouter retry on transient failures; removed 7 unused deps + dead YouTube code (deps now supabase-js/next/react only); numeric-aware episode ordering in folders. End-to-end tested, test data wiped — placement is fresh.

- [x] **Instructor v3 + level clarity (2026-08-28):** plain-language level labels everywhere (src/lib/levels.ts; library legend, labeled filters/badges/header). Mistakes now categorized (fixed taxonomy) with a My Mistakes tab: grouped patterns + on-demand cached explainers built from the student's own sentences (error_explainers table). Syllabus is block-based: finishing a block generates the next 10 units from the live error log; units complete only via Complete Unit (tutor announces when earned), repeat lessons continue the same unit with fresh drills. Lessons tab (reopen any past lesson), markdown-lite chat rendering, day separators, quick-reply chips, placement resume via localStorage.

### Phase 1 findings (carry into Phase 2)

- CEFR distribution: A2 89, B1 634, B2 13, C1 3. Dialects: neutral_latam 458, castilian 168, mexican 77, andean 27, rioplatense 8.
- Episode 85 (S6E52 "Revolución a la venta") has **no transcript rows** — needs re-transcription.
- Top-2k coverage flags anomalies, not difficulty: low outliers (<55%) are episodes with long English intros (season openers, promos). Non-StoryLearning shows sit ~75–83% because conversational filler is all top-2k words.
- Whisper transcripts contain **duplicated consecutive segments** (same line twice) — clean these during the Phase 2 migration.
