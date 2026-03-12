# CloudShell

> Your personal VM on Cloudflare. Login, get a terminal. That's it.

## Quick Start [Tutorial]

Get your own CloudShell instance running in 5 minutes.

### Prerequisites

- A Cloudflare account (free tier works)
- Node.js 20+ and npm

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/cloudshell.git
cd cloudshell

# Install dependencies
npm install
```

### First Deployment

```bash
# Deploy to Cloudflare Workers
npm run deploy
```

The first deploy takes 2-3 minutes as Cloudflare provisions your container. Subsequent deploys are faster.

### Set Up Access Control

1. Go to [Cloudflare Zero Trust Dashboard](https://one.dash.cloudflare.com/)
2. Create an **Access Application** for your worker's URL
3. Add a policy allowing your email address
4. The `Cf-Access-Authenticated-User-Email` header will flow through automatically

### Access Your Terminal

1. Visit your worker URL
2. Log in via Cloudflare Access
3. Start using your terminal!

---

## Installation Guide [Tutorial]

### Step-by-Step Setup

**1. Clone and Install**

```bash
git clone https://github.com/yourusername/cloudshell.git
cd cloudshell
npm install
```

**2. Configure Wrangler**

```bash
# Log in to Cloudflare
npx wrangler login

# Add your account ID to wrangler.toml
# Get it from: https://dash.cloudflare.com → Workers & Pages
```

**3. Deploy**

```bash
npm run deploy
```

**4. Configure Cloudflare Access**

1. Visit [Zero Trust Dashboard](https://one.dash.cloudflare.com/)
2. Go to **Access → Applications**
3. Click **Add an application**
4. Select **Self-hosted**
5. Enter your worker URL (e.g., `https://cloudshell.youraccount.workers.dev`)
6. Add a policy:
   - Name: "Allow My Email"
   - Action: Allow
   - Include: Email → your-email@example.com
7. Save

**5. Test It**

Visit your URL, log in, and you should see a terminal!

---

## Common Tasks [How-To Guide]

### How to Customize Your Container

Edit the `Dockerfile` to add your tools:

```dockerfile
FROM cloudflare/sandbox:latest

# Add your tools here
RUN apt-get update && apt-get install -y \
    python3 \
    pip \
    nodejs \
    npm \
    vim \
    htop

# Set up your environment
RUN echo 'export PS1="\\w $ "' >> ~/.bashrc
```

Then redeploy:

```bash
npm run deploy
```

### How to Run Locally

```bash
npm run dev
```

In local dev, there's no Access header, so the email defaults to `local@dev`. The sandbox still works.

### How to Troubleshoot Connection Issues

**Problem**: Terminal shows "disconnected"

**Solutions**:

1. Check Cloudflare Access is configured correctly
2. Verify your email is allowed in the Access policy
3. Check browser console for CSP errors
4. Try a hard refresh (Ctrl+Shift+R)

### How to Update Your Instance

```bash
# Pull latest changes
git pull origin main

# Install any new dependencies
npm install

# Deploy
npm run deploy
```

---

## API Reference [Reference]

### HTTP Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Serves the terminal UI HTML |
| `/health` | GET | Health check endpoint |
| `/ws/terminal` | GET | WebSocket endpoint for terminal |

### WebSocket Protocol

Connect to `/ws/terminal?id=<sandbox-id>&session=<session-id>`

**Messages (Client → Server)**:

| Type | Format | Description |
|------|--------|-------------|
| Resize | `{"type": "resize", "cols": 80, "rows": 24}` | Resize terminal |
| Input | Binary (Uint8Array) | Terminal input (keystrokes) |

**Messages (Server → Client)**:

| Type | Format | Description |
|------|--------|-------------|
| Ready | `{"type": "ready"}` | Terminal ready |
| Exit | `{"type": "exit", "code": 0}` | Shell exited |
| Error | `{"type": "error", "message": "..."}` | Error message |
| Output | Binary (Uint8Array) | Terminal output |

### Environment Variables

| Variable | Description |
|----------|-------------|
| `CLOUDFLARE_API_TOKEN` | For deployment (CI/CD only) |

### Security Headers

CloudShell sets the following security headers on all responses:

- `Content-Security-Policy`: Strict CSP with nonces
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`

---

## Architecture [Explanation]

### System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser                              │
│                     (xterm.js)                              │
└──────────────────────┬──────────────────────────────────────┘
                       │ WebSocket
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                   Cloudflare Access                          │
│              (Authentication & Identity)                     │
└──────────────────────┬──────────────────────────────────────┘
                       │ Cf-Access-Authenticated-User-Email
                       ▼
┌─────────────────────────────────────────────────────────────┐
│              Cloudflare Worker (Hono)                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Security   │  │   Session    │  │   Sandbox    │      │
│  │  Middleware  │  │   Manager    │  │   Handler    │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└──────────────────────┬──────────────────────────────────────┘
                       │ fetch()
                       ▼
┌─────────────────────────────────────────────────────────────┐
│              Sandbox SDK (Durable Object)                    │
│          ┌────────────────────────────────┐                 │
│          │    Container + PTY             │                 │
│          │    (Linux Environment)         │                 │
│          └────────────────────────────────┘                 │
└─────────────────────────────────────────────────────────────┘
```

### Session Lifecycle

Sessions follow this state machine:

```
┌─────────┐    connect    ┌─────────┐   activity   ┌─────────┐
│  create │ ─────────────▶│  active │◀────────────▶│  idle   │
└─────────┘               └─────────┘              └────┬────┘
                                                        │
                              30 min timeout            │
                              (IDLE_TIMEOUT)            │
                                                        ▼
                                                 ┌─────────┐
                                                 │ timeout │
                                                 └────┬────┘
                                                      │ destroy
                                                      ▼
                                                 ┌─────────┐
                                                 │ destroy │
                                                 └─────────┘
```

### Security Model

CloudShell implements a defense-in-depth strategy:

**Layer 1: Authentication**
- Cloudflare Access provides SSO/MFA
- User identity verified via JWT
- Email extracted from `Cf-Access-Authenticated-User-Email` header

**Layer 2: Authorization**
- One sandbox per user
- Sandbox ID derived deterministically from email
- Sessions validated on each request

**Layer 3: Input Validation**
- All inputs validated against strict patterns
- Terminal input sanitized (control characters removed)
- Sandbox IDs must match `shell:[a-z0-9-]+` pattern

**Layer 4: Rate Limiting**
- WebSocket: 10 requests/minute per IP
- HTTP: 30 requests/minute per IP
- Prevents abuse and DoS

**Layer 5: CSP Protection**
- Nonce-based script loading
- No inline scripts allowed
- Strict dynamic imports

**Layer 6: Origin Validation**
- CSWSH protection via Origin header validation
- Only allowed origins can connect via WebSocket

**Layer 7: Session Management**
- 30-minute idle timeout
- Activity tracking on every interaction
- Automatic cleanup of expired sessions

### Container Model

Each user gets:

- **Dedicated sandbox**: Isolated from other users
- **Persistent filesystem**: Files survive reconnections
- **Warm container**: PTY stays alive for 5 minutes after disconnect
- **Linux environment**: Full bash, common tools pre-installed

---

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and contribution guidelines.

## Security

See [SECURITY.md](SECURITY.md) for security policy and vulnerability reporting.

## License

MIT © CloudShell Contributors
