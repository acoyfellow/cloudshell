# cloudshell

your personal VM on cloudflare. login, get a terminal. that's it.

## what it is

a persistent, resumable linux shell in your browser. one sandbox per user, tied to your cloudflare access email. disconnect and reconnect -- your session is still there. full PTY, real container, real filesystem.

## architecture

```
browser (xterm.js)
  ↕ websocket
cloudflare access → worker (hono)
                      ↕ sandbox.terminal()
                    sandbox SDK (durable object + container)
                      ↕
                    linux container (PTY)
```

- **cloudflare access** -- gates the app, provides user identity
- **worker** -- serves the HTML, routes websocket to sandbox
- **sandbox SDK** -- manages container lifecycle, PTY passthrough, reconnection buffering
- **container** -- full linux env with git, node, vim, htop, build-essential

## setup

```sh
npm install
```

### deploy

```sh
npm run deploy
```

first deploy takes 2-3 minutes for container provisioning. subsequent deploys are faster.

### cloudflare access

1. go to [zero trust dashboard](https://one.dash.cloudflare.com/)
2. create an access application for your worker's URL
3. add a policy (e.g. allow your email)
4. that's it -- the `Cf-Access-Authenticated-User-Email` header flows through automatically

### local dev

```sh
npm run dev
```

in local dev, there's no access header so the email defaults to `local@dev`. the sandbox still works.

## how it works

1. you visit the URL, cloudflare access challenges you
2. the worker reads your email from the access JWT header
3. it derives a stable sandbox ID from your email (`shell:you-at-example-com`)
4. the HTML page opens a websocket to `/ws/terminal`
5. the worker calls `sandbox.terminal(request)` which proxies the websocket to the container's PTY
6. you're in a shell. full linux. do whatever.
7. if you close the tab, the PTY stays alive. the container stays warm per `sleepAfter` (default from sandbox SDK). reconnecting replays buffered output.

## customizing the container

edit `Dockerfile` to add your tools. the base image is `cloudflare/sandbox:latest` which provides the SDK control plane. anything you install on top is available in your shell.

## project structure

```
src/
  index.ts    worker entry + hono routes
  shell.ts    inline HTML (xterm.js + websocket)
  types.ts    env bindings
Dockerfile    container image
```

## license

MIT
