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

// Current Container class
class CloudShellTerminal extends Container {
  defaultPort = 8080;
  sleepAfter = '5m';
}

// Legacy classes for backwards compatibility
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
    const isValid = await verifyPassword(password, user.passwordHash);

    if (!isValid) {
      return c.json({ error: 'Invalid credentials' }, 401);
    }

    // Generate JWT
    const { token, expires } = await generateJWT(username);

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
    const passwordHash = await hashPassword(password);
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

  const payload = await verifyJWT(token);
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

  const payload = await verifyJWT(token);
  if (!payload) {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }

  const username = payload.sub;
  const id = getUserContainerId(username);

  // Get the container - each user gets isolated instance
  const container = getContainer(c.env.Sandbox, id);

  // Start if not running
  const state = await container.getState();
  if (state.status !== 'healthy') {
    await container.start();
  }

  // Proxy WebSocket to container
  return container.fetch(c.req.raw);
});

// Main terminal page (requires auth)
app.get('/', async (c) => {
  const token = c.req.query('token');

  if (!token) {
    return c.redirect('/login');
  }

  const payload = await verifyJWT(token);
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

  const payload = await verifyJWT(token);
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

  const payload = await verifyJWT(token);
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
  const url = `https://${subdomain}.cloudshell.coy.workers.dev`;

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

  const payload = await verifyJWT(token);
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

export default app;
