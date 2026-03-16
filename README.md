# CloudShell

> Your personal terminal in the cloud. Multi-user, persistent, with dev tools.

Browser-based terminal with JWT authentication, per-user containers, and R2 persistent storage.

---

## Features

- **Multi-user JWT Authentication** - Secure login with 24h tokens
- **Persistent Sessions** - Sandbox SDK backup/restore saves full filesystem state
- **R2 File Storage** - Files persist in Cloudflare R2
- **Per-user Containers** - Each user gets isolated container instance
- **Dev Tools Pre-installed** - git, node, python, vim, htop, jq, tmux, curl
- **Session Backups** - Automatic 7-day TTL backup/restore via Sandbox SDK

---

## Quick Start

### Prerequisites

- Node.js 20+
- Cloudflare account with Workers Paid plan (Containers beta enabled)
- Wrangler CLI (`npm install -g wrangler`)

### Deploy in 5 Minutes

```bash
# 1. Clone and install
git clone https://github.com/yourusername/cloudshell.git
cd cloudshell
npm install

# 2. Login to Cloudflare
npx wrangler login

# 3. Create KV namespace
npx wrangler kv:namespace create "USERS_KV"
# Copy the returned ID to wrangler.jsonc -> kv_namespaces[0].id

# 4. Create R2 buckets
npx wrangler r2 bucket create cloudshell-user-data
npx wrangler r2 bucket create cloudshell-backups

# 5. Create R2 API tokens
# Go to: https://dash.cloudflare.com/?to=/:account/r2/overview
# Click "Manage R2 API Tokens" > Create API Token
# Permissions: Object Read & Write, Bucket: cloudshell-user-data
# Copy Access Key ID and Secret Access Key

# 6. Set secrets
npx wrangler secret put JWT_SECRET
# Enter a secure random string (e.g., output of: openssl rand -hex 32)

npx wrangler secret put AWS_ACCESS_KEY_ID
# Enter your R2 Access Key ID

npx wrangler secret put AWS_SECRET_ACCESS_KEY
# Enter your R2 Secret Access Key

# 7. Set backup bucket secrets (for Sandbox SDK)
npx wrangler secret put R2_ACCESS_KEY_ID
# Enter R2 API token for backups

npx wrangler secret put R2_SECRET_ACCESS_KEY
# Enter R2 secret key for backups

# 8. Update wrangler.jsonc
# Replace YOUR_CLOUDFLARE_ACCOUNT_ID with your account ID

# 9. Deploy
npm run deploy
```

Your terminal will be live at `https://your-worker.workers.dev`

---

## Configuration

### Required Secrets

Set via `wrangler secret put <NAME>`:

| Secret                  | Description                                           |
| ----------------------- | ----------------------------------------------------- |
| `JWT_SECRET`            | Random string for JWT signing (32+ chars recommended) |
| `AWS_ACCESS_KEY_ID`     | R2 API token for USER_DATA bucket                     |
| `AWS_SECRET_ACCESS_KEY` | R2 secret key for USER_DATA bucket                    |
| `R2_ACCESS_KEY_ID`      | R2 API token for backup bucket                        |
| `R2_SECRET_ACCESS_KEY`  | R2 secret key for backup bucket                       |

### wrangler.jsonc Configuration

```jsonc
{
  "account_id": "YOUR_CLOUDFLARE_ACCOUNT_ID",
  "vars": {
    "R2_BUCKET_NAME": "cloudshell-user-data",
    "R2_ACCOUNT_ID": "YOUR_CLOUDFLARE_ACCOUNT_ID",
  },
}
```

---

## API Reference

### Authentication

#### POST /api/auth/register

Create a new user account.

```json
{
  "username": "admin",
  "password": "your-password"
}
```

#### POST /api/auth/login

Authenticate and receive JWT token.

```json
{
  "username": "admin",
  "password": "your-password"
}
```

Returns:

```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "expires": 1704067200000
}
```

### Health Check

#### GET /health

Returns service status:

```json
{ "status": "ok" }
```

| Field    | Description                      |
| -------- | -------------------------------- |
| `status` | Overall health (`ok` or `error`) |

### Backup

#### POST /api/backup

Create a manual backup of the current session (requires auth).

Returns:

```json
{ "success": true }
```

Or on failure:

```json
{ "error": "Backup failed" }
```

---

## Architecture

```
Browser (xterm.js)
    │ WebSocket
    ▼
Cloudflare Worker (Hono.js)
    │ JWT Auth, WebSocket Proxy
    ▼
Cloudflare Container (Go + tmux)
    │ PTY, Shell
    ▼
R2 Buckets (Persistent Storage)
    ├── USER_DATA: File uploads/downloads
    └── BACKUP_BUCKET: Sandbox SDK session backups
```

- **Worker**: Handles JWT auth, routes requests, proxies WebSocket to containers
- **Container**: Per-user isolated Alpine Linux with dev tools
- **R2 Storage**: Two buckets - one for files, one for Sandbox SDK session backups
- **Session Persistence**: Sandbox SDK `createBackup()`/`restoreBackup()` API

---

## Pre-installed Tools

| Category           | Tools          |
| ------------------ | -------------- |
| Version Control    | git            |
| Text Editors       | vim, nano      |
| System Monitoring  | htop, tree     |
| Data Processing    | jq             |
| JavaScript         | node, npm      |
| Python             | python3, pip3  |
| Build Tools        | make, gcc, g++ |
| Session Management | tmux           |
| Network            | curl, wget     |

### tmux + Session Persistence

Your terminal runs inside tmux for window management, with filesystem persistence via Sandbox SDK:

- `Ctrl+b d` - Detach from session
- `Ctrl+b c` - Create new window
- `Ctrl+b n/p` - Next/previous window
- `Ctrl+b [` - Enter scroll mode

**Session Persistence**: Files are automatically backed up when the container sleeps and restored on reconnect via the Sandbox SDK backup/restore API.

---

## Development

```bash
# Local development
npm run dev

# Run tests
npm run test

# Type checking
npm run typecheck

# Linting
npm run lint
```

---

## Project Structure

```
cloudshell/
├── src/
│   ├── index.ts       # Worker entry, routes, container proxy, backup/restore
│   ├── auth.ts         # JWT utilities
│   ├── shell.ts        # Frontend HTML/xterm.js
│   └── types.ts        # TypeScript definitions
├── container/
│   └── main.go         # Go WebSocket server
├── Dockerfile          # Container image
├── startup.sh          # Container startup script
├── wrangler.jsonc      # Workers config
└── package.json
```

---

## Security

- JWT tokens expire after 24 hours
- Passwords hashed with SHA-256
- Per-user container isolation
- Files stored in R2 with user-specific prefixes

---

## Troubleshooting

### Container won't start

1. Verify Containers are enabled on your account
2. Check R2 secrets are set: `wrangler secret list`
3. Verify `wrangler.jsonc` has correct `account_id`

### Files not persisting

1. Verify R2 bucket exists: `wrangler r2 bucket list`
2. Check R2 API token has correct permissions
3. Verify secrets are set correctly

### Can't login

1. Verify KV namespace is created and bound
2. Check user exists: `wrangler kv:key get "user:admin" --namespace-id=<id>`

---

## License

MIT

---

Built with [Cloudflare Workers](https://workers.cloudflare.com/) and [Containers](https://developers.cloudflare.com/containers/).
