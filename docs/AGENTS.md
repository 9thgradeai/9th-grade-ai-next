# AI Agents & Agentic Development

> This project was built with **AI agentic development** — multiple AI coding agents work in this repository against a shared contract. This document explains **how the development agents are connected and coordinated**, and points to the docs for the separate **in-app AI agent system** (the study coach that ships to users).

---

## 1. Two Kinds of "Agents" in This Repo

| Kind | What it is | Where it lives | Docs |
|------|------------|----------------|------|
| **Development agents** | AI coding assistants (Claude Code, OpenCode, Cursor, Windsurf, Jetro, …) used to build the app | Root instruction files + per-tool dot-directories | **This document** |
| **In-app AI agent** | The study-coach agent loop served to users via `/api/ai/agent` | `backend/ai/agent/**`, `app/api/ai/agent` | `AI_AGENT_ARCHITECTURE_AUDIT.md`, `AI_AGENT_API_CONTRACT.md`, `AI_AGENT_TOOL_REGISTRY.md`, `AI_AGENT_IMPLEMENTATION_PLAN.md` |

The two never mix: development-agent config must never affect runtime behavior, and in-app agent output is never trusted for security decisions (FR-AI-07).

## 2. The Shared Agent Contract

Every development agent must read the same project rules. The canonical file is **`AGENTS.md`** (repo root):

| File | Read by | Role |
|------|---------|------|
| `AGENTS.md` | All agents (OpenCode, Claude Code, Cursor, generic `agents.md`-compatible tools) | **Canonical development contract**: project purpose, repo structure, path aliases, coding conventions, security rules, testing/docs requirements, prohibited actions, change workflow |
| `CLAUDE.md` | Claude Code | Jetro agent-context bootstrap for Claude sessions (see §3) |
| `AGENT.md` | Jetro | Jetro assistant context (tools, skills, templates) |
| `.agents/rules/agent.md` | Jetro (trigger: `always_on`) | Always-injected Jetro workspace rule |
| `.windsurfrules` | Windsurf | Always-applied project rule (mirrors the Jetro context) |
| `.cursor/rules/agent.mdc` | Cursor | `alwaysApply: true` rule (mirrors the Jetro context) |

**Rule:** when a convention changes, change `AGENTS.md` first. The other files either mirror it or stay thin; the `next dev` tooling re-injects its generated block into `AGENTS.md` automatically — commit it rather than fighting it.

## 3. Per-Tool Configuration Map

```
/
├── AGENTS.md                    # canonical contract (all agents)
├── CLAUDE.md                    # Claude Code context
├── AGENT.md                     # Jetro assistant context
├── .windsurfrules               # Windsurf rule
├── .mcp.json                    # shared MCP servers (root)
├── skills-lock.json             # versioned skill registry (source + hash)
├── .agents/
│   ├── rules/agent.md           # Jetro always-on rule
│   └── skills/                  # Jetro/agent skill copies
├── .claude/
│   ├── settings.local.json      # Claude Code permissions + MCP enablement
│   └── skills/                  # Claude Code skills (19 installed)
├── .cursor/
│   ├── mcp.json                 # Cursor MCP servers (mirrors root .mcp.json)
│   └── rules/agent.mdc          # Cursor always-applied rule
├── .opencode/
│   └── skills/                  # OpenCode skills (7 installed)
└── .kilo/                       # Kiln tool state (gitignored content)
```

| Agent / Tool | Instruction source | MCP source | Skills |
|--------------|--------------------|-----------|--------|
| **Claude Code** | `CLAUDE.md` + `AGENTS.md` | `.mcp.json`, enabled via `.claude/settings.local.json` (`enableAllProjectMcpServers`, `enabledMcpjsonServers: ["jetro"]`) | `.claude/skills/` |
| **OpenCode** | `AGENTS.md` | `.mcp.json` | `.opencode/skills/` |
| **Cursor** | `.cursor/rules/agent.mdc` (`alwaysApply: true`) | `.cursor/mcp.json` | — |
| **Windsurf** | `.windsurfrules` | tool-level config | — |
| **Jetro** | `AGENT.md` + `.agents/rules/agent.md` | tool-level config | `.agents/skills/` |

> ⚠️ The MCP configs contain **machine-specific absolute paths** (e.g. the local Jetro runtime under `~/.jetro/`). They work on the maintainer's machine; contributors must edit the paths for their own environment — see `MCP.md`.

## 4. Skills System

Skills are reusable instruction packages (design taste, deployment, testing, database work) installed per tool and tracked in a **lockfile**.

- **Registry:** `skills-lock.json` — versioned map of skill → source GitHub repo, source type, path, and content hash. The hash makes installs **verifiable and reproducible**.
- **Installed copies:** `.claude/skills/` (19), `.opencode/skills/` (7), `.agents/skills/` (Jetro).
- **Categories present:** design/UI (`design-taste-frontend`, `minimalist-ui`, `industrial-brutalist-ui`, `gpt-taste`, `high-end-visual-design`, `stitch-design-taste`, `ui-styling`, …), frontend build (`image-to-code`, `imagegen-frontend-*`, `vercel-react-best-practices`), engineering (`code-review`, `full-output-enforcement`, `webapp-testing`), infrastructure (`aws-deployment`, `neon`, `neon-postgres`), output (`banner-design`, `brand`, `design`, `design-system`, `slides`).

**Adding a skill:** install via the tool's skill flow so that `skills-lock.json` is updated with the source and hash — never hand-edit a skill copy without updating the lock.

## 5. How Agents Should Work in This Repository

All development agents must follow the same loop (from `AGENTS.md`):

```
UNDERSTAND → INSPECT → PLAN → IMPLEMENT → TEST → VERIFY → DOCUMENT
```

Non-negotiables for every agent:

1. **Path aliases:** `@/*` → `frontend/*`, `~backend/*` → `backend/*`, `~tests/*` → `tests/*`.
2. **Layer boundaries:** client code never touches Prisma; `backend/` is server-only; route handlers stay thin (parse → validate → delegate → respond).
3. **Quality gates before any commit:** `npm run typecheck && npm run lint && npm run test && npm run build`.
4. **Docs in the same PR:** new endpoints → `API.md`; new models → `DATABASE.md`; new AI features → `AI-SYSTEM.md`; new deps → `DECISIONS.md`; behavior change → this docs set.
5. **No invented architecture** — extend the existing seams (see `INTEGRATION.md`).
6. **Never commit secrets** or `.env.local`.

## 6. Coordination Rules

- **One contract, many tools.** Agents must not create tool-specific conventions (e.g. a Cursor-only lint rule); anything an agent needs belongs in `AGENTS.md`, `eslint.config.mjs`, or the relevant `docs/` file.
- **Prefer existing skills over generic behavior** — e.g. `webapp-testing` for browser verification, `code-review` before PRs, `vercel-react-best-practices` for React/Next changes, `neon-postgres` for DB work.
- **Agent-authored code is reviewed like human code** — same gates, same ADR process (`DECISIONS.md`), same pitfall logging (`PITFALL_REGISTER.md`).
- **Agentic QA loops:** the repo ships its own agent-verifiable tooling — `qa:audit` / `qa:validate` (question-bank audits), `qb:forensics`, `math:audit` / `math:heal`, `perf:check` — so agents can verify content and performance changes mechanically (see `TESTING.md`).

## 7. In-App AI Agent System (Summary)

The product itself ships an agentic study coach. Architecture summary (details in the `AI_AGENT_*` docs):

| Piece | Location | Responsibility |
|-------|----------|----------------|
| Agent loop | `backend/ai/agent/loop.ts` | Bounded multi-step loop (`MAX_AGENT_STEPS` = 8, `backend/ai/agent/prompt.ts`) |
| Checkpointing / persistence | `backend/ai/agent/checkpoint.ts`, `persistence.ts` | Crash-safe resume of agent state |
| Prompt | `backend/ai/agent/prompt.ts` | System prompt assembly |
| Provider registry | `backend/ai/providers/` (groq, anthropic, mock) | Model swap point |
| Model router | `backend/ai/router/` | Tier routing (`AI_MODEL_PRIMARY`, `AI_MODEL_FAST`, task tiers) |
| Orchestration | `backend/ai/orchestration/` | Task sequencing across AI services |
| Endpoint | `app/api/ai/agent` | HTTP surface; mock fallback when unkeyed |
| Types/schemas | `backend/ai/types.ts`, `schemas.ts` | Zod-validated contracts |

Related in-app AI surfaces (tutor, solver, assistant, advisor, explanations, evaluation, current affairs) are documented in `AI-SYSTEM.md` and `AI_AGENT_API_CONTRACT.md`.

## 8. Maintenance Checklist

- [ ] `AGENTS.md` matches the real repo structure after any directory reorg.
- [ ] `skills-lock.json` hashes verify after any skill install/update.
- [ ] `.mcp.json` and `.cursor/mcp.json` stay in sync (same server set).
- [ ] Jetro context files (`CLAUDE.md`, `AGENT.md`, `.windsurfrules`, `.cursor/rules/agent.mdc`, `.agents/rules/agent.md`) stay consistent after Jetro re-syncs them.
- [ ] No secrets in any agent config (they are committed).
