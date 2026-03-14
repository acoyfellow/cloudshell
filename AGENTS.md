# AGENTS.md

## Cursor Cloud specific instructions

### Overview

CloudShell is a cloud-based terminal-as-a-service built on Cloudflare Workers + Containers. The Worker (Hono.js) serves auth, API routes, and a browser-based xterm.js terminal UI. Per-user Docker containers (Go PTY server) provide isolated shells -- these only run on Cloudflare infrastructure, not locally.

### Running locally

Start the dev server with containers disabled (no Docker needed):

```
npx wrangler dev --enable-containers=false
```

This starts on `http://localhost:8787` with local KV and Durable Object emulation. The terminal WebSocket will not connect (containers unavailable locally), but auth, API endpoints, and the frontend all work.

### Key commands

See `package.json` scripts. Summary:

| Task | Command |
|------|---------|
| Dev server | `npx wrangler dev --enable-containers=false` |
| Lint | `npm run lint` |
| Type check | `npm run typecheck` |
| Unit tests | `npm run test:unit` |
| Integration tests | `npm run test:integration` (requires dev server running) |
| Format | `npm run format` |

### Gotchas

- `npm run dev` (plain `wrangler dev`) will fail without Docker installed because wrangler tries to build the container image. Always pass `--enable-containers=false` for local development.
- Integration tests (`gateproof`) expect the dev server to be running on `localhost:8787`.
- KV data is persisted locally by wrangler in `.wrangler/` -- delete it to reset local state.
- The ESLint config uses flat config format (`eslint.config.js`) with TypeScript project references.
