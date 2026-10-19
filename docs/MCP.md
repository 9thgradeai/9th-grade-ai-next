# MCP (Model Context Protocol) Connection

> MCP is a **development-time** integration layer for AI coding agents working on this repo. It is **not** used by the application at runtime — the shipped app talks to its services through direct API integrations (see §6).
>
> Companion doc: [`AGENTS.md`](./AGENTS.md) (how all development agents are connected).

---

## 1. What MCP Is Here

Model Context Protocol lets an AI coding agent discover and call external tools (data sources, canvases, execution runtimes, APIs) through a standard server interface. In this repository, MCP servers are configured in JSON files that the various agents read.

## 2. Current MCP Servers

The repo configures **one** server: `jetro` (the Jetro research-platform toolchain).

### 2.1 Root config — `.mcp.json`

Read by agents that honor the project-scope MCP standard (Claude Code, OpenCode, others):

```json
{
  "mcpServers": {
    "jetro": {
      "type": "stdio",
      "command": "/Users/<you>/.jetro/runtime/node-darwin-arm64",
      "args": ["/Users/<you>/.jetro/mcp-server/index.js"],
      "env": {
        "JET_WORKSPACE": "<absolute path to this repo>",
        "JET_API_URL": "https://api.jetro.ai",
        "PATH": "…toolchain paths…"
      }
    }
  }
}
```

| Field | Meaning |
|-------|---------|
| `type: "stdio"` | The server is a local process; the agent spawns it and speaks MCP over stdin/stdout |
| `command` / `args` | How to launch the server (here: the Jetro Node runtime + server entry) |
| `env.JET_WORKSPACE` | Workspace root the server operates on (this repo) |
| `env.JET_API_URL` | Jetro HTTP API the server proxies to |
| `env.PATH` | Toolchain paths the server may need at runtime |

### 2.2 Cursor config — `.cursor/mcp.json`

Cursor keeps its own copy with the same server definition. **Keep both files in sync** — if you add/remove a server, update `.mcp.json` and `.cursor/mcp.json` together.

### 2.3 Claude Code enablement — `.claude/settings.local.json`

```json
{
  "enableAllProjectMcpServers": true,
  "enabledMcpjsonServers": ["jetro"]
}
```

Claude Code asks before enabling project-scope servers; this file pre-enables `jetro` and allows the project's MCP servers outright.

## 3. ⚠️ Machine-Specific Paths

The committed MCP configs contain **absolute paths from the maintainer's machine** (`/Users/farhankabir/…`). They are committed for convenience, but:

- On your machine, edit `command`, `args`, `env.JET_WORKSPACE`, and `env.PATH` to match your environment.
- Do **not** copy your `PATH` wholesale into a committed file — it leaks local layout and is unnecessary for other contributors.
- If you don't use Jetro, simply delete/ignore the `jetro` entry; nothing in the app depends on it.

## 4. Adding an MCP Server

Template for a new project-scope server in `.mcp.json` (and mirror it in `.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "my-server": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@scope/my-mcp-server"],
      "env": {
        "MY_API_KEY": "…use a local .env, never commit real keys…"
      }
    }
  }
}
```

Checklist:

- [ ] Prefer `npx`/versioned packages over absolute local paths so it works for everyone.
- [ ] Never put real secrets in `.mcp.json` — it is committed. Use agent-level secret stores or local overrides.
- [ ] Enable it for your tool (e.g. add to `enabledMcpjsonServers` for Claude Code).
- [ ] Verify the server starts and its tools appear before relying on it.
- [ ] Document the server here (purpose, owner, cost/risk).

## 5. Security Notes

| Risk | Mitigation |
|------|------------|
| Committed secrets | MCP config files are in git — keep keys out of them |
| Untrusted servers | An MCP server runs arbitrary local commands under your user; only install servers you trust, and review their `command`/`args` |
| Broad `PATH` exposure | Don't publish your full local `PATH`; scope `env` to what the server needs |
| Agent over-permissioning | Review agent permission files (e.g. `.claude/settings.local.json`) before committing changes |

## 6. Runtime Integrations That Are **Not** MCP

The application itself integrates with external services directly — no MCP involved:

| Service | Purpose | Configuration | Fallback |
|---------|---------|---------------|----------|
| Groq / Anthropic | AI tutor/solver/agent | `GROQ_API_KEY`, `ANTHROPIC_API_KEY` (Vercel AI SDK) | labelled mock responses |
| Tavily | Web-search grounding | `TAVILY_API_KEY` | answers from model knowledge |
| Redis | Distributed rate limiting | `REDIS_URL` (required in prod) | in-memory store (dev only) |
| Sentry | Error reporting | `SENTRY_DSN` | no-op instrumentation |
| Google OAuth / Drive | Sign-in, BYOS storage | `GOOGLE_CLIENT_ID/SECRET`, `GOOGLE_OAUTH_ENCRYPTION_KEY` | email/password auth; local storage driver |
| SMTP / Resend / SendGrid | Transactional email | see `EMAIL.md` | accounts auto-verify (dev) |

Details: `AI-SYSTEM.md`, `SECURITY.md`, `EMAIL.md`, `BYOS.md`.

## 7. Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Server doesn't appear in the agent | Config file not read, or not enabled | Confirm the tool reads `.mcp.json`; for Claude Code check `enabledMcpjsonServers` |
| Server fails to spawn | Machine-specific path doesn't exist | Rewrite `command`/`args` for your machine (§3) |
| Tools fail with auth errors | Jetro backend not signed in | Sign in via the tool sidebar (see `AGENT.md`) |
| Works locally, not in CI | MCP is dev-time only | Correct — CI never uses MCP; app features must use direct integrations (§6) |
