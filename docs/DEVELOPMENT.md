# Development

## Prerequisites

- Node.js 18+ (recommended 20+)
- npm
- SQLite (included with dev database file)

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Copy environment file
cp .env.local.example .env.local

# 3. Generate AUTH_SECRET (for production; dev can use any string)
openssl rand -base64 32

# 4. Sync database schema
npm run db:push

# 5. Seed database
npm run db:seed

# 6. Start dev server
npm run dev
```

Open http://localhost:3000.

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `AUTH_SECRET` | Yes | — | JWT signing secret |
| `DATABASE_URL` | Yes | `file:./dev.db` | Prisma database URL |
| `ANTHROPIC_API_KEY` | No | — | AI Tutor/Solver (mock fallback if empty) |
| `PORT` | No | `3000` | Dev server port |

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server (Turbopack) |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run test` | Vitest |
| `npm run format` | Prettier write |
| `npm run format:check` | Prettier check |
| `npm run db:push` | Sync Prisma schema to DB |
| `npm run db:seed` | Seed content into DB |
| `npm run db:reset` | Reset + reseed DB |
| `npm run db:studio` | Open Prisma Studio |
| `npm run storybook` | Component / design-system reference |

## Database

### Schema Changes

Edit `database/prisma/schema.prisma`, then run:

```bash
npm run db:push
```

### Seeding

```bash
npm run db:seed
```

Idempotent — safe to run repeatedly.

### Seeding Questions

```bash
npx tsx scripts/seed-questions.ts
```

Parses `database/data/ques/questions_database.txt` and inserts questions linked to subjects.

## Troubleshooting

- **"AUTH_SECRET is not set"**: Copy `.env.local.example` to `.env.local` and set `AUTH_SECRET`.
- **"too many connections"**: `backend/db.ts` uses a singleton pattern to avoid this.
- **Storybook fails**: Ensure `@storybook/*` dependencies are installed.
