# cloudshell

Cloudshell is a SvelteKit app backed by a sibling Cloudflare Worker and Cloudflare Containers.

- The SvelteKit app owns auth, routing, and the browser UI.
- The worker owns sessions, tabs, files, recordings, ports, shares, and terminal orchestration.
- Each user gets one shared workstation filesystem.
- Each session gets its own isolated runtime container.
- Each tab inside a session gets its own `tmux` shell state.

## Repo layout

```text
src/                 SvelteKit app
worker/              Cloudflare Worker + container runtime
shared/              Shared helpers used by app and worker
migrations/          Better Auth / D1 migrations
old/                 Archived pre-rebuild app for reference
alchemy.run.ts       Dev + deploy orchestration
```

## Local development

1. Create a local env file.

```bash
cp .env.example .env
```

2. Fill in the required values:

- `ALCHEMY_PASSWORD`
- `BETTER_AUTH_SECRET`

Optional:

- `BETTER_AUTH_URL`
- `BETTER_AUTH_TRUSTED_ORIGINS`
- `TERMINAL_TICKET_SECRET`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `R2_ACCOUNT_ID`
- `CLOUDFLARE_ACCOUNT_ID`

3. Start the app.

```bash
bun install
bun run dev
```

Default local URLs:

- app: `http://localhost:5173`
- worker: `http://localhost:1338`

## Useful scripts

```bash
bun run dev
bun run build
bun run check
bun run test
bun run deploy
bun run destroy
```

Database helpers:

```bash
bun run db:generate
bun run db:migrate
bun run db:local
bun run db:remote
```

## Architecture notes

- Better Auth uses D1 for user/session records.
- Runtime metadata stays in KV/R2, not D1.
- Terminal access uses app-origin websocket routing in production and a signed direct-worker ticket in local dev.
- `@xterm/xterm` and `@xterm/addon-fit` are bundled from npm. There is no CDN-loaded terminal dependency.

## Verification

Before shipping changes:

```bash
bun run check
bun run test
bun run build
```

For worker container tests:

```bash
cd worker/container && go test ./...
```
