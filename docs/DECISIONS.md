# Architecture Decision Records

## ADR-001: Next.js App Router

- **Date**: 2024
- **Status**: Accepted
- **Context**: Choosing a React framework for a full-stack app with API routes.
- **Decision**: Use Next.js 16 App Router.
- **Rationale**: Native React Server Components, built-in API routes, excellent TypeScript support, strong ecosystem.
- **Consequences**: Requires learning App Router conventions; some client-side patterns differ from Pages Router.

## ADR-002: Prisma + SQLite (Dev) / PostgreSQL (Prod)

- **Date**: 2024
- **Status**: Accepted
- **Context**: Need a database that works locally without setup and scales in production.
- **Decision**: Prisma ORM with SQLite for development and PostgreSQL for production.
- **Rationale**: Zero-config local dev with SQLite; PostgreSQL is the production standard. Prisma provides type-safe queries and easy schema migrations (push-based).
- **Consequences**: No migration files; schema is pushed directly. SQLite has limitations (no full PostgreSQL feature parity), but the schema is simple enough.

## ADR-003: JWT Auth with HttpOnly Cookies

- **Date**: 2024
- **Status**: Accepted
- **Context**: Need server-side authentication without client-side token storage.
- **Decision**: JWT sessions via `jose`, stored in HttpOnly SameSite=Lax cookies.
- **Rationale**: Secure by default (no XSS token theft), no client-side storage, 7-day expiry.
- **Consequences**: No token refresh mechanism; 7-day sessions. No revocation list (stateless JWT).

## ADR-004: Vercel AI SDK for AI Features

- **Date**: 2024
- **Status**: Accepted
- **Context**: Need streaming AI chat and structured output for exam prep.
- **Decision**: Use `ai` (Vercel AI SDK) + `@ai-sdk/anthropic`.
- **Rationale**: First-class Next.js integration, streaming support, structured output helpers.
- **Consequences**: Tied to Vercel AI SDK API; model changes require code updates.

## ADR-005: Tailwind CSS v4

- **Date**: 2024
- **Status**: Accepted
- **Context**: Need a utility-first CSS framework with design tokens.
- **Decision**: Tailwind CSS v4 with CSS variable design tokens.
- **Rationale**: Latest version, improved performance, CSS-first configuration.
- **Consequences**: Some v3 plugins may not be compatible; documentation may lag.

## ADR-006: Mock AI Fallback

- **Date**: 2024
- **Status**: Accepted
- **Context**: Developers need to run the app without an Anthropic API key.
- **Decision**: Return clearly-labelled mock responses (`source: "mock"`) when `ANTHROPIC_API_KEY` is unset.
- **Rationale**: Zero external dependencies for local dev and CI.
- **Consequences**: Mock responses are not realistic; developers may forget to set the API key.

## ADR-007: Path Aliases

- **Date**: 2024
- **Status**: Accepted
- **Context**: Clean imports across frontend, backend, and tests.
- **Decision**: `@/*` → `frontend/*`, `~backend/*` → `backend/*`, `~tests/*` → `tests/*`.
- **Rationale**: Clear ownership of code by layer; avoids deep relative imports.
- **Consequences**: Requires `tsconfig.json` paths configuration; some tools may not resolve aliases automatically.
