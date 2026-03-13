# CloudShell

> Your personal terminal in the cloud. Multi-user, persistent, with dev tools. Deploy in seconds.

**[Live Demo](https://cloudshell.coy.workers.dev/)**

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/acoyfellow/cloudshell)

---

## Features

- **Multi-user JWT Authentication** - Secure login with 24h tokens, user isolation
- **Persistent Sessions** - tmux keeps your terminal state across disconnects
- **Dev Tools Pre-installed** - git, node, python, vim, htop, jq, and more
- **Port Forwarding** - Expose services running in your container via unique URLs
- **Per-user Containers** - Each user gets isolated container instance
- **Custom Dockerfiles** - Save your own container configuration

---

## Quick Start

### Prerequisites

- Node.js 20+
- Cloudflare account with Containers enabled (beta)
- Wrangler CLI (`npm install -g wrangler`)

### Deploy in 30 Seconds

```bash
# Clone and install
git clone https://github.com/acoyfellow/cloudshell.git
cd cloudshell
npm install

# Login to Cloudflare (first time only)
npx wrangler login

# Create KV namespace for user storage
npx wrangler kv:namespace create "USERS_KV"

# Deploy
npm run deploy
```

Your terminal will be live at `https://your-worker.workers.dev`

---

## Authentication

CloudShell uses JWT-based authentication stored in Cloudflare KV.

### First User Registration

```bash
# Register your admin account
curl -X POST https://your-worker.workers.dev/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "your-secure-password"}'
```

### Login

1. Visit `https://your-worker.workers.dev/login`
2. Enter your credentials
3. JWT token is stored in browser localStorage
4. Token expires after 24 hours

---

## API Reference

### Authentication Endpoints

#### POST /api/auth/login

Authenticate and receive JWT token.

**Request:**

```json
{
  "username": "admin",
  "password": "your-password"
}
```

**Response:**

```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "expires": 1704067200000
}
```

#### POST /api/auth/register

Create a new user account.

**Request:**

```json
{
  "username": "newuser",
  "password": "secure-password"
}
```

**Response:**

```json
{
  "message": "User created successfully"
}
```

### Port Forwarding Endpoints

#### GET /api/ports

List active port forwards (requires Bearer token).

**Headers:**

```
Authorization: Bearer <token>
```

**Response:**

```json
{
  "forwards": [
    {
      "port": 3000,
      "url": "https://3000-shell-admin.cloudshell.workers.dev",
      "subdomain": "3000-shell-admin"
    }
  ]
}
```

#### POST /api/ports/forward

Create a port forward.

**Headers:**

```
Authorization: Bearer <token>
Content-Type: application/json
```

**Request:**

```json
{
  "port": 3000
}
```

**Response:**

```json
{
  "message": "Port forward created (experimental)",
  "port": 3000,
  "url": "https://3000-shell-admin.cloudshell.workers.dev",
  "subdomain": "3000-shell-admin"
}
```

**Note:** Port must be between 1024-65535.

### Container Customization Endpoints

#### POST /api/container/custom

Save a custom Dockerfile for your user.

**Headers:**

```
Authorization: Bearer <token>
Content-Type: application/json
```

**Request:**

```json
{
  "dockerfile": "FROM node:18-alpine\nWORKDIR /app\nRUN npm install -g typescript"
}
```

**Response:**

```json
{
  "message": "Custom Dockerfile saved",
  "note": "To apply changes, rebuild and redeploy the container",
  "nextSteps": [
    "1. Clone the repository",
    "2. Replace Dockerfile with your custom content",
    "3. Run: wrangler deploy"
  ]
}
```

### Health Check

#### GET /health

Health check endpoint (public).

**Response:**

```json
{
  "status": "ok"
}
```

---

## Using Port Forwarding

Start a server in your terminal:

```bash
# Terminal 1 - Start a server
python3 -m http.server 8080
```

Create port forward via API:

```bash
# Terminal 2 - Forward the port
curl -X POST https://your-worker.workers.dev/api/ports/forward \
  -H "Authorization: Bearer <your-token>" \
  -H "Content-Type: application/json" \
  -d '{"port": 8080}'
```

Access your service at the returned URL:

```
https://8080-shell-yourname.cloudshell.workers.dev
```

---

## Pre-installed Tools

Your container comes with these tools ready to use:

| Category               | Tools          |
| ---------------------- | -------------- |
| **Version Control**    | git            |
| **Text Editors**       | vim, nano      |
| **System Monitoring**  | htop, tree     |
| **Data Processing**    | jq             |
| **JavaScript**         | node, npm      |
| **Python**             | python3, pip3  |
| **Build Tools**        | make, gcc, g++ |
| **Session Management** | tmux           |
| **Network**            | curl, wget     |

### tmux Session Persistence

Your terminal runs inside tmux. This means:

- **Reconnect without losing state** - Detach and reattach automatically
- **Multiple windows** - Press `Ctrl+b c` to create new window
- **Scrollback** - Press `Ctrl+b [` to enter scroll mode

**tmux Cheat Sheet:**

- `Ctrl+b d` - Detach from session
- `Ctrl+b c` - Create new window
- `Ctrl+b n` - Next window
- `Ctrl+b p` - Previous window
- `Ctrl+b %` - Split vertically
- `Ctrl+b "` - Split horizontally

---

## Architecture

```
┌─────────────────┐
│  Browser        │
│  (xterm.js)     │
└────────┬────────┘
         │ WebSocket
         ▼
┌─────────────────┐
│  Cloudflare     │
│  Worker         │
│  (Hono.js)      │
│                 │
│  • JWT Auth     │
│  • API Routes   │
│  • WebSocket    │
│    Proxy        │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Container      │
│  (Go Server)    │
│                 │
│  • WebSocket    │
│  • PTY          │
│  • tmux         │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Bash Shell     │
│  + Dev Tools    │
└─────────────────┘
```

### Data Flow

1. **Login** → POST `/api/auth/login` returns JWT token
2. **Terminal** → Browser connects via WebSocket to `/ws/terminal`
3. **Auth** → Worker validates JWT from query param or header
4. **Container** → Worker proxies to user's isolated container
5. **Session** → Container runs tmux, survives disconnects
6. **Files** → Persist in volume mounted at `/home/user`

---

## Configuration

### Environment Variables

Set these via `wrangler secret`:

| Variable                | Purpose                    |
| ----------------------- | -------------------------- |
| `CLOUDFLARE_API_TOKEN`  | For CI/CD deployments      |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID |
| `CLOUDFLARE_EMAIL`      | Your Cloudflare email      |

### KV Namespace

Required for user storage:

```bash
npx wrangler kv:namespace create "USERS_KV"
```

Update `wrangler.jsonc` with the returned namespace ID.

---

## Development

### Local Development

```bash
npm run dev
```

Opens at `http://localhost:8787`.

### Testing

```bash
# Run unit tests
npm run test

# Type checking
npm run typecheck

# Linting
npm run lint
```

### Project Structure

```
cloudshell/
├── src/
│   ├── index.ts          # Main worker (routes, auth)
│   ├── auth.ts           # JWT utilities
│   ├── auth.test.ts      # Auth unit tests
│   ├── shell.ts          # Frontend HTML/JS
│   ├── security.ts       # Security utilities
│   ├── security.test.ts  # Security tests
│   └── types.ts          # TypeScript types
├── Dockerfile            # Container definition
├── .tmux.conf           # tmux configuration
├── wrangler.jsonc       # Workers config
└── package.json
```

---

## Security

- **JWT tokens** expire after 24 hours
- **Password hashing** uses SHA-256 with salt
- **Container isolation** - Each user gets separate container instance
- **Path sanitization** - Prevents directory traversal
- **Rate limiting** - Built into Cloudflare Workers

---

## Troubleshooting

### Container won't start

Check Cloudflare Containers are enabled on your account (beta feature).

### Can't login

1. Verify KV namespace is created and bound in `wrangler.jsonc`
2. Check user exists: `npx wrangler kv:key get "user:username" --namespace-id=<id>`

### Port forwarding not working

Port forwarding API is experimental. The URL generation works but full WebSocket proxying requires additional Cloudflare configuration.

---

## License

MIT

---

Built for fun using [Cloudflare Workers](https://workers.cloudflare.com/) and [Containers](https://developers.cloudflare.com/containers/).
