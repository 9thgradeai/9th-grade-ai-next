# Architecture

## System Boundaries

```
┌─────────────┐     fetch()      ┌──────────────────┐     Prisma      ┌──────────────┐
│   Browser   │ ───────────────► │  Next.js App     │ ───────────────► │  SQLite /    │
│  (React 19) │                  │  Router (app/)   │                  │  PostgreSQL  │
│             │ ◄────────────── │                  │ ◄────────────── │              │
└─────────────┘   JSON (API)     └──────────────────┘   JSON (DB)     └──────────────┘
                                     │        │
                                     │        │
                              ┌──────▼──┐ ┌───▼────────┐
                              │ backend │ │  frontend  │
                              │ services│ │ components │
                              └─────────┘ └────────────┘
```

## Layers

### Presentation (`frontend/components/`)
- Client-side React components.
- Consume data via `frontend/lib/services/api.ts`.
- State managed through React Contexts (`auth-ctx`, `theme-ctx`, `store-ctx`).

### Application (`app/`)
- Next.js App Router pages, layouts, and route handlers.
- `app/api/*/route.ts` are thin controllers.
- `app/dashboard/*` is a protected route group.
- `app/(auth)/*` handles login.

### Domain (`backend/services/` + `frontend/lib/types/`)
- `backend/services/content.ts`: read operations for content.
- `backend/services/user.ts`: user state, auth helpers.
- `frontend/lib/types/`: shared DTOs between client and server.

### Infrastructure (`backend/db.ts`, `database/`)
- Prisma ORM with SQLite (dev) and PostgreSQL (prod).
- Schema in `database/prisma/schema.prisma`.
- Seed in `database/prisma/seed.ts`.
- Raw data in `database/data/`.

## Authentication Flow

1. Client sends `POST /api/auth/login` with `{ email, password }`.
2. Server verifies password via `bcryptjs`, signs JWT via `jose`.
3. Server sets `auth_token` HttpOnly cookie (7-day expiry, SameSite=Lax).
4. Client stores no token; subsequent requests rely on the cookie.
5. `GET /api/auth/me` verifies the JWT and returns the sanitized user.
6. `POST /api/auth/logout` clears the cookie.

## Authorization

- Middleware (`backend/middleware.ts`) guards `/dashboard` and `/login`.
- Protected API routes call `getUserIdFromRequest()` and return `401` if no valid session.

## External Services

- **Anthropic Claude** (`@ai-sdk/anthropic`): AI Tutor and Solver.
- **Vercel AI SDK** (`ai`): streaming text generation.
- No other external services.

## Caching

- No server-side caching layer.
- Client-side `localStorage` persists dashboard state and theme.
- `fetch()` uses `cache: "no-store"` in `api.ts`.

## Storage

- **Database**: Prisma + SQLite (dev) / PostgreSQL (prod).
- **Static assets**: `public/`.
- **Seed data**: `database/data/`.

## Deployment Architecture

- Single Next.js application.
- Server components + API routes + client components in one deployable unit.
- Environment variables: `AUTH_SECRET`, `DATABASE_URL`, `ANTHROPIC_API_KEY`.
