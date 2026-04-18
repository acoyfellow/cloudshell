<p align="center">
  <img src="./static/favicon.svg" alt="Cloudshell logo" width="72" />
</p>

<h1 align="center">Cloudshell</h1>

<p align="center"><strong>Experimental</strong></p>

<p align="center">
  A terminal-first cloud workstation with a SvelteKit frontend and a Cloudflare Worker + Containers backend.
</p>

## What it is

Cloudshell gives each user one shared workstation filesystem and lets them open isolated runtime sessions on top of it.

The core model is:

- `user workstation` = one shared filesystem per user
- `session` = one isolated runtime container
- `tab` = one independent shell inside the active session

## What ships today

- SvelteKit app for auth, routing, and UI
- Better Auth backed by D1
- Cloudflare Worker backend for session orchestration
- Cloudflare Containers for isolated runtime sessions
- Shared per-user workstation files across sessions
- Per-tab shell state inside each session
- Left-side files drawer wired to the same filesystem the terminal sees
- Ports and tools workspace for forwarding, sharing, SSH keys, and backups
- npm-bundled terminal stack with no CDN dependency

## Repo layout

```text
src/            SvelteKit app
worker/         Cloudflare Worker + container runtime
shared/         Shared helpers used by app and worker
migrations/     Better Auth / D1 migrations
old/            Archived pre-rebuild app for reference
alchemy.run.ts  Dev + deploy orchestration
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

- Better Auth uses D1 for user and auth records.
- Runtime metadata stays in KV/R2, not D1.
- Terminal access uses app-origin websocket routing in production and a signed direct-worker ticket in local dev.
- `@xterm/xterm` and `@xterm/addon-fit` are bundled from npm. There is no CDN-loaded terminal dependency.

### Terminal handshake contract

The browser does not connect to the container directly.

1. `src/routes/api/cloudshell/terminal-connection/+server.ts` issues a short-lived ticket for the active user, session, and tab.
2. `src/routes/ws/terminal/+server.ts` proxies the websocket through `src/lib/server/worker.ts`.
3. The app-host proxy validates the ticket and forwards the terminal identity headers to the worker hop:
   - `X-User-Id`
   - `X-User-Email`
   - `X-Session-Id`
   - `X-Tab-Id`
4. `worker/effect/services.ts` forwards the same identity context into the container request.
5. `worker/container/main.go` uses that user/session/tab identity to attach the correct terminal process.

If any hop drops that identity, the browser typically sees a websocket close like `1006` instead of a usable terminal.

### Post-Containers-GA deploy footgun (2026-04-18)

If the terminal returns `1006` / "Terminal unavailable" indefinitely **after all five
hops look healthy**, check the account's container applications inventory before
spending more time in the code. This has bitten this project for a long time.

The symptom:
- Worker log shows `Error checking 8080: The operation was aborted` repeating
- Runtime reports `"Container crashed while checking for ports, did you start the
  container and setup the entrypoint correctly?"`
- `wrangler tail` shows `Container state running attempt=1` / `attempt=2` but
  `waitForPort` never resolves
- A minimal parity container deployed alongside (see `worker/parity-container/`)
  WORKS fine on the exact same Worker → DO path

The cause:
When the project has been redeployed across breaking changes — alchemy renames, DO
class renames, package upgrades — the Cloudflare Containers control plane can end
up with **stale container applications mapped to the same Durable Object class**
as the live one. Symptoms on the inventory:
- Multiple `cloudshell-*` apps for the same logical container
- One or more apps reporting `instances > max_instances` (e.g. `9/5`)
- Names from a prior code shape (e.g. `cloudshell-cloudshellterminal` when the
  current code uses `Container('sandbox', ...)` which alchemy names
  `cloudshell-sandbox-runner`)

When this state exists, Docker pushes on new deploys succeed, but the DO class is
still routing to a wedged old app. Changes to `Dockerfile`, `startup.sh`, Worker
code, or the `@cloudflare/containers` package version do not take effect because
the runtime is serving a stale image behind the scenes.

Check and clean up:

```bash
# List all container apps on the account
curl -sS -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/containers/applications" \
  | jq '.result[] | select(.name | startswith("cloudshell"))
        | {name, id, instances, max: .max_instances}'
```

If you see duplicates, orphans, or `instances > max`, delete them:

```bash
curl -sS -X DELETE -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/containers/applications/<ID>"
```

Then redeploy — alchemy recreates the active app cleanly and the new image takes
effect immediately.

**Do not delete `cloudshell-sandbox-runner` if it is the only healthy app and
your terminal works.** Only the orphans and the stuck entries.

#### How this diagnosis was reached

Having this as a documented pattern saves the next person the four-commit chase we
did the first time:

1. **Reproduced 1006 in prod.** WS hung in `readyState: 0 (CONNECTING)` for 10+ seconds, never opened.
2. **Bisected with existing probe endpoints.** `/ws/hello`, `/ws/terminal-probe`,
   `/ws/proxy-hello` all opened and echoed cleanly — confirming Browser→SvelteKit
   and SvelteKit→Worker hops were fine. Only `/ws/terminal` failed.
3. **Enabled `wrangler tail`.** Revealed the Worker-side failure:
   `waitForPort(8080)` on the container DO kept aborting; `Container crashed
   while checking for ports`.
4. **Shipped three plausible fixes.** (a) `containerFetch(request, port)` override
   missing on the terminal Container subclass (was genuinely required post-GA);
   (b) `set -e` in `startup.sh` can abort before `exec /server`; (c) upgrade
   `@cloudflare/containers 0.1.1 → ^0.3.2` + explicit `enableInternet = true`.
   All correct changes. **None moved the tail output.** Identical failure pattern
   after each deploy.
5. **Enabled the parity container bisect.** Set `TERMINAL_PARITY_SECRET` in CI so
   `CloudShellParityTerminal` (9-line Dockerfile, node + `ws`, no FUSE, no Go)
   provisioned. Hit `wss://cloudshell-api.coey.dev/terminal?secret=...`. It
   opened cleanly and responded with `parity-ready` in <400ms — tail showed
   `Port 8080 is ready`. That conclusively proved the Worker→DO→container path
   was healthy; the problem was inside the cloudshell image path.
6. **Disabled FUSE entirely in `startup.sh`.** The only meaningful difference
   between cloudshell and parity was FUSE + bash + Go. **Still same 1006.**
   At this point nothing in the source tree could explain why code changes had
   no effect on runtime behavior.
7. **Inspected the account-level container apps inventory.** Found three
   cloudshell-named apps, two with `instances > max_instances` (9/5 and 9/5),
   one with a pre-refactor name (`cloudshell-cloudshellterminal`) that no
   longer matches anything in the current `alchemy.run.ts`. That explained why
   our committed code changes were being ignored: the DO class was still
   serving traffic from a wedged historical container app that Alchemy's state
   didn't know about.
8. **Deleted the stale apps, redeployed.** Alchemy recreated the active app
   clean, the new image took effect, and the terminal came back up.

The tell for next time: **if code changes make it through CI and deploy, but
the behavior in tail is byte-identical to before the change, suspect container
state before suspecting code.**

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
