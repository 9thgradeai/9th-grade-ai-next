# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [0.2.1] - 2026-08-19

### Added
- Per-subject question counts in the custom exam builder: each selected subject
  has its own count input (clamped to availability); the total is the sum and is
  sent as per-subject `count`s to `POST /api/exam/build`.
- Folder-structured question import: `data/ques/<Subject>/<Group>/<Subtopic>/*.txt`
  files are tagged with the exact group/subtopic from their path (Topic rows are
  created on demand), replacing round-robin categorisation for organised files.
- Seeded 130 International Affairs questions (আন্তর্জাতিক নিরাপত্তা ও
  আন্তরাষ্ট্রীয় ক্ষমতা সম্পর্ক → সামরিক জোট ও নিরাপত্তা চুক্তি), bringing the
  question bank to 330.

### Changed
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
