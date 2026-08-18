# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

### Added
- Repository cleanup and documentation architecture.
- AI agent governance (`AGENTS.md`, `CLAUDE.md`).
- Canonical documentation in `docs/`.

### Changed
- Removed obsolete Jetro agent context files.
- Updated README with correct project paths.
- Added `tsconfig.tsbuildinfo` to `.gitignore`.

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
