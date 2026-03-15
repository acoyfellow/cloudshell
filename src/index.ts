import { Hono } from 'hono';
import { Container, getContainer } from '@cloudflare/containers';
import { html, loginHtml } from './shell';
import {
  generateJWT,
  verifyJWT,
  hashPassword,
  verifyPassword,
  extractBearerToken,
  getUserContainerId,
} from './auth';
import type { Env } from './types';

// Export the Container class for Durable Object binding
export { CloudShellTerminal, TerminalContainer, ShellContainer, CloudShellSandbox };

class CloudShellTerminal extends Container {
  defaultPort = 8080;
  sleepAfter = '5m';

  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  constructor(ctx: DurableObjectState<{}>, env: Env) {
    super(ctx, env);
    this.envVars = {
      AWS_ACCESS_KEY_ID: env.AWS_ACCESS_KEY_ID,
      AWS_SECRET_ACCESS_KEY: env.AWS_SECRET_ACCESS_KEY,
      R2_BUCKET_NAME: env.R2_BUCKET_NAME,
      R2_ACCOUNT_ID: env.R2_ACCOUNT_ID,
    };
  }

  override onStart() {
    console.log('[CloudShell] Container started for user');
  }
}

// Legacy classes for backwards compatibility with existing Durable Objects
class TerminalContainer extends Container {
  defaultPort = 8080;
  sleepAfter = '5m';
}

class ShellContainer extends Container {
  defaultPort = 8080;
  sleepAfter = '5m';
}

class CloudShellSandbox extends Container {
  defaultPort = 8080;
  sleepAfter = '5m';
}

async function restoreSession(container: ReturnType<typeof getContainer>, username: string): Promise<void> {
  try {
    const response = await container.fetch(
      new Request('http://localhost:8080/api/session/restore', {
        method: 'POST',
        headers: { 'X-User': username },
      })
    );
    const result = await response.json() as { restored: boolean };
    if (result.restored) {
      console.log('[CloudShell] Session restored for', username);
    }
  } catch (e) {
    console.log('[CloudShell] No session to restore for', username);
  }
}

const app = new Hono<{ Bindings: Env }>();

// Health check - must be before auth middleware
app.get('/health', (c) => c.json({ status: 'ok' }));

// Public routes
app.get('/login', (c) => c.html(loginHtml()));

// Login endpoint
app.post('/api/auth/login', async (c) => {
  try {
    const body = await c.req.json<{ username: string; password: string }>();
    const { username, password } = body;

    if (!username || !password) {
      return c.json({ error: 'Username and password required' }, 400);
    }

    // Get user from KV
    const userData = await c.env.USERS_KV.get(`user:${username}`);

    if (!userData) {
      return c.json({ error: 'Invalid credentials' }, 401);
    }

    const user = JSON.parse(userData) as { passwordHash: string; createdAt: number };
    const isValid = await verifyPassword(password, user.passwordHash, c.env);

    if (!isValid) {
      return c.json({ error: 'Invalid credentials' }, 401);
    }

    // Generate JWT
    const { token, expires } = await generateJWT(username, c.env);

    return c.json({ token, expires });
  } catch {
    return c.json({ error: 'Invalid request' }, 400);
  }
});

// Registration endpoint (create default admin on first request)
app.post('/api/auth/register', async (c) => {
  try {
    const body = await c.req.json<{ username: string; password: string }>();
    const { username, password } = body;

    if (!username || !password) {
      return c.json({ error: 'Username and password required' }, 400);
    }

    // Check if user already exists
    const existing = await c.env.USERS_KV.get(`user:${username}`);
    if (existing) {
      return c.json({ error: 'User already exists' }, 409);
    }

    // Hash password and store
    const passwordHash = await hashPassword(password, c.env);
    const user = {
      username,
      passwordHash,
      createdAt: Date.now(),
    };

    await c.env.USERS_KV.put(`user:${username}`, JSON.stringify(user));

    return c.json({ message: 'User created successfully' }, 201);
  } catch {
    return c.json({ error: 'Invalid request' }, 400);
  }
});

// JWT Auth middleware
app.use('/api/*', async (c, next) => {
  // Skip auth for login endpoints
  if (c.req.path === '/api/auth/login' || c.req.path === '/api/auth/register') {
    await next();
    return;
  }

  const authHeader = c.req.header('Authorization');
  const token = extractBearerToken(authHeader);

  if (!token) {
    return c.json({ error: 'Authentication required' }, 401);
  }

  const payload = await verifyJWT(token, c.env);
  if (!payload) {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }

  await next();
});

// WebSocket terminal with JWT auth
app.get('/ws/terminal', async (c) => {
  const upgrade = c.req.header('Upgrade');
  if (upgrade?.toLowerCase() !== 'websocket') {
    return c.text('expected websocket', 426);
  }

  // Get token from query param or header
  const token = c.req.query('token') || extractBearerToken(c.req.header('Authorization'));

  if (!token) {
    return c.json({ error: 'Authentication required' }, 401);
  }

  const payload = await verifyJWT(token, c.env);
  if (!payload) {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }

  const username = payload.sub;
  const id = getUserContainerId(username);

  // Get the container - each user gets isolated instance
  const container = getContainer(c.env.Sandbox, id);

  // Start container and wait for it to be ready
  try {
    const state = await container.getState();
    console.log('[CloudShell] Initial container state:', state.status);
    
    // Start if not healthy or running
    if (state.status === 'stopped' || state.status === 'stopped_with_code') {
      console.log('[CloudShell] Starting stopped container...');
      await container.startAndWaitForPorts({ ports: [8080] });
      await restoreSession(container, username);
    } else if (state.status === 'running') {
      // Container is already starting, wait for it
      console.log('[CloudShell] Container is starting, waiting for ports...');
      await container.waitForPort({ portToCheck: 8080 });
    }
    
    console.log('[CloudShell] Container is healthy, proxying request');
  } catch (err) {
    console.error('[CloudShell] Container error:', err);
    return c.json({ error: 'Container error, please retry in a moment.' }, 503);
  }

  // Add username header for container to use
  const headers = new Headers(c.req.raw.headers);
  headers.set('X-User', username);

  const request = new Request(c.req.raw, { headers });

  // Proxy WebSocket to container
  return container.fetch(request);
});

// Main terminal page (requires auth)
app.get('/', async (c) => {
  const token = c.req.query('token');

  if (!token) {
    return c.redirect('/login');
  }

  const payload = await verifyJWT(token, c.env);
  if (!payload) {
    return c.redirect('/login');
  }

  return c.html(html(payload.sub, token));
});

app.get('/api/ports', async (c) => {
  const authHeader = c.req.header('Authorization');
  const token = extractBearerToken(authHeader);

  if (!token) {
    return c.json({ error: 'Authentication required' }, 401);
  }

  const payload = await verifyJWT(token, c.env);
  if (!payload) {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }

  return c.json({ forwards: [] });
});

app.post('/api/ports/forward', async (c) => {
  const authHeader = c.req.header('Authorization');
  const token = extractBearerToken(authHeader);

  if (!token) {
    return c.json({ error: 'Authentication required' }, 401);
  }

  const payload = await verifyJWT(token, c.env);
  if (!payload) {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }

  const body = await c.req.json<{ port: number }>();
  const { port } = body;

  if (!port || port < 1024 || port > 65535) {
    return c.json({ error: 'Invalid port number (must be 1024-65535)' }, 400);
  }

  const username = payload.sub;
  const containerId = getUserContainerId(username);
  const subdomain = `${port}-${containerId}`.replace(/:/g, '-');
  const url = `https://${subdomain}.cloudshell.coey.dev`;

  return c.json({
    message: 'Port forward created (experimental)',
    port,
    url,
    subdomain,
  });
});

app.post('/api/container/custom', async (c) => {
  const authHeader = c.req.header('Authorization');
  const token = extractBearerToken(authHeader);

  if (!token) {
    return c.json({ error: 'Authentication required' }, 401);
  }

  const payload = await verifyJWT(token, c.env);
  if (!payload) {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }

  const body = await c.req.json<{ dockerfile?: string }>();

  if (!body.dockerfile) {
    return c.json({ error: 'Dockerfile content required' }, 400);
  }

  const username = payload.sub;

  await c.env.USERS_KV.put(`dockerfile:${username}`, body.dockerfile);

  return c.json({
    message: 'Custom Dockerfile saved',
    note: 'To apply changes, rebuild and redeploy the container',
    nextSteps: [
      '1. Clone the repository',
      '2. Replace Dockerfile with your custom content',
      '3. Run: wrangler deploy',
    ],
  });
});

app.get('/api/tabs', async (c) => {
  const authHeader = c.req.header('Authorization');
  const token = extractBearerToken(authHeader);

  if (!token) {
    return c.json({ error: 'Authentication required' }, 401);
  }

  const payload = await verifyJWT(token, c.env);
  if (!payload) {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }

  const username = payload.sub;
  const tabs = await c.env.USERS_KV.get(`tabs:${username}`);
  return c.json({ tabs: tabs ? JSON.parse(tabs) : [] });
});

app.post('/api/tabs', async (c) => {
  const authHeader = c.req.header('Authorization');
  const token = extractBearerToken(authHeader);

  if (!token) {
    return c.json({ error: 'Authentication required' }, 401);
  }

  const payload = await verifyJWT(token, c.env);
  if (!payload) {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }

  const username = payload.sub;
  const body = await c.req.json<{ name: string; sessionId: string }>();
  const tab = { id: crypto.randomUUID(), name: body.name, sessionId: body.sessionId, createdAt: Date.now() };
  
  const existing = await c.env.USERS_KV.get(`tabs:${username}`);
  const tabs = existing ? JSON.parse(existing) : [];
  tabs.push(tab);
  await c.env.USERS_KV.put(`tabs:${username}`, JSON.stringify(tabs));
  
  return c.json({ tab });
});

app.post('/api/share', async (c) => {
  const authHeader = c.req.header('Authorization');
  const token = extractBearerToken(authHeader);

  if (!token) {
    return c.json({ error: 'Authentication required' }, 401);
  }

  const payload = await verifyJWT(token, c.env);
  if (!payload) {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }

  const username = payload.sub;
  const body = await c.req.json<{ permissions?: 'read' | 'write' }>();
  const shareToken = crypto.randomUUID();
  
  await c.env.USERS_KV.put(`share:${shareToken}`, JSON.stringify({
    username,
    permissions: body.permissions || 'read',
    createdAt: Date.now(),
    expiresAt: Date.now() + 24 * 60 * 60 * 1000
  }));

  const shareUrl = `${c.req.url.replace('/api/share', '')}/view?token=${shareToken}`;
  return c.json({ shareUrl, token: shareToken });
});

app.get('/api/ssh-keys', async (c) => {
  const authHeader = c.req.header('Authorization');
  const token = extractBearerToken(authHeader);

  if (!token) {
    return c.json({ error: 'Authentication required' }, 401);
  }

  const payload = await verifyJWT(token, c.env);
  if (!payload) {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }

  const username = payload.sub;
  const keys = await c.env.USERS_KV.get(`ssh-keys:${username}`);
  return c.json({ keys: keys ? JSON.parse(keys) : [] });
});

app.post('/api/ssh-keys', async (c) => {
  const authHeader = c.req.header('Authorization');
  const token = extractBearerToken(authHeader);

  if (!token) {
    return c.json({ error: 'Authentication required' }, 401);
  }

  const payload = await verifyJWT(token, c.env);
  if (!payload) {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }

  const username = payload.sub;
  const body = await c.req.json<{ name: string; key: string }>();
  
  const existing = await c.env.USERS_KV.get(`ssh-keys:${username}`);
  const keys = existing ? JSON.parse(existing) : [];
  keys.push({ id: crypto.randomUUID(), name: body.name, key: body.key, createdAt: Date.now() });
  await c.env.USERS_KV.put(`ssh-keys:${username}`, JSON.stringify(keys));
  
  return c.json({ success: true });
});

app.delete('/api/ssh-keys/:id', async (c) => {
  const authHeader = c.req.header('Authorization');
  const token = extractBearerToken(authHeader);

  if (!token) {
    return c.json({ error: 'Authentication required' }, 401);
  }

  const payload = await verifyJWT(token, c.env);
  if (!payload) {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }

  const username = payload.sub;
  const id = c.req.param('id');
  
  const existing = await c.env.USERS_KV.get(`ssh-keys:${username}`);
  const keys = existing ? JSON.parse(existing) : [];
  const filtered = keys.filter((k: { id: string }) => k.id !== id);
  await c.env.USERS_KV.put(`ssh-keys:${username}`, JSON.stringify(filtered));
  
  return c.json({ success: true });
});

app.get('/api/share/:token', async (c) => {
  const shareToken = c.req.param('token');
  const shareData = await c.env.USERS_KV.get(`share:${shareToken}`);
  
  if (!shareData) {
    return c.json({ error: 'Invalid or expired share link' }, 404);
  }

  const data = JSON.parse(shareData);
  if (Date.now() > data.expiresAt) {
    return c.json({ error: 'Share link expired' }, 410);
  }

  return c.json({ username: data.username, permissions: data.permissions });
});

app.delete('/api/tabs/:id', async (c) => {
  const authHeader = c.req.header('Authorization');
  const token = extractBearerToken(authHeader);

  if (!token) {
    return c.json({ error: 'Authentication required' }, 401);
  }

  const payload = await verifyJWT(token, c.env);
  if (!payload) {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }

  const username = payload.sub;
  const id = c.req.param('id');
  
  const existing = await c.env.USERS_KV.get(`tabs:${username}`);
  const tabs = existing ? JSON.parse(existing) : [];
  const filtered = tabs.filter((t: { id: string }) => t.id !== id);
  await c.env.USERS_KV.put(`tabs:${username}`, JSON.stringify(filtered));
  
  return c.json({ success: true });
});

app.get('/api/files/list', async (c) => {
  const authHeader = c.req.header('Authorization');
  const token = extractBearerToken(authHeader);

  if (!token) {
    return c.json({ error: 'Authentication required' }, 401);
  }

  const payload = await verifyJWT(token, c.env);
  if (!payload) {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }

  const username = payload.sub;
  const prefix = `user:${username}/`;

  try {
    const objects = await c.env.USER_DATA.list({ prefix });
    const files = objects.objects.map(obj => ({
      name: obj.key.replace(prefix, ''),
      size: obj.size,
      modifiedAt: obj.uploaded.getTime(),
      path: obj.key,
    }));

    return c.json({ files });
  } catch {
    return c.json({ error: 'Failed to list files' }, 500);
  }
});

app.post('/api/files/upload', async (c) => {
  const authHeader = c.req.header('Authorization');
  const token = extractBearerToken(authHeader);

  if (!token) {
    return c.json({ error: 'Authentication required' }, 401);
  }

  const payload = await verifyJWT(token, c.env);
  if (!payload) {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }

  const username = payload.sub;
  const body = await c.req.parseBody();
  const file = body.file;

  if (!file || !(file instanceof File)) {
    return c.json({ error: 'No file provided' }, 400);
  }

  const key = `user:${username}/${file.name}`;
  const arrayBuffer = await file.arrayBuffer();

  try {
    await c.env.USER_DATA.put(key, arrayBuffer, {
      httpMetadata: { contentType: file.type || 'application/octet-stream' },
    });

    return c.json({
      success: true,
      path: key,
      name: file.name,
      size: file.size,
    });
  } catch {
    return c.json({ error: 'Failed to upload file' }, 500);
  }
});

app.get('/api/files/download/:name', async (c) => {
  const authHeader = c.req.header('Authorization');
  const token = extractBearerToken(authHeader);

  if (!token) {
    return c.json({ error: 'Authentication required' }, 401);
  }

  const payload = await verifyJWT(token, c.env);
  if (!payload) {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }

  const username = payload.sub;
  const filename = c.req.param('name');
  const key = `user:${username}/${filename}`;

  try {
    const object = await c.env.USER_DATA.get(key);

    if (!object) {
      return c.json({ error: 'File not found' }, 404);
    }

    const headers = new Headers();
    headers.set('Content-Type', object.httpMetadata?.contentType || 'application/octet-stream');
    headers.set('Content-Disposition', `attachment; filename="${filename}"`);

    return new Response(object.body, { headers });
  } catch {
    return c.json({ error: 'Failed to download file' }, 500);
  }
});

export default app;
