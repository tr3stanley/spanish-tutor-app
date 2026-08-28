# Spanish Tutor App — Improvement Plan

_Last updated: 2026-08-27. Reference doc for the rebuild. Single user (Thomas), local-first, budget-minimized. May be marketed later — swap points noted at the bottom._

## Decisions made

- **Text instructor first, not realtime voice.** Lesson quality > voice polish. Realtime conversation is a deferred add-on.
- **Voice I/O still included cheaply:** speech-to-text so Thomas can talk instead of type; text-to-speech so tutor replies can be heard in the target dialect (covers "what should it sound like" without pronunciation grading).
- **Database moves to a personal free-tier Supabase project** — NOT the "Iconic Web / Match Kicks" org (that's the paid client org; a project there costs $10/mo). Postbridge lives on the personal account and may be replaced/deleted — Thomas decides, confirm nothing uses it first.
- **Ingestion stays local:** the Mac does downloads and whisper-cpp transcription for free; the cloud only stores results.
- **Target dialects matter:** Costa Rican vs Mexican etc. should shape tutor language (voseo/ustedeo, vocabulary) and playback voice.

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
- **Mic button** on the tutor chat: record → Whisper transcription (OpenAI $0.006/min, or Groq near-free, or Azure 5 free hrs/mo) → sends as text.
- **Play button** on tutor replies: Azure neural TTS — free tier 500k chars/month, includes real **es-CR** and **es-MX** voices. Hear correct pronunciation in the target dialect for $0.
- Caveat: turn-based (walkie-talkie feel), and nothing scores Thomas's own pronunciation — but the mic plumbing is exactly what the deferred Azure pronunciation grader plugs into.

### Phase 5 — Automated podcast pipeline ($0)
- Curated feed list by level (open RSS, full audio): Dreaming Spanish (A1–A2), Duolingo Podcast (B1, free transcripts), Cuéntame / Simple Stories (A2–B1), Español con Juan (B1–B2), Hoy Hablamos (B1–C1), No Hay Tos (B2+, Mexican, free transcripts via signup), Radio Ambulante (C1+, free transcripts). Skip paywalled News in Slow Spanish.
- Discovery via free **Podcast Index API** (`podcastindex-org.github.io/docs-api`); prefer feeds exposing `podcast:transcript`.
- Local script (successor to `download-rss-podcast.py`): fetch new episodes → publisher transcript if free, else local Whisper → level-tag → sync to Supabase.
- Legal note (matters if marketed): personal-use downloading/transcribing of open feeds is fine; re-hosting audio or showing transcripts to other users is not.

### Phase 6 — Ebooks ($0)
- **Gutendex** (`gutendex.com/books?languages=es`) for public-domain Spanish books (skews C1+, older prose).
- **Import my own EPUB:** EPUB = zipped HTML; extract text with JSZip, render with epub.js.
- Chapter-level CEFR scoring with the same classifier; same click-to-translate reader as transcripts.
- Optionally: LLM-generated/simplified graded stories at a chosen level (real graded readers aren't free).

### Phase 7 — Dialect packs ($0)
- A settings layer: choosing "Costa Rican" switches tutor instructions (voseo, tico vocabulary, muletillas), TTS voice (es-CR), and content filtering. Same for Mexican (es-MX), etc.

## Deferred add-ons

- **Realtime voice conversation:** OpenAI gpt-realtime-mini over WebRTC (browser connects direct; Next.js route mints ephemeral token — works on Vercel, no extra server). ~$0.02–0.05/min ≈ $10–20/mo at 15 min/day. Fork reference: `cameronking4/openai-realtime-api-nextjs` (MIT). Gemini Live is the cheaper fallback.
- **Pronunciation grading:** Azure Speech Pronunciation Assessment — phoneme-level scores, es-ES + es-MX (no es-CR; use es-MX as proxy), free tier covers solo use. Feed weak phonemes to the LLM for drills.
- Other reference repos: `baturyilmaz/wordpecker-app` (product analog), `pipecat-ai/pipecat` / `livekit/agents` (only if outgrowing direct-to-provider), `shakedzy/companion` (tutor prompt design).

## Cost summary

| Item | Cost |
|---|---|
| Supabase (personal free tier), Vercel hobby, Podcast Index, Gutenberg | $0 |
| Local Whisper transcription | $0 |
| Azure TTS + STT free tiers | $0 |
| Level tagging (one-time) | ~$2 |
| Text tutor + lessons (DeepSeek) | ~$1–3/mo |
| Whisper API dictation (if not using free tiers) | ~$0–2/mo |
| **Total recurring** | **~$2–5/mo** |

Cost rules: voice only where it matters; push-to-talk not open mic (when realtime voice arrives); mini/cheap models for volume work; ride free tiers deliberately; keep ingestion local.

## If it's ever marketed (known swap points)

- Licensed or public-domain content only — no re-hosted podcast audio/transcripts (the 724 StoryLearning episodes on Archive.org are personal-use only).
- Auth + per-user tables (schema in Phase 2 should keep `user_id` columns from day one to make this cheap).
- Paid Supabase tier; voice minutes metered per user.

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
