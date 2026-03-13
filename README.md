# CloudShell

> Your personal terminal in the cloud. Deploy in seconds, access anywhere.

**Live demo**: https://cloudshell.coy.workers.dev/ (user: `admin`, pass: `admin`)

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/acoyfellow/cloudshell)

---

## Get Started [Tutorial]

### Prerequisites

- Node.js 20+
- Cloudflare account (free tier works)
- Wrangler CLI (`npm install -g wrangler`)

### One-Command Deploy

```bash
# Clone and install
git clone https://github.com/acoyfellow/cloudshell.git
cd cloudshell
npm install

# Login to Cloudflare (first time only)
npx wrangler login

# Deploy
npm run deploy
```

Visit your worker URL. Login with `admin`/`admin`. You have a terminal!

### What Happens When You Deploy

1. **Container builds** - Your Dockerfile becomes a container image
2. **Worker deploys** - Hono.js worker handles auth and WebSocket proxy
3. **Volume creates** - Persistent storage mounted at `/home/user`

---

## How-To Guides

### Change the Login Credentials

```bash
# Set custom username/password
npx wrangler secret put AUTH_USERNAME
npx wrangler secret put AUTH_PASSWORD
```

### Access Your Files Later

Files in `/home/user` persist across sessions. Your container sleeps after 5 minutes of inactivity, but wakes up with your files intact.

### Run Locally for Development

```bash
npm run dev
```

Opens at `http://localhost:8787`. Uses local container simulation.

### Custom Domain

1. Add a custom domain in Cloudflare Workers dashboard
2. Update `wrangler.jsonc` with your routes
3. Redeploy: `npm run deploy`

---

## Reference

### Environment Variables

| Variable        | Required | Default | Description              |
| --------------- | -------- | ------- | ------------------------ |
| `AUTH_USERNAME` | No       | `admin` | HTTP Basic Auth username |
| `AUTH_PASSWORD` | No       | `admin` | HTTP Basic Auth password |

### Project Structure

```
cloudshell/
├── Dockerfile          # Container: Go WebSocket server with PTY
├── src/
│   ├── index.ts       # Worker: Auth, routing, WebSocket proxy
│   ├── shell.ts       # Frontend: xterm.js terminal UI
│   ├── types.ts       # TypeScript types
│   └── security.test.ts # Unit tests
├── wrangler.jsonc     # Cloudflare Workers config
└── vitest.config.ts   # Test configuration
```

### NPM Scripts

| Command             | Description                    |
| ------------------- | ------------------------------ |
| `npm run dev`       | Start local development server |
| `npm run deploy`    | Deploy to Cloudflare Workers   |
| `npm run test`      | Run unit tests                 |
| `npm run typecheck` | TypeScript type checking       |
| `npm run lint`      | Run ESLint                     |

### API Endpoints

| Endpoint       | Method | Description                     |
| -------------- | ------ | ------------------------------- |
| `/`            | GET    | Terminal UI (HTML page)         |
| `/health`      | GET    | Health check endpoint           |
| `/ws/terminal` | GET    | WebSocket endpoint for terminal |

---

## Explanation

### Architecture

```
Browser (xterm.js)
    │WebSocket
    ▼
Cloudflare Worker (Hono.js)
    │Auth + Proxy
    ▼
Container (Go Server)
    │PTY
    ▼
Bash Shell
```

### How It Works

1. **Browser** connects via WebSocket to the Worker
2. **Worker** validates HTTP Basic Auth credentials
3. **Worker** proxies WebSocket to the Container
4. **Container** creates a PTY (pseudo-terminal) running bash
5. **I/O flows**: Browser ↔ Worker ↔ Container ↔ Bash

### Persistence Model

- Each authenticated user gets a dedicated container instance
- Container ID derived from username (e.g., `shell:admin`)
- Volume `shell-data` mounted at `/home/user`
- Files outside `/home/user` don't persist

### Why Cloudflare Containers?

- **Edge execution** - Containers run close to users globally
- **Pay per use** - Only pay while container is running (sleeps after 5 min idle)
- **No server management** - No VMs, no Kubernetes, just deploy

---

## Development

### Run Tests

```bash
npm run test
```

### Type Check

```bash
npm run typecheck
```

### Local Development

```bash
npm run dev
```

---

## License

MIT

---

Built with ❤️ using [Cloudflare Workers](https://workers.cloudflare.com/) and [Containers](https://developers.cloudflare.com/containers/).
