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

### Phase 9 — Mobile navigation + PWA ($0)
- The app is used on a phone but the nav has **no responsive classes at all**: one flex row with 6 items (Instructor, Review, Music, Home, Upload, Sign out) that squashes on a small screen.
- Bottom tab bar for the daily loop (Library, Instructor, Review, Music), mobile-only; keep the top bar for desktop. Upload/Sign out demote to a "More" sheet — occasional actions don't deserve thumb real estate.
- Needs `env(safe-area-inset-bottom)` for the iPhone home indicator, and page bottom padding so content clears the bar.
- Add a PWA manifest + viewport/theme-color metadata (currently missing entirely): home-screen install, full-screen launch, no browser chrome. Pairs with the offline storage + DownloadManager already built.
- Later: persistent mini-player docked above the tab bar so audio keeps playing while browsing.

### Phase 10 — Upload hardening ($0)
- **Bug: file upload is broken in production.** `/api/upload` writes to a local `uploads/` dir — fine on the Mac, impossible on Vercel (read-only, ephemeral FS). Fix: upload to Supabase Storage, same mechanism the Phase 8 stories proved.
- **Gap: uploads skip level classification.** Pipeline scripts classify everything; manual uploads land with no CEFR level, so they miss level filters and the tutor can't reason about them. Wire the same classify call into the upload path.
- Uploaded episodes currently land in the SHARED library (any signed-in user sees them) — correct for family, wrong for a public product. See the legal section.

### Phase 11 — More content (mostly no new code)
- **Cheapest win, zero code:** the 8 configured feeds hold 135–431 episodes each and only 3 per show were pulled. `node scripts/sync-podcasts.mjs --limit 25` adds ~200 episodes for a couple dollars of Groq time.
- Move the `SHOWS` array out of the script into a table + small admin UI so shows can be added without editing code.
- **YouTube via yt-dlp** — where the best comprehensible input lives (Dreaming Spanish especially, which is YouTube-native so the RSS pipeline can't see it). Bigger legal step than podcast RSS; see below.
- Scheduled sync (GitHub Actions cron or Vercel cron → API route) so new episodes arrive without being asked for.

_(Dialect packs are no longer a phase — the tutor side shipped in Phase 3; the TTS voice choice lands in Phase 4 and content filtering by dialect already exists in the library.)_

## Deferred add-ons

- **Realtime voice conversation:** OpenAI gpt-realtime-mini over WebRTC (browser connects direct; Next.js route mints ephemeral token — works on Vercel, no extra server). ~$0.02–0.05/min ≈ $10–20/mo at 15 min/day. Fork reference: `cameronking4/openai-realtime-api-nextjs` (MIT). Gemini Live is the cheaper fallback.
- **Pronunciation grading:** Azure Speech Pronunciation Assessment — phoneme-level scores, es-ES + es-MX (no es-CR; use es-MX as proxy), free tier covers solo use. Feed weak phonemes to the LLM for drills.
- Other reference repos: `baturyilmaz/wordpecker-app` (product analog), `pipecat-ai/pipecat` / `livekit/agents` (only if outgrowing direct-to-provider), `shakedzy/companion` (tutor prompt design).

## Cost summary

**Actuals (checked 2026-08-29 against the live OpenRouter credits endpoint): $18.78 is ACCOUNT-LIFETIME usage, and most of it predates this rebuild** — the original app generated 1,330 lesson records over its life (deduped to 737 during the Phase 2 migration), plus explanations, translations and chat. **The 3-day rebuild itself cost roughly $1**, reconstructed from database artifacts (808 classifications ≈ $0.37, 79 lessons ≈ $0.22, 11 graded stories ≈ $0.05, placement/syllabus/chat testing ≈ $0.10) and corroborated by a measured 24-hour delta of **$0.1045** that covered the entire 13-model benchmark. ~$7.6 of credit remains. (An earlier note in this doc claimed "$18.68 recently spent" — that conflated lifetime usage with this rebuild and was wrong in the other direction from the original "~$0.50".) **Exact per-feature spend is now logged** in `llm_usage` — see the phase entry below. Measured on the new routing: one tutor exchange (reply + error extraction) costs **$0.00014**, about 7,000 exchanges per dollar.

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

## Content legality — family now, and the path to viable

### Three tiers, honestly

1. **Safe to commercialize today:** LibriVox audiobooks (public domain, explicitly re-hostable), our own LLM-generated graded stories + TTS narration, Project Gutenberg texts, and anything a user uploads that they own.
2. **Defensible but not risk-free:** podcast episodes. Streaming from the publisher's own RSS feed is what every podcast app does and is well accepted. What makes us different is that we store **transcripts** (derivative works) and generate **lessons** (commentary/education, which leans more defensible).
3. **Cannot ship commercially as-is:** the 724 StoryLearning episodes and other transcribed paid shows, and stored full song lyrics. Music publishers are the most litigious rights holders in this space and full-lyric reproduction is their favourite target.

### The flip (designed in, not yet thrown)

`owner_id` exists on `episodes`/`folders`/`songs` (Phases 6–7) precisely so tier-3 content can become owner-only with a policy change rather than a rebuild. Today every signed-in user shares all content — right for four family members, wrong for strangers.

### If it goes public: bring-your-own-content

Sell the tutor — placement, error tracking, categorized mistake explainers, block-based syllabus, SRS, lesson engine — and let users supply the audio. This is what LingQ and Language Reactor do and it is why they can operate. The **legal shelf** ships as the built-in starter library (LibriVox + generated stories + music embeds + CC-licensed podcasts); everything copyrighted becomes per-user content only its uploader can see.

### Lyrics: keep the teaching, drop the reproduction

We currently store and display complete lyrics — the one thing that cannot be commercialized. But the teaching value isn't in the reproduction: it's the slang glossary, cultural notes, vocabulary, and short quoted lines under analysis, all much closer to fair-use commentary. A commercial version keeps the study sheet, quotes only the lines it is actively explaining, and links out to a licensed lyrics site for the full text. Loses the full-translation view, keeps nearly all the learning. (Licensing via LyricFind/Musixmatch is the paid alternative.)

### Podcasts: ask, don't assume

Prefer feeds that publish their own transcripts (Radio Ambulante already does — those imports cost $0 and carry no derivative-work question). For the rest, **just ask**: Español con Juan, No Hay Tos and similar are small independent operations that often welcome the exposure, and a revenue share or affiliate arrangement is a normal conversation. YouTube ingestion (Dreaming Spanish) raises the stakes and should be permission-first.

### Also at marketed stage
- Paid Supabase tier; voice minutes and LLM spend metered per user.
- Storage costs move from "free tier" to real once user uploads scale.

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

- [x] **Phase 4 done (2026-08-28).** Voice on `/tutor`: mic button records in-browser → `/api/tutor/transcribe` (Groq whisper-large-v3-turbo when `GROQ_API_KEY` is set — needed for Vercel; local whisper-cli fallback otherwise) → text lands in the input box for review before sending. Listen button on every tutor reply → `/api/tutor/tts` (Azure neural voice matched to target_dialect — es-CR-Maria, es-MX-Dalia, es-ES-Elvira, es-AR-Elena, es-US-Paloma — when `AZURE_SPEECH_KEY`/`AZURE_SPEECH_REGION` are set; browser speechSynthesis fallback otherwise, so it speaks today at $0). Audio cached per message client-side. **To upgrade: add GROQ_API_KEY (console.groq.com) and AZURE_SPEECH_KEY to .env.local + Vercel env — no code changes.** Tested: webm mic recording transcribed correctly via local whisper; TTS fallback path verified.

- [x] **Phase 5 done (2026-08-28).** `/music` page (nav link added): add a song (title/artist/YouTube-or-Spotify link/pasted lyrics — personal study only, playback via embeds only). One DeepSeek call generates the study sheet (`songs.study_sheet` jsonb): what the song is actually saying, line-by-line translation toggle with grammar notes, region-tagged slang glossary, cultural notes; also tags region + CEFR level. "Add Vocab to Review" extracts 8–12 conversational words/slang into `vocabulary_items` with new nullable `song_id` (FK cascade on song delete); review queue joins songs and labels cards "🎵 Title — Artist". Migration `songs_and_song_vocab`. Tested end-to-end with Cielito Lindo (sheet: Mexico/B1, 2 slang, 3 culture notes; 9 vocab cards appeared in queue; duplicate-extract guard + delete cascade verified), then test data removed so the queue stays fresh.

- [x] **Phase 6 done (2026-08-28).** Multi-user via Supabase Auth **magic links** (no passwords, no allowlist — invite by sharing the URL, per Thomas's call). `/login` page + `/auth/confirm` route (handles both token_hash and PKCE code links); middleware gates every page (redirect to /login) and API route (401), keeps sessions refreshed. All ~30 API routes now use a per-request client carrying the user's JWT (`src/lib/auth.ts` getAuth — cookies or Authorization Bearer); RLS replaced allow-all with: shared content (episodes/transcripts/lessons/folders/explanations/songs) readable+writable by any signed-in user, personal tables (profile/messages/lessons/course/errors/explainers/vocab/SRS) own-rows-only with `user_id default auth.uid()`. `episodes.listened` replaced by per-user `user_episodes` table (column kept but unused). Sign-out button in nav. Migration `multi_user_auth_rls`. Tested with two SQL-created test users (then deleted): full isolation of profiles/chats/mistakes/listened flags; anon key without a session reads nothing and cannot write. **Note:** local scripts (classify-supabase.mjs etc.) can no longer write — they'd need a secret key; revisit in Phase 7. **Manual dashboard step required (Auth → URL Configuration):** set Site URL to https://spanish-tutor-app.vercel.app, add redirect URLs https://spanish-tutor-app.vercel.app/auth/confirm and http://localhost:3000/auth/confirm; optionally change the Magic Link email template link to `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email` so links work when opened in a different browser.

- [x] **Phase 7 done (2026-08-28).** **Groq fallback in the app** (`src/lib/groq-transcribe.ts`): `processing.ts` now uses local whisper-cli where it exists, Groq whisper-large-v3-turbo on Vercel or when local transcription fails — so uploads work away from the Mac. Upload/reprocess routes await the work on Vercel (functions freeze after the response) with `maxDuration = 300`. **`scripts/sync-podcasts.mjs`**: curated feed list chosen to fill level gaps (Chill Spanish A1, ¡Cuéntame! A2, Simple Stories A2, Duolingo B1, Español con Juan B2, Hoy Hablamos B1, No Hay Tos B2/mexican, Radio Ambulante C1), resolved by name through the free iTunes Search API; uses the publisher's `podcast:transcript` (SRT/VTT parsed to segments) when offered, else Groq; generates the same lesson format as the app; auto-creates level-tagged folders; skips episodes already present; deletes the episode row if any step fails so no half-imported episodes linger. Flags: `--limit N`, `--show "name"`, `--dry-run`. Gotcha found and fixed: Groq's `url` parameter does NOT follow podcast-CDN 302 redirects, so the script downloads and downsamples (ffmpeg 16kHz mono FLAC) before uploading bytes. **Scripts now sign in as a pipeline service account** (`PIPELINE_EMAIL`/`PIPELINE_PASSWORD` in .env.local, user `pipeline@spanish-tutor.internal`) since Phase 6's RLS blocks anonymous writes. Also added `owner_id` to episodes/folders (null = original library) and renamed `songs.user_id` → `owner_id` for the marketed-later flip. Library re-transcription with large-v3-turbo (~$12) remains optional and unrun. **First sync run added 36 episodes across all 8 shows** (all with transcripts + lessons), moving the level spread from A1 0 / A2 89 / B1 636 / B2 12 / C1 4 to **A1 7 / A2 97 / B1 644 / B2 19 / C1 10** — 777 episodes total. Two more encoding gotchas found the hard way: 16kHz FLAC is lossless and still blew past Groq's 25MB limit on most full-length episodes (now Opus 16kbps, ~7MB/hour), and podcast MP3s with embedded cover art broke the ogg muxer (now `-vn`). Re-run `node scripts/sync-podcasts.mjs` any time to pull newly published episodes.

- [x] **Phase 8 done (2026-08-28).** Audiobooks, both halves, reusing the episode/player stack so they inherit transcript + click-to-translate + lessons + vocab for free. **`scripts/import-librivox.mjs`**: public-domain Spanish audiobooks discovered via Archive.org search (`collection:librivoxaudio AND language:spa` — note LibriVox's own API ignores its `language` filter, and Archive.org indexes Spanish as `spa`, not `Spanish`), most-downloaded first since popularity tracks reading quality; chapters become episodes streamed from Archive.org (we store only the URL), transcribed with Groq and level-tagged individually. Aesop's fables land at A2, Don Quijote at B2/C1 — the per-chapter classification is what makes one book span levels usefully. **`scripts/generate-stories.mjs`**: an LLM writes level-graded stories, Azure neural TTS narrates them **sentence by sentence**, so each sentence's measured audio duration gives an exact transcript timing — no Whisper round-trip and perfect click-to-seek sync (verified: last segment 46.94s vs 46.9435s actual). A 400ms SSML break is synthesized *inside* each sentence so concatenation stays seamless and timings stay honest. MP3s live in a public Supabase Storage bucket `story-audio` (free tier, range requests + CORS confirmed working, so seeking works). **`scripts/lib/pipeline.mjs`** now holds the shared pipeline helpers (auth, Groq transcription with chunking, lesson generation, classification, entity decoding) used by all three content scripts. First run: 20 LibriVox chapters across 4 books + 11 graded stories (A1/A2/B1). **Library now 808 episodes — A1 12, A2 110, B1 647, B2 25, C1 14, with zero episodes missing a transcript or lesson.** Re-run either script any time; stories are told not to repeat existing topics.

- [x] **Phase 10 done (2026-08-28) — upload fix.** `/api/upload` now stores uploaded files in the Supabase Storage bucket `episode-audio` (public, 200MB cap, audio MIME allowlist, objects namespaced per user id) instead of writing to a local `uploads/` dir, which silently broke every file upload in production. Uploads also classify now: `classifyEpisode()` in `processing.ts` tags CEFR level + topic + dialect from the finished transcript (Spanish only, and skipped if a level was already set), so uploads stop landing invisible to the level filters and the tutor. On Vercel the route awaits processing (functions freeze after the response) with `maxDuration = 300`; locally it still fires and forgets to whisper. Tested end to end with a real MP3: stored in Storage, transcribed via Groq, lesson generated, tagged A2 / "Mexican food traditions" / mexican — then the test episode was deleted.

- [x] **Phase 9 done (2026-08-28) — mobile nav + PWA.** `BottomNav` renders a fixed 5-tab bar on mobile only (Library, Instructor, Review, Music, More) with `env(safe-area-inset-bottom)` padding and a slide-up More sheet holding Upload and Sign out. The top bar keeps the brand on mobile but its link cluster is now `hidden md:flex`, so desktop is unchanged. `Navigation` renders `BottomNav` itself, so every page that already used it got the tab bar for free. Body gets `padding-bottom` under 768px so content clears the bar. PWA: `manifest.webmanifest` (standalone, portrait, brand theme `#0b0a1f`, shortcuts to Instructor/Review/Music), generated brand-gradient microphone icons (192/512/maskable-512/apple-touch), plus `viewport` metadata with `viewportFit: 'cover'` and `appleWebApp` for full-screen iOS launch — none of which existed before. The middleware matcher already excluded `.png`/`.webmanifest`, so the manifest and icons load pre-auth as browsers require. Verified: manifest + icons serve 200, viewport/theme-color meta present, tab bar renders on every authenticated page.

- [x] **Phase 12 done (2026-08-28) — quality of life + gamification.**
  **Resume playback:** `user_episodes.position_seconds`, checkpointed every 15s and flushed via `pagehide`/`sendBeacon` so a closed tab doesn't lose the spot; the player restores on `loadedmetadata` (ignoring positions within 15s of the end — that's a finished episode, not a bookmark). 90% listened auto-marks the episode. A "Continue listening" row on the library shows started-but-unfinished episodes with progress bars.
  **Likes:** `user_episodes.liked` + heart button in the player, and a "Liked" filter on the library.
  **Mobile scrubbing rebuilt:** the old 2px `<input type=range>` was near-unusable on touch. Now a pointer-event scrubber with a padded hit area (`py-4 -my-4`), pointer capture for drag, a thumb that grows while dragging, preview-then-commit seeking (seeking on every move makes mobile playback stutter), and arrow-key support. Playback speed control already existed.
  **Transcript search:** GIN index on `to_tsvector('spanish', text)` over 116k segments + `search_transcripts()` RPC using `websearch_to_tsquery` and `ts_headline`; Spanish stemming means "comida" also finds "comer". Results link to the episode at the first hit's timestamp.
  **Streaks + goals:** `user_activity` (per-day lessons/reviews/listen_seconds/chat_messages), written by `bump_activity()` from the lesson, review, chat and playback routes. `activity_summary()` computes the streak server-side, counting a day active on any lesson/review/chat or 10+ minutes listened, and starting the walk-back from yesterday so a streak survives until midnight. `StreakBar` shows the flame, a self-set weekly goal with progress, and known-word count.
  **Leaderboards with invites:** `leaderboards` + `leaderboard_members`, joined by a 6-char code (ambiguous characters excluded — these get read aloud). Weekly points: lesson 10, review 3, 1/minute listened capped at 300, so listening can't drown out practice, and weekly reset keeps it winnable for whoever starts last. `/leaderboard` page with native share-sheet invites and `?join=CODE` deep links.
  **RLS gotchas solved:** peer activity visibility uses `leaderboard_peer_ids()`, and member policies use `my_leaderboard_ids()` — both `security definer` to avoid self-referential recursion. Joining must use a plain `insert`, NOT `upsert`: upsert compiles to `ON CONFLICT DO UPDATE`, which requires SELECT on the table, and a non-member can't read membership rows yet — a genuine chicken-and-egg that surfaced as a confusing RLS violation. Duplicate key is treated as success.
  Tested end to end with two users: join, idempotent rejoin, correct ranking, correct per-viewer `is_me`, peer activity visible, streak registering at 1 after 10+ minutes. Test users and data then deleted.

- [x] **Placement v3 + voice ergonomics (2026-08-28).** Thomas's first real placement exposed three faults, all confirmed from the saved transcript.
  **(1) It leaked its own marking.** Every turn from task 2 opened with the assessment — "Noting strengths like vocabulary (gymnasio, película)... but also gaps (llevantanse → me levanto)". The old prompt said "note errors silently" and the model ignored it, because an assessor with nowhere to put its evaluation puts it on screen. Fixed structurally, not with a sterner instruction: the interviewer now returns `{message, notes, task, done}` and only `message` is rendered. `notes` rides along in the client history (never rendered, never written to the transcript) so the model keeps its running assessment across turns. Seeing yourself marked mid-test makes you answer below your real level, which corrupts the estimate.
  **(2) It finished 3 tasks early** — stopped after 5 Spanish tasks despite a stated 7 minimum, so it never probed the conditional or a nuanced argument and claimed a level it hadn't tested. The model's own `task` counter under-counted AND was omitted from the final payload, so a naive guard never fired. Now counted server-side from the student's Spanish answers (`countSpanishAnswers`, deterministic), and finishing below `MIN_TASKS = 7` triggers a continue-nudge.
  **(3) It logged 2 mistakes out of ~12 visible.** Gaps now ask for every distinct error up to 12, each with a `correction`, which is persisted to `error_log` (previously correction was hardcoded null).
  **Adaptive start:** the English opening already asks about their background and that signal was wasted. Now it picks a starting rung — beginner → (a), some study or living in-country → (c), years of study → (d) — climbing on success and dropping after a struggle, with fixed skill *coverage* so different people stay comparable. Scaffolding examples ("Me llamo... Tengo... años") are barred above rung (b) since handing over the pattern measures the prompt, not the student.
  **Voice:** auto-play toggle on tutor replies that speaks **only the Spanish** (`spanishOnly()` pulls quoted fragments or Spanish-looking sentences) using the **free browser voice** — Azure's 500k chars/month is ~14 replies a day across all users, so auto-reading everything through it would exhaust the quota in a fortnight; the 🔊 button still uses the good neural voice on demand. Mic now auto-stops after 2s of silence (AudioContext peak detection, echo cancellation on), so it's talk-and-done rather than tap-talk-tap — deliberately not an always-on mic, which would pay to transcribe silence, pick up the tutor's own speech, and drain battery; true always-on belongs to the deferred realtime-voice phase.
  Verified by simulating a full interview: zero assessment in any visible message, correct adaptive start (skipped name-and-age), 7 tasks completed, climbed through conditional and B2 abstract topics, landed B1 (vs the truncated run's A2), 5 gaps with corrections. Simulation data deleted.

- [x] **Model routing (2026-08-28).** The app ran `deepseek/deepseek-chat` for *everything* — which by now is DeepSeek's legacy expensive tier, so it was simultaneously overkill for bulk work and slower than needed for chat. Benchmarked 13 models on this app's own tasks rather than trusting sticker prices.
  **Key finding — sticker prices mislead.** Several "cheap" models are reasoning models that bill hidden thinking as output: qwen3.7-flash spent **1,799 thinking tokens** to produce two sentences (making it *more* expensive per useful reply than what it would replace), and glm-5.3-flash took **23 seconds**. Worse, both return **completely empty responses** under tight token budgets, which would have silently broken classification (`max_tokens: 100`). gemini-3.7-flash looked mid-priced and measured as the *most* expensive on the board.
  **Key finding — "fixed" ≠ "taught".** The decisive metric was whether a model *flags* an error or silently restates the sentence correctly. gpt-oss-20b and gemma-3-27b scored 5/5 and 4/5 on fixing but **0/5 on teaching** — a student would never notice they'd erred. The ultra-cheap tier (mistral-nemo $0.01/1k, nova-lite, command-r, qwen3-30b-instruct) essentially never corrects at all.
  **Winner: `openai/gpt-oss-120b`** — the only model scoring 5/5 on both fixing and teaching, with correct Costa Rican *usted*, authentic tico register (*mae*, *pura vida*), zero accent false-positives, and confirmed in-character role-play across turns. It is also near the cheapest and, served by **Groq, ~5x faster** (791ms vs 4,047ms). Claude Haiku 4.5 used *tú* despite an explicit ustedeo instruction, at 25x the cost.
  **Routing implemented** in `src/lib/ai.ts` (mirrored in `scripts/lib/pipeline.mjs`): role `chat` → gpt-oss-120b (Groq primary, OpenRouter fallback on rate limits), role `bulk` → gemini-2.5-flash-lite. Both overridable via `MODEL_CHAT` / `MODEL_BULK` env vars, so switching models is a Vercel env change rather than a deploy.
  **Two constraints found the hard way:** gpt-oss-120b is verbose in JSON mode and *truncates* under tight budgets (Groq rejects it outright), so JSON calls are floored at 900 tokens and short structured calls use flash-lite. But flash-lite **invents errors on correct Spanish** (it flagged the perfectly valid "no habia"), so error extraction must stay on the chat model — a wrong entry there teaches the student something false.
  **Caching + trimming, measured.** Real payload is 2,225 input tokens: system prompt/context **1,595 (72%)**, 20-message history **630 (28%)**. DeepSeek was already returning **99% cache hits automatically** (2,208/2,225) — Anthropic and Google returned zero without explicit cache markers. Trimming history 20→10 saves only ~14% because the context block dominates; done anyway as it's free. Caching was therefore not worth building around.

- [x] **LLM cost logging (2026-08-29).** Spend was previously only reconstructable after the fact, and that led to two wrong numbers in this very document. Now every model call records `feature`, `role`, `model`, `provider`, exact `prompt_tokens`/`completion_tokens` and a list-price `cost_usd` to the `llm_usage` table. Logging is opt-in per call site (an optional `log: { supabase, feature }` on `callOpenRouterChat`) and never blocks or fails a request. Attributed features: tutor_chat, error_extraction, placement, lesson, mistake_explainer, vocab_extraction, song_vocab, song_study_sheet, translate, classify. `usage_summary(days)` RPC + `GET /api/usage?days=N` return spend by day, feature and model. Note token counts are exact but cost is **list price**, so Groq free-tier calls show what they *would* cost — `provider` is recorded so the two can be told apart. Also hoisted `getAuth` to the top of the placement route (it previously authenticated only inside the done-branch, so early turns had no context to attribute).

- [x] **iOS mobile fixes (2026-08-29).** Two bugs found on a real iPhone.
  **(1) The tab bar rendered at the TOP of the screen.** `BottomNav` was nested inside `<nav className="glass-card">`, and `.glass-card` sets `backdrop-filter: blur(12px)` — which, like `transform` and `filter`, makes an element a **containing block for `position: fixed` descendants**. So `fixed bottom-0` was resolving against the 64px header rather than the viewport, pinning the bar just below the top bar. Fixed by rendering `BottomNav` as a sibling of the header instead of a child. Desktop never showed it because the bar is `md:hidden`.
  **(2) The chat composer floated mid-screen instead of sitting above the keyboard.** iOS Safari shrinks the *visual* viewport when the keyboard opens but leaves the *layout* viewport unchanged, so a normally-flowed composer ends up stranded behind the keyboard — and the old fixed `50vh/65vh` message pane made it worse. The chat panel now measures its own top and sizes itself to the visual viewport bottom (`visualViewport.height`), as a flex column with a scrolling message area and a `shrink-0` composer, so the input rides just above the keyboard like a messaging app. It re-measures on `visualViewport` resize/scroll, window resize and orientation change, and reserves the 68px tab-bar strip only while the keyboard is closed. `BottomNav` hides itself while the keyboard is up (a fixed bottom element sits *under* the iOS keyboard, so it would otherwise be invisible clutter). `GlassCard` gained `forwardRef` + `style` to make the measurement possible.

- [x] **Folder level labels derived, not stored (2026-08-31).** Folder names carried hand-written levels ("Chill Spanish (A1-A2)") which survived the re-classification and stayed wrong — **7 of 8 show folders disagreed with their own contents**, worst case a folder labelled A1-A2 holding only B1. Stripped the labels from the database and from `sync-podcasts.mjs` (its `level` is now only a fallback when classification fails, never a name), and the library computes the badge from the episodes actually in the folder (`levelRange()` in FolderPodcastList), so it cannot drift again as content is added. "Graded Stories (A1/A2/B1)" keeps its label — there the level is the folder's identity, distinguishes three folders, and is accurate. Result: Chill Spanish now reads B1, Hoy Hablamos A2–B1, Radio Ambulante B1–B2, StoryLearning S7 A2–B2.

### Phase 1 findings (carry into Phase 2)

- CEFR distribution: A2 89, B1 634, B2 13, C1 3. Dialects: neutral_latam 458, castilian 168, mexican 77, andean 27, rioplatense 8.
- Episode 85 (S6E52 "Revolución a la venta") has **no transcript rows** — needs re-transcription.
- Top-2k coverage flags anomalies, not difficulty: low outliers (<55%) are episodes with long English intros (season openers, promos). Non-StoryLearning shows sit ~75–83% because conversational filler is all top-2k words.
- Whisper transcripts contain **duplicated consecutive segments** (same line twice) — clean these during the Phase 2 migration.
