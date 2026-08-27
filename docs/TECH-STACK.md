# Tech Stack

## Core

| Layer | Technology | Version | Notes |
|-------|-----------|---------|-------|
| Framework | Next.js | 16.3.1 | App Router, React Server Components |
| UI Library | React | 19.2.8 | Client components in `frontend/components/` |
| Language | TypeScript | 5 | Strict mode enabled |
| Styling | Tailwind CSS | 4 | Utility classes, design tokens via CSS variables |
| Animation | Framer Motion | 13.1.0 | Page transitions, micro-interactions |
| Icons | Lucide React | 1.31.0 | Consistent icon set |

## Backend

| Component | Technology | Notes |
|-----------|-----------|-------|
| ORM | Prisma | 6.5.0 |
| Database (dev) | SQLite | File-based, zero-config |
| Database (prod) | PostgreSQL | Drop-in swap via `DATABASE_URL` |
| Auth | jose | 6.2.9 JWT signing/verification |
| Password Hashing | bcryptjs | 3.0.3, cost 10 |

## AI

| Component | Technology | Notes |
|-----------|-----------|-------|
| AI Provider (primary) | Groq | `openai/gpt-oss-120b` (`AI_GROQ_MODEL`) for tutor/assistant |
| AI Provider (fallback) | Anthropic | `claude-sonnet-4-6` (`AI_ANTHROPIC_MODEL`) for solver + vision |
| Runtime failover | ModelRouter (`resolveModelCandidates`) | Groq → Anthropic → Mock, tried per-request on provider error |
| AI SDK | Vercel AI SDK | `ai` + `@ai-sdk/groq` + `@ai-sdk/anthropic` |
| Streaming | `provider.stream` | All of tutor / solver / assistant stream token-by-token |
| Response cache | `backend/ai/infrastructure/ai-cache` | In-memory or Redis; serves repeated questions as `source: "cache"` |
| Fallback | Mock responses | Labelled `source: "mock"` |

## Testing

| Component | Technology | Notes |
|-----------|-----------|-------|
| Test Runner | Vitest | 3.0.0 |
| DOM Testing | Testing Library | `@testing-library/react`, `@testing-library/dom` |
| Environment | jsdom | 29.1.1 |

## Tooling

| Component | Technology | Notes |
|-----------|-----------|-------|
| Linting | ESLint | 9, with `eslint-config-next` |
| Formatting | Prettier | 3.3.0 |
| Type Checking | tsc | `tsc --noEmit` |
| Package Manager | npm | `package-lock.json` present |
| Dev Server | Next.js dev | Turbopack enabled |

## Path Aliases

| Alias | Resolves to |
|-------|-------------|
| `@/*` | `./frontend/*` |
| `~backend/*` | `./backend/*` |
| `~tests/*` | `./tests/*` |

## Not Used

- No Redux, Zustand, or external state management (React Context + `useSyncExternalStore`).
- No CSS-in-JS (Tailwind only).
- No component library (custom UI primitives).
- No form library (native HTML forms).
