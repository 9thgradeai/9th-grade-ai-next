# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [0.2.1] - 2026-08-19

### Added
- Per-subject question counts in the custom exam builder: each selected subject
  has its own count input (clamped to availability); the total is the sum and is
  sent as per-subject `count`s to `POST /api/exam/build`.
- Folder-structured question import: `data/ques/<Subject>/<Node>/…/*.txt` files
  are tagged with the exact leaf path from their folder hierarchy (Topic rows are
  created on demand), replacing round-robin categorisation for organised files.
- Seeded 130 International Affairs questions (আন্তর্জাতিক নিরাপত্তা ও
  আন্তরাষ্ট্রীয় ক্ষমতা সম্পর্ক → সামরিক জোট ও নিরাপত্তা চুক্তি), bringing the
  question bank to 330.
- `database/data/taxonomy.json` — the canonical question taxonomy parsed from the
  Questions Architecture (10 subjects, 348 nodes, 284 leaves), with `path`,
  `depth`, and `leaf` flags embedded.
- `scripts/taxonomy.ts` — taxonomy loader (`loadTaxonomy`, `flattenTaxonomy`),
  subject metadata (`SUBJECT_META`), and NFC-normalised path/node resolution
  helpers used by the seed.

### Changed
- **Recursive Topic taxonomy**: `Topic` now has a self-relation (`parentId`,
  `TopicTree`) with `slug`, `path`, `depth`, and `sortOrder`. `Question` gains
  `topicId` (FK to the leaf Topic) and `path` (full leaf content path such as
  `04_আন্তর্জাতিক_বিষয়াবলি/০২_নিরাপ্তা_ও_ক্ষমতা/আন্তর্জাতিক_নিরাপ্তা`). Schema
  pushed via `prisma db push` (no migrations).
- `scripts/seed-questions.ts` (run by `npm run db:seed-questions` and `db:seed`)
  now builds the recursive topic tree, distributes the 200 flat questions
  round-robin across the taxonomy leaves, imports folder-structured files by
  NFC-normalised name, and refreshes aggregated per-topic `questionCount`s.
- Custom exam engine (`backend/services/exam.ts`) now builds the selection tree
  recursively with aggregated subtree counts and pruning, and accepts
  `subjects[].paths` (empty = whole subject) with union-subtree eligibility.
  `POST /api/exam/config` returns the new `nodes` shape; `POST /api/exam/build`
  takes `paths` instead of `groups`.
- `CustomExamTab` renders the recursive topic tree with per-node counts,
  whole-subtree selection semantics, and subtree-accurate availability.
- **Unicode hardening**: all Bengali name matching is NFC-normalised so
  composed/decomposed forms (`য়` vs `য`+নুক্তা) always resolve.
- CI is green on every push (Node 22, platform-complete lockfile).
- Fixed 39 pre-existing eslint errors (react-hooks, floating promises, seed types).

## [0.2.0] - 2026-08-19

### Added
- Repository cleanup and documentation architecture.
- AI agent governance (`AGENTS.md`, `CLAUDE.md`).
- Canonical documentation in `docs/`.
- Custom BCS-style exam engine: multi-subject/topic/subtopic selection tree
  (`GET /api/exam/config`), deterministic seeded question build with
  largest-remainder allocation (`POST /api/exam/build`), and BCS grading
  (+1 correct, −0.5 wrong, 0 unanswered) with full review
  (`POST /api/exam/submit`).
- `CustomExamTab` UI (config → confirm → timed single-scroll exam → results)
  wired as the default Practice mode, with localStorage resume of active exams
  and wall-clock countdown.
- `Question.subtopic` column + composite index `[subjectId, topic, subtopic]`;
  seed now assigns topic/subtopic from `TOPIC_TREES` (round-robin).

### Changed
- Removed obsolete Jetro agent context files.
- Updated README with correct project paths.
- Added `tsconfig.tsbuildinfo` to `.gitignore`.
- `backend/services/activity.ts` now exports `recomputeProgress`.

### Fixed
- Empty directories removed (`projects/`, `frontend/components/{home,layout,modals}/`).

## [0.1.0] - 2024-08-17

### Added
- Initial release of 9Th-Grade AI.
- Syllabus explorer, question bank, mock tests, flashcards, study planner.
- AI Tutor and Solver with Anthropic Claude integration.
- JWT authentication with HttpOnly cookies.
- Prisma + SQLite schema and seed data.
- Bilingual UI (Bengali/English).
- Responsive dashboard with 8 tabs.
- Gamification (badges, streaks, leaderboard).
- Offline packs and document library.
- Storybook design system primitives (Badge, Button, Card, Input).
