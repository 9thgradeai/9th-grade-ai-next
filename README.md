<div align="center">

# 9Th-Grade AI

**Free, open-source, AI-powered exam preparation for Bangladeshi government job aspirants.**

[![License: MIT](https://img.shields.io/badge/License-MIT-emerald.svg)](./LICENSE)
[![Next.js 16](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org)
[![React 19](https://img.shields.io/badge/React-19-61DAFB?logo=react)](https://react.dev)
[![TypeScript 5](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript)](https://www.typescriptlang.org)
[![Prisma 6](https://img.shields.io/badge/Prisma-6-2D3748?logo=prisma)](https://www.prisma.io)
[![Vercel](https://img.shields.io/badge/Deployed-on-Vercel-000000?logo=vercel)](https://9-delta-ten.vercel.app)

**Live Demo:** [9-delta-ten.vercel.app](https://9-delta-ten.vercel.app)

</div>

---

Built for competitive recruitment exams — **BCS Preliminary**, **Bangladesh Bank**, **Assistant Director**, and other **9th-grade (pay-scale) government posts** — 9Th-Grade AI unifies a syllabus explorer, a real-data question bank, a BCS-style custom exam engine, mock tests, spaced-repetition flashcards, an adaptive study planner, and a bilingual AI tutor in one open platform.

> **This is a free product.** There is no pricing, no paid tier, no premium gating — every feature is available to everyone.

---

## Table of Contents

- [Key Highlights](#key-highlights)
- [The Problem](#the-problem)
- [The Solution](#the-solution)
- [Features](#features)
- [Site Workflow](#site-workflow)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Data Flow](#data-flow)
- [Database Schema](#database-schema)
- [Content & Taxonomy](#content--taxonomy)
- [AI System](#ai-system)
- [Authentication & Security](#authentication--security)
- [API Reference](#api-reference)
- [Design System](#design-system)
- [Development Workflow](#development-workflow)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Available Scripts](#available-scripts)
- [Project Structure](#project-structure)
- [Testing & Quality](#testing--quality)
- [Deployment](#deployment)
- [Roadmap](#roadmap)
- [Documentation](#documentation)
- [Contributing](#contributing)
- [License](#license)

---

## Key Highlights

| Metric | Detail |
|--------|--------|
| **Exam Modes** | Custom Exam Engine, Mock Tests, Daily Quiz, Exam Archive, Question Bank |
| **Question Bank** | 330+ questions sourced from real BCS / Bank / Teacher recruitment exams |
| **Taxonomy** | 10 subjects, 348 nodes, 284 leaves — mirrors the official BCS syllabus (up to 4 levels deep) |
| **Scoring** | BCS-accurate: **+1** correct, **−0.5** wrong, **0** unanswered |
| **AI Providers** | Groq (`openai/gpt-oss-120b`), Anthropic (Claude Sonnet 4), Tavily web search |
| **Tests** | 61+ tests across 8 files — unit + component |
| **Database Models** | 20+ Prisma models with typed relations and indexed queries |
| **API Endpoints** | 21 route groups under `/api/*` |
| **Languages** | Bangla / English bilingual UI and AI tutor |
| **Accessibility** | WCAG 2.2 compliant — semantic HTML, focus-visible, ARIA, reduced-motion, iOS safe areas |

---

## The Problem

Preparing for Bangladesh's competitive exams is hard:

- **Fragmented syllabus** — the official BCS syllabus spans 10+ subjects with a deeply nested topic structure that is rarely presented clearly.
- **Scattered previous-year papers** — questions are spread across forums, PDFs, and print guides with no structured, searchable home.
- **No personalization** — generic study plans ignore what each candidate actually knows, and nobody tracks gaps across subjects, topics, or subtopics.
- **Unaffordable AI tools** — most AI study aids are paid and rarely tailored to the Bangladeshi public-sector exam pattern.

## The Solution

9Th-Grade AI is a full-stack Next.js application that treats **content as data** and **progress as truth**:

- Every question, topic, flashcard, and syllabus node is **seeded into a relational database** and served through typed API routes — nothing is hardcoded in the client.
- A **recursive topic taxonomy** mirrors the real BCS syllabus (10 subjects, 348 nodes, 284 leaves, up to 4 levels deep), letting candidates drill from subject → topic → subtopic and build exams from exactly the areas they want.
- A **BCS-accurate exam engine** grades the same way the real exam does, persists every attempt, and recomputes accuracy, streaks, and per-subject reports from real activity.
- An **AI tutor and solver** answer in Bangla/English (typed or by photo), grounded in live web search, with a clearly-labelled offline mock fallback.

---

## Features

### Exam Practice

| Feature | Description |
|---------|-------------|
| **Custom Exam Engine** | Build a BCS-style exam from any combination of subjects, topics, and subtopics (multi-select across the taxonomy), with per-subject question counts, a config review modal, wall-clock timer, localStorage resume, and full answer review. |
| **Mock Tests** | Timed mock sessions built from the same subtopic picker, with auto-submit on time expiry and graded results persisted to the database. |
| **Daily Quiz** | A fresh daily set with real grading and points on submit — no fabricated XP. |
| **Exam Archive** | Previous-year papers organized by category (BCS, Bank, Teacher, etc.). |
| **Question Bank** | Searchable, category-filtered bank of 330+ questions served from the database, with bookmarking. |

### Learning Tools

| Feature | Description |
|---------|-------------|
| **Syllabus Explorer** | Subject-by-subject breakdown with per-topic question counts and progress. |
| **Spaced-Repetition Flashcards** | SM-2 algorithm (ease factor, interval, repetitions) with per-user review logs and due-deck scheduling. |
| **Smart Study Planner** | Day-by-day plan with completable, priority-ranked tasks. |
| **Bookmarks** | Save and revisit any question. |

### AI

| Feature | Description |
|---------|-------------|
| **AI Tutor** | Streaming bilingual (Bangla/English) chat assistant, focused on BCS / Bank / Teacher-recruitment / govt-job preparation, grounded in live web search when available. |
| **AI Solver** | Step-by-step question solver supporting text **and image** input, returning a solution plus numbered steps as structured JSON. |
| **Voice AI Tutor** | Voice-based doubt-solving in Bengali. |

### Motivation & Awareness

| Feature | Description |
|---------|-------------|
| **Progress & Streaks** | Points, accuracy, streak, rank, and a 7-day activity history derived from real attempts. |
| **Badges & Gamification** | Achievement badges and a leaderboard. |
| **Recommendations** | Performance-driven study recommendations based on per-subject accuracy. |
| **Flash News** | Exam news and updates feed with read-state tracking. |
| **Notifications** | In-app notification center with read receipts. |
| **Exam Countdown** | Real published exam dates (BCS, Bank, Teacher registration) with countdown timers. |
| **Offline Packs & Documents** | Syllabus PDFs, circulars, and guides. |

---

## Site Workflow

This section describes how a user actually moves through the product — from first visit to a full exam attempt — and how every activity feeds back into their dashboard.

### High-Level Journey

```
┌────────────┐   ┌──────────────┐   ┌─────────────────────────────────────────┐
│  Landing   │──►│   Login /    │──►│  Dashboard — "Mission Control"         │
│   Page /   │   │  Register /  │   │  (9 tabs, side/bottom nav)             │
│  Syllabus  │   │  auth_token  │   │                                         │
│  Explorer  │   │  (HttpOnly)  │   │  Home · Planner · Practice · Flashcards │
└────────────┘   └──────────────┘   │  AI Solver · Question Bank · Progress   │
        ▲                            │  Offline · Settings                   │
        │                            └──────┬────────────────────────────────┘
        │                                   │ activity recorded
        │                                   ▼
        │                       ┌────────────────────────┐
        └───────────────────────│  Every attempt writes  │
              return visits     │  QuestionAttempt /     │
                                │  MockTestResult /      │
                                │  FlashcardReview       │
                                └───────────┬────────────┘
                                            │ feeds
                                            ▼
                              Progress, accuracy, streaks,
                              rank, subject reports, AI recommendations
```

### Stage 1 — Landing & Discovery (Anonymous)

Visitors land on `/` and explore the marketing surface without an account:

| Component | Purpose |
|-----------|---------|
| `landing/HeroSection` | Cinematic hero — knowledge-field canvas, pointer-reactive depth, CTAs → login/register |
| `landing/TrustStripSection` | Exam-track marquee (CSS-only, reduced-motion safe) |
| `landing/ProblemSection` | The three structural frictions of exam prep |
| `landing/IntelligenceSection` | Interactive knowledge graph (Subjects → … → Strengths) |
| `landing/SignalSection` | Answer-signal pipeline with correct/incorrect simulation |
| `landing/AdaptivePracticeSection` | Circular adaptive loop (`#features`) |
| `landing/TutorSection` | AI tutor reasoning timeline |
| `landing/ExamEngineSection` | Track cards → `/tracks#…` |
| `landing/SubjectUniverseSection` | Subject constellation around the knowledge core (`#syllabus`) |
| `landing/AnalyticsSection` | Sample dashboard visualization |
| `landing/PlannerSection` | Weak Topic → Mastery path drawn on scroll |
| `landing/PhilosophySection` | Scroll-linked typography moment |
| `landing/FinalCtaSection` | Conversion CTA → login/register |

### Stage 2 — Authentication

- The user registers (`POST /api/auth/register`) or logs in (`POST /api/auth/login`).
- The server verifies the password (`bcryptjs`) and sets an **HttpOnly `auth_token` cookie** (JWT, 7 days).
- `proxy.ts` (Next 16's middleware) redirects unauthenticated users away from `/dashboard` and authenticated users away from `/login`.
- The client never stores the token — every subsequent request is authorized by the cookie.

### Stage 3 — Dashboard: "Mission Control"

The dashboard is a **real-data** surface. It loads from live endpoints on mount and renders graceful empty states until the user builds activity.

| Tab | What the User Does | Data Source |
|-----|--------------------|-------------|
| **Home** | See exam countdown, KPI tiles (points, accuracy, questions answered, streak, rank, mock exams), weakest subjects, today's routine, recent mock results, daily quiz, flash news, and an AI study suggestion | `/api/dashboard-stats`, `/api/subject-reports`, `/api/exam-schedule`, `/api/study-plan`, `/api/mock-test/results`, `/api/flash-news` |
| **Planner** | Review a day-by-day study plan; mark tasks complete (priority-ranked) | `/api/study-plan`, `/api/study-plan/tasks/:id/toggle` |
| **Practice** | Launch one of three exam modes (below) | `/api/exam/config`, `/api/exam/build`, `/api/exam/submit`, `/api/practice/submit` |
| **Flashcards** | Review due SRS cards; rate recall quality | `/api/flashcards` |
| **AI Solver** | Get step-by-step solutions by text or photo | `/api/ai/solver` |
| **Question Bank** | Search and filter 330+ questions by subject/topic/subtopic; bookmark favourites | `/api/questions`, `/api/question-bank/categories`, `/api/bookmarks` |
| **Progress** | Track streaks, badges, rank, and per-subject accuracy reports | `/api/badges`, `/api/subject-reports`, `/api/dashboard-stats` |
| **Offline** | Access downloadable syllabus packs, circulars, and guides | `/api/documents` |
| **Settings** | Theme toggle, account management, logout | — |

### Stage 4 — Exam Practice (Three Modes)

The practice tab hosts three modes, all sharing one **recursive topic picker** (`TopicTreePicker`) and one path-based selection model:

```
                  ┌────────────────────────────────────────────────┐
                  │   TopicTreePicker:  Subject → Topic → Subtopic │
                  │   (multi-select, per-subject counts, paths)    │
                  └──────────────────────┬─────────────────────────┘
                                         │
              ┌──────────────────────────┼──────────────────────────┐
              ▼                          ▼                          ▼
     ┌──────────────┐          ┌──────────────┐          ┌──────────────┐
     │ CUSTOM EXAM  │          │  MOCK TEST   │          │ QUICK PRACT. │
     │ BCS scoring  │          │  timed,      │          │  instant     │
     │  +1 / −0.5   │          │  auto-submit │          │  answer+     │
     │  timer +     │          │  on expiry   │          │  review      │
     │  localStorage│          └──────┬───────┘          └──────┬───────┘
     │  resume      │                 │                          │
     └──────┬───────┘                 │                          │
            └─────────────────────────┼──────────────────────────┘
                                      ▼
                     ┌─────────────────────────────────┐
                     │  Answer → submit → grade        │
                     │  +1 correct, −0.5 wrong, 0 blank │
                     │  (BCS convention)               │
                     └────────────────┬────────────────┘
                                      ▼
                     ┌─────────────────────────────────┐
                     │  Result panel: score %, points, │
                     │  per-question review with       │
                     │  correct answers + explanations │
                     └────────────────┬────────────────┘
                                      ▼
                     ┌─────────────────────────────────┐
                     │  Attempt persisted → feeds      │
                     │  accuracy, streaks, subject     │
                     │  reports, recommendations       │
                     └─────────────────────────────────┘
```

- **Custom Exam** — builds via `POST /api/exam/build` (deterministic, never leaks answers), runs on a wall-clock timer, survives refreshes via `localStorage` resume, and grades via `POST /api/exam/submit`.
- **Mock Test** — timed session from the same picker; auto-submits when time expires; results persisted as `MockTestResult` history.
- **Quick Practice** — fetches questions directly via `GET /api/questions?paths=…`, grades via `/api/practice/submit`, and shows an inline review.

### Stage 5 — Spaced-Repetition Flashcards

```
Select deck → review due cards (nextReview ≤ now)
   → flip card → self-rate recall (Again / Hard / Good / Easy)
   → SM-2 algorithm recomputes interval, ease factor, nextReview
   → review logged to FlashcardReview (per-user)
   → due deck re-scheduled for future sessions
```

### Stage 6 — AI Assistance

- **AI Tutor** — streaming Bangla/English chat grounded in live Tavily web snippets (when `TAVILY_API_KEY` is set); clearly labelled `source` (`groq+web` / `groq` / `mock`).
- **AI Solver** — submit text or a photo of a question; receive a solution plus numbered steps as structured JSON.
- **Voice AI Tutor** — speak a doubt in Bengali; get a spoken/served explanation.

### The Feedback Loop

Everything the user does is recorded and recomputed from real activity — no fabricated numbers:

```
Answer attempts ──► QuestionAttempt ──► accuracy · streaks · 7-day activity
Mock test scores ─► MockTestResult ───► history · exam KPIs · rank
Card reviews ─────► FlashcardReview ──► SRS scheduling · flashcardsReviewed
Task toggles ─────► StudyTask ────────► today's routine · plan completion
Quiz submissions ─► DailyQuiz ────────► points · daily streak
All of the above ────────────────────► subject reports → AI recommendations
```

### Key User Journeys

| Journey | Steps |
|---------|-------|
| **First-time onboarding** | Visit landing → register → land on dashboard → take daily quiz → attempt one custom exam → review weak areas |
| **Daily study habit** | Check exam countdown → complete planner tasks → review due flashcards → take daily quiz → quick practice on weakest subject |
| **Exam-focused prep** | Build a full custom BCS-style exam on a chosen subject → submit → review explanations → repeat on weak topics → monitor Progress tab |
| **Doubt solving** | Open AI Solver → photograph a question → get step-by-step solution → if still stuck, chat with AI Tutor |
| **Offline review** | Open Offline tab → download syllabus PDFs / circulars → study without connectivity |

---

## Tech Stack

### Core

| Layer | Technology | Notes |
|-------|-----------|-------|
| Framework | **Next.js 16** (App Router) | React Server Components, route handlers, middleware |
| UI Library | **React 19** | Client components in `frontend/components/` |
| Language | **TypeScript 5** | Strict mode enabled |
| Styling | **Tailwind CSS v4** | CSS-first configuration, design tokens via `--font-*` variables |
| Animation | **Framer Motion** | Page transitions, micro-interactions, reduced-motion aware |
| Icons | **Lucide React** | Consistent SVG icon set |

### Backend

| Component | Technology | Notes |
|-----------|-----------|-------|
| ORM | **Prisma 6** | Type-safe queries, schema pushed directly (no migration files) |
| Database | **PostgreSQL** (required — dev and prod) | Local Docker or Neon; schema pushed directly |
| Auth | **jose** (JWT) | HttpOnly, SameSite=Lax cookies, 7-day sessions, `auth_token` |
| Password hashing | **bcryptjs** | Cost 10 |
| Rate limiting | **Token bucket** behind a pluggable store | In-memory dev / Redis prod (`REDIS_URL`), per-user + per-IP policies |

### AI

| Component | Technology | Notes |
|-----------|-----------|-------|
| Tutor provider | **Groq** (`openai/gpt-oss-120b`) | Streaming `generateText`, retry-on-empty, `X-AI-Source` header |
| Solver provider | **Anthropic** (Claude Sonnet 4) | Step-by-step structured JSON solutions |
| Web grounding | **Tavily** | Live search snippets injected as the primary factual source |
| SDK | **Vercel AI SDK** (`ai`) | `@ai-sdk/groq`, `@ai-sdk/anthropic` |
| Fallback | **Mock responses** | Clearly labelled `source: "mock"` when keys are unset |

### Testing & Tooling

| Component | Technology |
|-----------|-----------|
| Test runner | **Vitest 3** + **Testing Library** (jsdom) |
| Coverage | **Istanbul** (70% lines, 60% functions, 70% branches thresholds) |
| Linting | **ESLint 9** (`eslint-config-next`) |
| Formatting | **Prettier 3** |
| Type checking | `tsc --noEmit` |
| Dev server | Next.js dev (Turbopack) |

### Deliberately Not Used

No Redux/Zustand (React Context + `useSyncExternalStore`), no CSS-in-JS (Tailwind only), no third-party component library (custom UI primitives), no form library (native HTML forms), no agent-orchestration framework (direct SDK calls).

---

## Architecture

### System Boundaries

```
┌─────────────┐   fetch()    ┌──────────────────┐   Prisma   ┌──────────────┐
│   Browser   │ ───────────► │  Next.js App     │ ─────────► │  PostgreSQL  │
│  (React 19) │              │  Router (app/)   │            │  (prod)      │
│             │ ◄─────────── │                  │ ◄───────── │              │
└─────────────┘  JSON (API)  └──────────────────┘   JSON     └──────────────┘
                                  │        │                    PostgreSQL (dev & prod)
                        ┌─────────▼──┐  ┌──▼─────────┐
                        │  backend/  │  │  frontend/ │
                        │ services/  │  │ components │
                        └────────────┘  └────────────┘
```

### Layered Design

The codebase enforces strict layer ownership — the frontend never touches the database and the backend never ships to the client:

| Layer | Location | Responsibility |
|-------|----------|----------------|
| **Presentation** | `frontend/components/` | Client React components (`"use client"`), design-system primitives, dashboard tabs |
| **Application** | `app/` | Pages, layouts, and thin `app/api/*/route.ts` controllers |
| **Domain** | `backend/services/` + `frontend/lib/types/` | Business logic and shared DTOs (the integration seam) |
| **Infrastructure** | `backend/db.ts`, `database/` | Prisma client singleton, schema, seed scripts, raw data |

### Security Headers

Applied by `proxy.ts` + `next.config.ts` headers on every matched route:

| Header | Value |
|--------|-------|
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `X-XSS-Protection` | `1; mode=block` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` (production only) |
| `X-Request-ID` | Auto-generated per request |

---

## Data Flow

```
Client components
   │  frontend/lib/services/api.ts  (typed fetch wrappers)
   ▼
Next.js API routes  (app/api/*)     — validate input, call services
   │  backend/services/*            — business logic only, no controllers
   ▼
Prisma  →  PostgreSQL (prod) / PostgreSQL (dev & prod)
```

**Key invariants:**

- **Path aliases:** `@/*` → `frontend/*`, `~backend/*` → `backend/*`, `~tests/*` → `tests/*`.
- **Server-only enforcement:** `backend/` imports `"server-only"` so its code can never leak into client bundles.
- **Auth:** proxy (`proxy.ts`) guards `/dashboard` and `/login`; protected API routes call `getUserIdFromRequest()` and return `401` when there is no valid session.
- **No business logic in route handlers** — they parse, validate, delegate, and respond.
- **No server-side caching** — client-side `localStorage` persists dashboard state and theme; `fetch()` uses `cache: "no-store"`.

---

## Database Schema

### Entity Relationship Overview

```
User ─┬─ UserProgress        (1:1 — points, streak, accuracy, rank)
      ├─ Bookmark[]          (N:M — saved questions)
      ├─ QuestionAttempt[]   (N:1 — every answered question)
      ├─ MockTestResult[]    (N:1 — graded mock attempts)
      ├─ FlashcardReview[]   (N:M — SRS review log)
      ├─ StudyTask[]         (N:M — completable tasks)
      ├─ AppNotification[]   (N:M — per-user notifications)
      ├─ NotificationRead[]  (N:M — read markers)
      └─ UserSession[]       (N:M — JWT sessions)

Subject ─┬─ Topic[]          (recursive tree — 348 nodes)
          ├─ Question[]      (330+ questions)
          ├─ Flashcard[]     (SRS-enabled cards)
          └─ QuestionBankCategory[]

Topic (self-referencing tree)
  parentId → Topic.id         (depth 1–4)
  path: "Subject/Group/Leaf"  (full taxonomy path)
  questionCount               (denormalised subtree count)

ExamSchedule                  (real published exam dates)
FlashNews                     (exam news feed)
Recommendation                (performance-driven suggestions)
Badge                         (achievement badges — COMMON → LEGENDARY)
```

### All Models

| Model | Purpose |
|-------|---------|
| `User` | Accounts with roles (STUDENT/ADMIN), hashed passwords |
| `UserProgress` | Per-user gamification state (points, streak, accuracy, rank) |
| `UserSession` | JWT session tokens with expiry |
| `Subject` | 10 exam subjects (Bengali name + English name + icon) |
| `Topic` | Recursive syllabus tree (parent/child, path, depth, questionCount) |
| `Question` | MCQ items with options (JSON), correctAnswer, explanation, difficulty, year |
| `QuestionBankCategory` | Category labels + counts for the question bank |
| `ExamArchive` | Previous-year paper collections |
| `Flashcard` | SRS-enabled cards (easeFactor, interval, repetitions, nextReview) |
| `FlashcardReview` | Per-user review log (rating 0–3) |
| `StudyPlanDay` | Daily study plan container |
| `StudyTask` | Individual study tasks (priority, duration, completion state) |
| `DailyQuiz` | Daily quiz instances with grading |
| `QuizQuestion` | Questions within a daily quiz |
| `MockTest` | Mock test definitions |
| `MockTestQuestion` | Questions within a mock test |
| `MockTestResult` | Graded mock test attempts |
| `ExamSchedule` | Real published exam dates with countdown |
| `FlashNews` | Exam news items with read tracking |
| `Recommendation` | AI-generated study recommendations |
| `Badge` | Achievement badges (COMMON, RARE, EPIC, LEGENDARY) |
| `AppNotification` | In-app notifications with type |
| `NotificationRead` | Per-user read markers |
| `OfflinePack` | Downloadable offline content |
| `Document` | Syllabus PDFs, circulars, guides |
| `Bookmark` | Per-user saved questions |

> Full schema with all fields, indexes, and relations: [`docs/DATABASE.md`](./docs/DATABASE.md)

---

## Content & Taxonomy

All content is **seeded from `database/data/`** into the database — the syllabus explorer, question bank, mock tests, flashcards, and news feeds render live data, never hardcoded fixtures.

### Topic Taxonomy

- **10 subjects → 348 nodes → 284 leaves** mirroring the official BCS syllabus structure.
- Encoded in `database/data/taxonomy.json` and persisted as a recursive `Topic` tree (`parentId`, `slug`, `path`, `depth`, `sortOrder`).
- A node with children is a group; a leaf node is a question bucket.
- English extends to **depth 4**.

### Question Sourcing (330+ questions)

- **Folder-structured import** — files under `database/data/ques/<Subject>/<Node>/…/*.txt` are tagged with the exact leaf path from their folder hierarchy (the folder path *is* the taxonomy).
- **Flat import** — `questions_database.txt` is distributed round-robin across taxonomy leaves by `scripts/seed-questions.ts`.
- Every question carries its full content `path` and a `topicId` FK to its leaf topic, enabling path-based filtering and per-topic aggregated `questionCount`s.

### Unicode Hardening

All Bengali name matching is **NFC-normalised**, so composed/decomposed forms always resolve.

### Idempotent Seeding

The Vercel `prebuild` hook runs `npm run db:deploy-sync`: a non-destructive schema push (`db push` without `--accept-data-loss` — destructive changes fail the deploy loudly) followed by the idempotent seed.

### Exam Selection Model

The custom exam engine (`backend/services/exam.ts`) serves a recursive selection tree via `POST /api/exam/config`. Clients select any combination of subject / topic / subtopic nodes:

- `paths: []` selects a whole subject; otherwise questions are drawn from the **union of the selected nodes' subtrees**.
- Each selected subject carries its own `count` (clamped to availability); the total is the sum, with largest-remainder allocation when counts are omitted.
- `GET /api/questions?paths=…` exposes the same path-eligibility semantics for the question bank.
- The engine is **deterministic** (seeded random), never leaks `correctAnswer`/`explanation` in the build response, and reports `shortfall` when a selection cannot be fully sourced.

---

## AI System

Two direct endpoints — no agent loops, no orchestration frameworks.

| Endpoint | Model | Behaviour |
|----------|-------|-----------|
| `POST /api/ai/tutor` | `openai/gpt-oss-120b` (Groq) | Streaming global assistant; `searchWeb()` (Tavily, top-5) grounds factual claims when `TAVILY_API_KEY` is set; retries on empty output; exposes `X-AI-Source: groq+web / groq / mock` |
| `POST /api/ai/solver` | `claude-sonnet-4-6` (Anthropic) | Returns `{ solution, steps, source }` for text or base64 image input; falls back to raw text if JSON parsing fails |

### Design Decisions

- **No knowledge-base grounding** for the tutor: a prior KB-injection design anchored the model to weak matches and caused factual slips, so the tutor answers from its own knowledge, optionally grounded in live web snippets, with a persona that says so when unsure.
- **Mock fallbacks** are clearly labelled and let the whole app run with zero external dependencies for local dev and CI.
- Prompts live inline in the route handlers; full details in [`docs/AI-SYSTEM.md`](./docs/AI-SYSTEM.md).

---

## Authentication & Security

### Auth Flow

```
POST /api/auth/login { email, password }
   │  bcryptjs verify → jose JWT sign
   ▼
Set-Cookie: auth_token=…; HttpOnly; SameSite=Lax; Secure (prod); Max-Age=604800
   │
   ▼
GET /api/auth/me  →  verifies JWT from cookie → returns sanitized user
   │
   ▼
POST /api/auth/logout  →  clears cookie
```

### Security Model

| Layer | Implementation |
|-------|---------------|
| **Session storage** | JWT in HttpOnly cookies — no client-side token storage, no XSS token theft |
| **Password hashing** | `bcryptjs` (cost 10) |
| **Secrets** | `process.env` only — never committed (`.env.local` gitignored) |
| **SQL injection** | Prisma parameterises all queries — no raw SQL concatenation |
| **Middleware guards** | `/dashboard` and `/login` protected by cookie check; redirect on mismatch |
| **API auth** | Protected routes call `getUserIdFromRequest()`, return `401` if no valid session |
| **AI safety** | LLM output is **never** used for authorization, validation, or security decisions |
| **Rate limiting** | Custom token bucket on AI endpoints (configurable `RATE_LIMIT_MAX_REQUESTS` / `RATE_LIMIT_WINDOW_MS`) |
| **Production hardening** | Security headers, `Strict-Transport-Security`, `secure` cookies |

---

## API Reference

All endpoints live under `/api/*`. Auth-protected routes require the `auth_token` HttpOnly cookie.

### Authentication

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/login` | — | Authenticate `{ email, password }`, set cookie |
| POST | `/api/auth/register` | — | Create account `{ name, email, password }`, set cookie |
| GET | `/api/auth/me` | ✓ | Return current user or `401` |
| POST | `/api/auth/logout` | — | Clear session cookie |
| POST | `/api/auth/refresh` | ✓ | Re-issue JWT, extend cookie |

### Content

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/questions` | — | List questions, filterable by `subject`, `topic`, `difficulty`, `q`, `limit`, `paths` |
| GET | `/api/flashcards` | — | List flashcards, filterable by `subject` |
| GET | `/api/flash-news` | — | List flash news items |
| GET | `/api/recommendations` | — | List AI recommendations |
| GET | `/api/badges` | — | List achievement badges |
| GET | `/api/documents` | — | List documents (syllabus, circulars) |
| GET | `/api/exam-schedule` | — | List published exam dates |
| GET | `/api/question-bank/categories` | — | List question bank categories |

### Practice & Exams

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/exam/config` | — | Custom exam selection tree (subjects → topics → subtopics) |
| POST | `/api/exam/build` | — | Build custom BCS-style exam |
| POST | `/api/exam/submit` | ✓ | Grade + persist custom exam |
| GET | `/api/daily-quiz` | — | Get today's quiz |
| POST | `/api/daily-quiz/submit` | ✓ | Grade + persist daily quiz |
| GET | `/api/mock-test/results` | ✓ | Caller's recent mock test results |
| POST | `/api/practice/submit` | ✓ | Grade practice answers |

### User State

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/dashboard-stats` | ✓ | Points, streak, rank, 7-day activity |
| GET | `/api/subject-reports` | ✓ | Per-subject accuracy reports from attempts |
| PATCH | `/api/progress` | ✓ | Patch user progress (whitelisted fields) |
| GET | `/api/bookmarks` | ✓ | Get bookmarked question IDs |
| POST | `/api/bookmarks` | ✓ | Toggle bookmark `{ questionId }` |
| GET | `/api/study-plan` | ✓ | List study plan tasks |
| POST | `/api/study-plan/tasks/:id/toggle` | ✓ | Toggle task completion |
| GET | `/api/notifications` | ✓ | List notifications with per-user read state |
| POST | `/api/notifications/:id/read` | ✓ | Mark notification read |

### AI

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/ai/tutor` | — | Streaming chat `{ messages: [{ role, content }] }` |
| POST | `/api/ai/solver` | — | Solve question `{ text?, imageBase64?, subject? }` |

> Full request/response shapes: [`docs/API.md`](./docs/API.md)

---

## Design System

### Visual Identity

- **Theme:** Dark terminal/emerald aesthetic — deep `#05070c` background, `emerald-500` accent
- **Typography:** Space Grotesk (display), Inter (body), JetBrains Mono (code)
- **Surfaces:** Glass morphism (`glass`, `glass-card`), noise texture overlay, aurora gradient background

### Design Tokens

| Token | Usage |
|-------|-------|
| `cosmic-bg` | Fixed ambient background layer (aurora radial gradients + masked grid) |
| `noise` | Film-grain overlay for premium texture |
| `glass` / `glass-card` | Translucent surfaces with backdrop blur |
| `text-gradient` | Emerald → cyan → indigo gradient headlines |
| `glow-border` | Animated gradient ring around primary CTAs |
| `section-eyebrow` | Mono uppercase eyebrow labels |

### Custom UI Primitives

| Component | File | Purpose |
|-----------|------|---------|
| `ErrorBoundary` | `frontend/components/ui/ErrorBoundary.tsx` | Class-based error boundary |
| `AnimatedList` | `frontend/components/ui/AnimatedList.tsx` | Staggered list (reduced-motion aware) |
| `Reveal` | `frontend/components/ui/Reveal.tsx` | Scroll-reveal wrapper (fade + rise + blur) |
| `SpotlightCard` | `frontend/components/ui/SpotlightCard.tsx` | Cursor-tracked radial spotlight (GPU-only) |
| `SectionHeading` | `frontend/components/ui/SectionHeading.tsx` | Eyebrow + title + description block |
| `StatusPill` | `frontend/components/ui/StatusPill.tsx` | Live status indicator with pulsing dot |
| `ScrollProgress` | `frontend/components/ui/ScrollProgress.tsx` | Fixed top scroll-progress bar |

### Animation

- **Library:** Framer Motion with global `MotionConfig reducedMotion="user"`.
- **Page transitions:** Fade/slide in `app/template.tsx` (every route).
- **Dashboard tabs:** `AnimatePresence mode="wait"` keyed by active tab.
- **Micro-interactions:** `whileHover` / `whileTap` springs on CTAs, nav links, cards.
- **Performance:** Only GPU-accelerated properties (`opacity`, `transform`); scroll reveals use `viewport={{ once: true }}`.

### Accessibility

- Semantic HTML (`button`, `a`), focus-visible rings, ARIA-labelled icon buttons.
- Dialog focus traps (NotificationCenter, DailyQuizWidget, VoiceAITutor).
- Touch targets ≥44px on mobile; WCAG 2.2 pointer targets ≥24px on web.
- `prefers-reduced-motion` respected globally.
- `viewport-fit=cover` + `pt-safe`/`pb-safe` for iOS safe areas.

> Full design system documentation: [`docs/DESIGN-SYSTEM.md`](./docs/DESIGN-SYSTEM.md)

---

## Development Workflow

### Branch Strategy

```
main ─────────────────────────────────── production
  └── feature/short-description ──────── development
        └── fix/short-description ────── bugfixes
```

### Change Workflow

```
UNDERSTAND
  ↓  Read the relevant code + docs
INSPECT
  ↓  Check tests, types, and existing patterns
PLAN
  ↓  Make a minimal, reversible change
IMPLEMENT
  ↓  Follow conventions exactly
TEST
  ↓  Run relevant tests + lint + typecheck
VERIFY
  ↓  Confirm the app still builds and runs
DOCUMENT
  ↓  Update docs if behavior changed
```

### Code Conventions

| Convention | Rule |
|-----------|------|
| **TypeScript** | Strict mode; `camelCase` variables, `PascalCase` components/types, `UPPER_SNAKE_CASE` constants |
| **Styling** | Tailwind CSS v4 utility classes; design tokens via `--font-*` CSS variables |
| **Server-only** | `backend/` imports `"server-only"` — never leaks to client bundles |
| **Client components** | `frontend/components/` are client components (`"use client"`) |
| **Data flow** | Client → `frontend/lib/services/api.ts` → `app/api/*` → `backend/services/*` → Prisma |
| **API responses** | `NextResponse.json()` for all JSON; auth routes call `getUserIdFromRequest()` |
| **Route handlers** | Parse, validate, delegate, respond — no business logic |
| **Dependencies** | Check existing deps first; new ones must be justified in `docs/DECISIONS.md` |

### Pre-commit Checklist

Every change must pass all four gates before pushing:

```bash
npm run typecheck    # tsc --noEmit
npm run lint         # ESLint
npm run test         # Vitest
npm run build        # Production build
```

---

## Getting Started

### Prerequisites

- **Node.js 20+** and npm
- **PostgreSQL** (required in dev AND prod — the schema is postgresql-only)

### Quick Start

> **Prerequisite:** a PostgreSQL server (the Prisma schema is
> `provider = "postgresql"` — SQLite is NOT supported). Local Docker works:
> `docker run -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16`

```bash
# 1. Clone the repository
git clone https://github.com/your-org/9th-grade-ai-next.git
cd 9th-grade-ai-next

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.local.example .env.local
#   AUTH_SECRET:  openssl rand -base64 32
#   DATABASE_URL: postgresql://postgres:postgres@localhost:5432/ninth_grade_ai

# 4. Create + seed the database
npm run db:push
npm run db:seed

# 5. Start the dev server
npm run dev
```

Open **http://localhost:3000**. Local dev seeding creates a demo account:
**`demo@9thgrade.ai` / `demo12345`** (never created in production builds).

> Without AI keys, the Tutor and Solver return clearly-labelled mock responses — the app runs end-to-end with zero external dependencies.

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `AUTH_SECRET` | Yes | — | JWT signing secret (`openssl rand -base64 32`) |
| `DATABASE_URL` | Yes | `file:./dev.db` | Prisma database URL (PostgreSQL in production) |
| `ANTHROPIC_API_KEY` | No | — | Enables the AI Solver (mock fallback if unset) |
| `GROQ_API_KEY` | No | — | Enables the AI Tutor (mock fallback if unset) |
| `TAVILY_API_KEY` | No | — | Web-search grounding for the tutor |
| `NEXT_PUBLIC_APP_URL` | No | `http://localhost:3000` | Public app origin |
| `NEXT_PUBLIC_API_URL` | No | `http://localhost:3000` | Public API origin |
| `REDIS_URL` | Prod: Yes | — | Distributed rate limiting (Upstash/Redis); see ADR-0009 |
| `RL_LOGIN_PER_MIN` | No | `5` | Login attempts per IP per minute |
| `RL_LOGIN_ACCOUNT_PER_HOUR` | No | `10` | Attempts per account per hour (hashed key) |
| `RL_AI_PER_MIN` / `RL_AI_DAILY` | No | `10` / `60` | AI request budgets per user |
| `RL_SUBMIT_PER_MIN` | No | `30` | Graded submissions per user per minute |
| `TRUST_CLIENT_IP` | No | `true` | Set `false` when not behind a sanitizing proxy |

---

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start the dev server (Turbopack) |
| `npm run build` | Production build |
| `npm run start` | Start the production server |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run test` | Vitest (single run) |
| `npm run test:watch` | Vitest watch mode |
| `npm run test:coverage` | Vitest with Istanbul coverage report |
| `npm run format` | Prettier write |
| `npm run format:check` | Prettier check |
| `npm run analyze` | Build with bundle analyzer |
| `npm run db:push` | Sync Prisma schema to the DB |
| `npm run db:seed` | Idempotent content seed |
| `npm run db:seed-questions` | Import questions + rebuild the topic tree |
| `npm run db:seed-users` | Re-seed users (resets user accounts) |
| `npm run db:sync` | Push schema + reseed (local convenience) |
| `npm run db:deploy-sync` | Schema push + seed used by the Vercel prebuild hook (non-destructive, fails closed) |
| `npm run db:reset` | Force-reset + reseed with fresh users |
| `npm run db:clean` | Clear seed-managed content tables |
| `npm run db:studio` | Open Prisma Studio (visual DB browser) |

---

## Project Structure

```
/
├── app/                        # Next.js App Router
│   ├── api/                    # Route handlers — the backend seam
│   │   ├── ai/                 # /api/ai/tutor, /api/ai/solver, _search.ts
│   │   ├── auth/               # /api/auth/login, register, me, logout, refresh
│   │   ├── exam/               # /api/exam/config, build, submit
│   │   ├── daily-quiz/         # /api/daily-quiz, submit
│   │   ├── mock-test/          # /api/mock-test/results
│   │   ├── practice/           # /api/practice/submit
│   │   ├── questions/          # /api/questions (path-filtered)
│   │   ├── bookmarks/          # /api/bookmarks (toggle)
│   │   ├── study-plan/         # /api/study-plan, tasks/:id/toggle
│   │   ├── notifications/      # /api/notifications, :id/read
│   │   ├── dashboard-stats/    # /api/dashboard-stats
│   │   ├── subject-reports/    # /api/subject-reports
│   │   ├── progress/           # /api/progress
│   │   ├── flashcards/         # /api/flashcards
│   │   ├── flash-news/         # /api/flash-news
│   │   ├── recommendations/    # /api/recommendations
│   │   ├── badges/             # /api/badges
│   │   ├── documents/          # /api/documents
│   │   ├── exam-schedule/      # /api/exam-schedule
│   │   ├── question-bank/      # /api/question-bank/categories
│   │   └── _middleware.ts      # API-level middleware
│   ├── (auth)/                 # Login group
│   ├── (dashboard)/            # Protected dashboard group
│   ├── layout.tsx              # Root layout (fonts, providers, cosmic-bg)
│   ├── template.tsx            # Page transition wrapper (fade/slide)
│   ├── globals.css             # Design tokens, surfaces, Tailwind config
│   ├── page.tsx                # Landing page
│   ├── error.tsx               # Error boundary
│   ├── loading.tsx             # Loading state
│   ├── not-found.tsx           # 404 page
│   ├── opengraph-image.tsx     # OG image generation
│   ├── robots.ts               # Robots.txt
│   └── sitemap.ts              # Sitemap generation
├── backend/                    # Server-only code (imports "server-only")
│   ├── auth.ts                 # JWT session management (jose)
│   ├── db.ts                   # PrismaClient singleton
│   ├── errors.ts               # Typed error classes
│   ├── rate-limit.ts           # Token bucket rate limiter
│   ├── validation.ts           # Input validation helpers
│   └── services/               # Business logic (no controllers)
│       ├── activity.ts         # Progress, streaks, activity tracking
│       ├── content.ts          # Read operations for content
│       ├── exam.ts             # Exam engine (selection, build, grade)
│       └── user.ts             # User CRUD, auth helpers
├── frontend/                   # Client-side code
│   ├── components/
│   │   ├── ui/                 # Shared primitives (ErrorBoundary, AnimatedList, Reveal, ...)
│   │   └── dashboard/          # Dashboard tab components (+ TopicTreePicker)
│   └── lib/
│       ├── services/           # api.ts (typed fetch wrappers)
│       ├── data/               # Static/mock data + seed-derived constants
│       ├── auth-ctx/           # React context for auth state
│       ├── store-ctx/          # Dashboard state (useSyncExternalStore)
│       ├── theme-ctx/          # Theme context
│       ├── transitions/        # Framer Motion transition presets
│       └── types/              # Shared TypeScript types (client + server DTOs)
├── database/                   # Database layer
│   ├── prisma/
│   │   ├── schema.prisma       # Single source of truth for DB schema
│   │   └── seed.ts             # Idempotent seed script
│   └── data/                   # Raw seed data
│       ├── taxonomy.json       # Recursive topic taxonomy
│       ├── ques/               # Folder-structured questions + flat import
│       ├── bcs_syllabus/       # Syllabus documents
│       └── users.json          # User accounts (gitignored, optional)
├── tests/                      # Vitest tests
│   ├── setup.ts                # Global test setup
│   ├── mocks/                  # Mock modules (server-only, etc.)
│   ├── unit/                   # Backend unit tests
│   │   └── backend/            # exam, questions, web-search
│   ├── *.test.tsx              # Component tests
│   └── *.test.ts               # Integration tests
├── scripts/                    # Maintenance scripts
│   ├── seed-questions.ts       # Question import + taxonomy rebuild
│   ├── taxonomy.ts             # Taxonomy helpers
│   └── clear-content.ts        # Clean seed-managed tables
├── docs/                       # Canonical documentation (14 files)
├── public/                     # Static assets
├── proxy.ts                     # Edge proxy — auth guards, security headers
├── vitest.config.ts            # Test configuration
├── eslint.config.mjs           # Lint configuration
├── postcss.config.mjs          # PostCSS + Tailwind
├── tsconfig.json               # TypeScript configuration
├── next.config.ts              # Next.js configuration
└── package.json                # Scripts, dependencies, Prisma seed config
```

---

## Testing & Quality

### Test Suite

| File | Type | What It Tests |
|------|------|---------------|
| `tests/unit/backend/exam.test.ts` | Unit | Exam selection/grading engine |
| `tests/unit/backend/questions.test.ts` | Unit | `getQuestions` path filtering |
| `tests/unit/backend/web-search.test.ts` | Unit | Tavily web-search helper |
| `tests/CustomExamTab.test.tsx` | Component | Custom exam builder |
| `tests/MockTestTab.test.tsx` | Component | Mock test builder |
| `tests/NewFeatures.test.tsx` | Component | StudyPlanner, Flashcards, MockTest, AISolver, DailyQuiz, Notifications, OfflineMode, ThemeToggle |
| `tests/AuthExperience.test.tsx` | Component | Auth flow experience |
| `tests/LogoutFarewell.test.tsx` | Component | Logout farewell screen |
| `tests/SettingsTab.test.tsx` | Component | Settings tab |

### Quality Gates

Every push must pass:

```bash
npm run lint          # 0 errors
npm run typecheck     # tsc --noEmit
npm run test          # All tests green
npm run build         # Production build succeeds
```

### Coverage Thresholds

| Metric | Threshold |
|--------|-----------|
| Lines | 41% |
| Functions | 40% |
| Branches | 37% |

Enforced in CI via `npm run test -- --run --coverage`. The thresholds are set
to actual current coverage and must be **ratcheted up** (never lowered) as
tests land.

### CI

CI runs `typecheck`, `lint`, `test` (with enforced coverage against a real
Postgres 16 service container, so the raw-SQL integration test runs), and
`build` on every push/PR (`.github/workflows/ci.yml`). Node 22.

---

## Deployment

### Vercel (Recommended)

```bash
# Automatic on push to main
# prebuild hook runs: npm run db:deploy-sync (when VERCEL=1)
# Schema push + idempotent seed on every deploy
```

**Live:** [https://9-delta-ten.vercel.app](https://9-delta-ten.vercel.app)

### Manual Production Build

```bash
npm run build
npm run start         # PORT env var (default 3000)
```

### Production Database

1. Provision PostgreSQL (Neon, Supabase, AWS RDS, Railway).
2. Set `DATABASE_URL` in your environment.
3. Run `npm run db:push && npm run db:seed` (or rely on Vercel prebuild).

### Hosting Options

| Platform | Status |
|----------|--------|
| **Vercel** | Recommended — zero-config Next.js |
| **Railway** | Supported — PostgreSQL + Node.js |
| **Render** | Supported — Docker or Node.js |
| **Docker** | Not currently configured |

---

## Roadmap

- [ ] **E2E tests** — Playwright or Cypress for critical user flows
- [ ] **API integration tests** — Cover all `/api/*` route handlers
- [ ] **Admin dashboard** — Content management for questions, syllabus, news
- [ ] **Docker setup** — Containerised local dev and deployment
- [ ] **Structured logging** — Replace `console.error` with a logging library
- [ ] **Monitoring** — Vercel Analytics or Sentry integration
- [ ] **RBAC** — Admin role features beyond the current `STUDENT`/`ADMIN` enum
- [ ] **AI knowledge base v2** — pgvector embeddings on Railway Postgres for precision retrieval
- [ ] **Offline mode** — Service worker for fully offline exam practice
- [ ] **Performance testing** — Lighthouse CI, bundle size tracking

---

## Documentation

The `docs/` directory is the canonical reference:

| Document | Contents |
|----------|----------|
| [`ARCHITECTURE.md`](./docs/ARCHITECTURE.md) | System boundaries, layers, auth flow |
| [`TECH-STACK.md`](./docs/TECH-STACK.md) | Full technology inventory |
| [`DATABASE.md`](./docs/DATABASE.md) | Every Prisma model, relationship, and index |
| [`API.md`](./docs/API.md) | All endpoints, request/response shapes |
| [`AI-SYSTEM.md`](./docs/AI-SYSTEM.md) | Providers, models, prompts, failure modes |
| [`PRODUCT.md`](./docs/PRODUCT.md) | Feature matrix and target users |
| [`DECISIONS.md`](./docs/DECISIONS.md) | Architecture decision records (ADRs) |
| [`DESIGN-SYSTEM.md`](./docs/DESIGN-SYSTEM.md) | Design tokens, components, accessibility |
| [`TESTING.md`](./docs/TESTING.md) | Test strategy, coverage, CI |
| [`SECURITY.md`](./docs/SECURITY.md) | Threat model, auth, secrets |
| [`DEPLOYMENT.md`](./docs/DEPLOYMENT.md) | Build, host, database setup |
| [`DEVELOPMENT.md`](./docs/DEVELOPMENT.md) | Local dev guide |
| [`DOMAIN.md`](./docs/DOMAIN.md) | Domain model reference |
| [`CHANGELOG.md`](./docs/CHANGELOG.md) | Version history |

---

## Contributing

We welcome contributions! Please read [CONTRIBUTING.md](./CONTRIBUTING.md) and our [Code of Conduct](./CODE_OF_CONDUCT.md).

### Quick Start for Contributors

```bash
git clone https://github.com/your-org/9th-grade-ai-next.git
cd 9th-grade-ai-next
npm install
cp .env.local.example .env.local
npm run db:push && npm run db:seed
npm run dev
```

### Branch Naming

| Pattern | Use |
|---------|-----|
| `feature/short-description` | New features |
| `fix/short-description` | Bug fixes |
| `docs/short-description` | Documentation only |
| `refactor/short-description` | Code structure changes |

### Pull Request Process

1. Fork the repo and create a branch: `git checkout -b feature/short-description`.
2. Make your change. Keep it focused.
3. Run the quality gates: `npm run typecheck && npm run lint && npm run test`.
4. Open a Pull Request describing the *why* and the *what*. Link any related issue.
5. Before adding a dependency or a new architecture piece, check [`docs/DECISIONS.md`](./docs/DECISIONS.md) — the project prefers extending existing seams over inventing new ones.

### Adding Content

Add questions and syllabus content to the **database**, not to static files. Extend `database/prisma/seed.ts` or `scripts/seed-questions.ts` for bulk loads. Do not reintroduce `localStorage`-only data stores in the dashboard.

---

## License

[MIT](./LICENSE) — free for anyone to use, modify, and distribute.

Copyright (c) 2026 9Th-Grade AI contributors.

---

<div align="center">

**Built with care for Bangladeshi exam aspirants.**

[Report Bug](https://github.com/your-org/9th-grade-ai-next/issues) · [Request Feature](https://github.com/your-org/9th-grade-ai-next/issues) · [Read the Docs](./docs/)

</div>
 

