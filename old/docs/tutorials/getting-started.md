# GettingStarted Tutorial

Deploy your first CloudShell in5 minutes.

## Prerequisites

- Node.js 20+
- Cloudflare account (Containers beta enabled)
- Wrangler CLI

## Steps

###1. Install

```bash
git clone https://github.com/acoyfellow/cloudshell.git
cd cloudshell
npm install
```

###2. Configure Cloudflare

```bash
npx wrangler login
npx wrangler kv:namespace create "USERS_KV"
```

Update the namespace ID in `wrangler.jsonc`.

### 3. Deploy

```bash
npm run deploy
```

### 4. Create Your First User

```bash
curl -X POST https://your-worker.workers.dev/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "your-password"}'
```

###5. Login

Visit `https://your-worker.workers.dev/login` and sign in.

**Done.** You now have a browser-based terminal with persistent sessions.
