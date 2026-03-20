# Port Forwarding

Expose container services to the web.

## Start a Service

```bash
python3 -m http.server 8080
```

## Create Forward

```bash
curl -X POST https://your-worker.workers.dev/api/ports/forward \
  -H "Authorization: Bearer <your-token>" \
  -H "Content-Type: application/json" \
  -d '{"port": 8080}'
```

## Access

Use the returned URL: `https://8080-shell-username.workers.dev`

## List Active Forwards

```bash
curl https://your-worker.workers.dev/api/ports \
  -H "Authorization: Bearer <token>"
```
