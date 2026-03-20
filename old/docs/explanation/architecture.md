# Architecture

## Components

````
Browser (xterm.js)→ Worker (Hono) → Container (Go) → Shell (bash + tmux)
``` Workers handles:

- JWT validation
- WebSocket proxying
- API routing

**Container** runs:

- Go WebSocket server
- PTYmultiplexer
- tmux session manager
- Dev tools

## Data Flow

1. User logs in → JWT stored in browser
2. Browser connects `/ws/terminal?token=<jwt>`
3. Worker validates JWT,extracts username
4. Worker proxies to container `shell:<username>`
5. Container runs tmux, survives disconnects

## Isolation

Each user gets isolated container instance via `shell:<username>` ID. Files persist in mounted volume at `/home/user`.
````
