# API Reference

## Authentication

### POST /api/auth/login

Authenticate user.

**Request:**

```json
{ "username": "admin", "password": "secret" }
```

**Response:**

```json
{ "token": "eyJhbG...", "expires": 1704067200000 }
```

---

### POST /api/auth/register

Create user.

**Request:**

```json
{ "username": "newuser", "password": "secret" }
```

**Response:**

```json
{ "message": "User created successfully" }
```

## Port Forwarding

### GET /api/ports

List forwards. Requires `Authorization: Bearer <token>`.

### POST /api/ports/forward

Create forward.

**Request:**

```json
{ "port": 3000 }
```

**Response:**

```json
{ "port": 3000, "url": "https://3000-shell-user.workers.dev" }
```

## Container

### POST /api/container/custom

Save custom Dockerfile.

**Request:**

```json
{ "dockerfile": "FROM node:18\nRUN npm i -g tsx" }
```

## Health

### GET /health

Returns `{ "status": "ok" }`
