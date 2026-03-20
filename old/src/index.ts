import { Hono } from 'hono';
import type { Context } from 'hono';
import { Container } from '@cloudflare/containers';
import { verifyJWT } from './auth';
import {
  backupWorkspace,
  checkpointSession,
  connectTerminal,
  createLegacyTab,
  createSession,
  createTab,
  deleteLegacyTab,
  deleteSession,
  deleteTab,
  forwardLegacyPort,
  forwardPort,
  listLegacyPorts,
  listLegacyTabs,
  listPorts,
  listSessions,
  listTabs,
  login,
  register,
  requireAuthorizedUsername,
  updateSession,
} from './effect/programs';
import { runJsonRoute, runRequestEffect, runRouteEffect, toRouteErrorResponse } from './effect/runtime';
import { html, loginHtml } from './shell';
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

function createApp() {
  const app = new Hono<{ Bindings: Env }>();

  async function requireUsername(c: Context<{ Bindings: Env }>) {
    try {
      return await runRequestEffect(
        c.env,
        requireAuthorizedUsername({ authorizationHeader: c.req.header('Authorization') })
      );
    } catch (error) {
      return toRouteErrorResponse(c, error);
    }
  }

  // Health check
  app.get('/health', (c) => c.json({ status: 'ok' }));

  // Public routes
  app.get('/login', (c) => c.html(loginHtml()));
  app.post('/api/auth/login', (c) => runJsonRoute(c, login(c.req.raw)));
  app.post('/api/auth/register', (c) => runJsonRoute(c, register(c.req.raw), 201));

  // WebSocket terminal with Effect orchestration
  app.get('/ws/terminal', (c) => {
    const upgrade = c.req.header('Upgrade');
    if (upgrade?.toLowerCase() !== 'websocket') {
      return c.text('expected websocket', 426);
    }

    return runRouteEffect(
      c,
      connectTerminal({
        request: c.req.raw,
        upgrade,
        authorizationHeader: c.req.header('Authorization'),
        queryToken: c.req.query('token'),
        requestedSessionId: c.req.query('sessionId'),
        requestedTabId: c.req.query('tabId'),
      }),
      (response) => response
    );
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

  // Session APIs
  app.get('/api/sessions', (c) => runJsonRoute(c, listSessions(c.req.header('Authorization'))));
  app.post('/api/sessions', (c) =>
    runJsonRoute(c, createSession(c.req.raw, c.req.header('Authorization')), 201)
  );
  app.patch('/api/sessions/:id', (c) =>
    runJsonRoute(
      c,
      updateSession(c.req.raw, c.req.header('Authorization'), c.req.param('id'))
    )
  );
  app.delete('/api/sessions/:id', (c) =>
    runJsonRoute(c, deleteSession(c.req.header('Authorization'), c.req.param('id')))
  );
  app.post('/api/sessions/:id/checkpoint', (c) =>
    runJsonRoute(c, checkpointSession(c.req.header('Authorization'), c.req.param('id')))
  );

  app.get('/api/sessions/:id/tabs', (c) =>
    runJsonRoute(c, listTabs(c.req.header('Authorization'), c.req.param('id')))
  );
  app.post('/api/sessions/:id/tabs', (c) =>
    runJsonRoute(
      c,
      createTab(c.req.raw, c.req.header('Authorization'), c.req.param('id')),
      201
    )
  );
  app.delete('/api/sessions/:id/tabs/:tabId', (c) =>
    runJsonRoute(
      c,
      deleteTab(c.req.header('Authorization'), c.req.param('id'), c.req.param('tabId'))
    )
  );

  app.get('/api/sessions/:id/ports', (c) =>
    runJsonRoute(c, listPorts(c.req.header('Authorization'), c.req.param('id')))
  );
  app.post('/api/sessions/:id/ports', (c) =>
    runJsonRoute(
      c,
      forwardPort(c.req.raw, c.req.header('Authorization'), c.req.param('id')),
      201
    )
  );

  // Legacy compatibility routes
  app.get('/api/ports', (c) => runJsonRoute(c, listLegacyPorts(c.req.header('Authorization'))));
  app.post('/api/ports/forward', (c) =>
    runJsonRoute(c, forwardLegacyPort(c.req.raw, c.req.header('Authorization')))
  );
  app.get('/api/tabs', (c) => runJsonRoute(c, listLegacyTabs(c.req.header('Authorization'))));
  app.post('/api/tabs', (c) =>
    runJsonRoute(c, createLegacyTab(c.req.raw, c.req.header('Authorization')))
  );
  app.delete('/api/tabs/:id', (c) =>
    runJsonRoute(c, deleteLegacyTab(c.req.header('Authorization'), c.req.param('id')))
  );
  app.post('/api/backup', (c) =>
    runJsonRoute(c, backupWorkspace(c.req.header('Authorization')))
  );

  // Remaining authenticated APIs
  app.post('/api/container/custom', async (c) => {
    const username = await requireUsername(c);
    if (username instanceof Response) {
      return username;
    }

    const body = await c.req.raw
      .json<{ dockerfile?: string }>()
      .catch(() => ({}) as { dockerfile?: string });
    if (!body.dockerfile) {
      return c.json({ error: 'Dockerfile content required' }, 400);
    }

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

  app.post('/api/share', async (c) => {
    const username = await requireUsername(c);
    if (username instanceof Response) {
      return username;
    }

    const body = await c.req.raw
      .json<{ permissions?: 'read' | 'write' }>()
      .catch(() => ({}) as { permissions?: 'read' | 'write' });
    const shareToken = crypto.randomUUID();

    await c.env.USERS_KV.put(
      `share:${shareToken}`,
      JSON.stringify({
        username,
        permissions: body.permissions || 'read',
        createdAt: Date.now(),
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      })
    );

    const shareUrl = `${c.req.url.replace('/api/share', '')}/view?token=${shareToken}`;
    return c.json({ shareUrl, token: shareToken });
  });

  app.get('/api/ssh-keys', async (c) => {
    const username = await requireUsername(c);
    if (username instanceof Response) {
      return username;
    }

    interface SSHKey {
      id: string;
      name: string;
      key: string;
      createdAt: number;
    }

    const keys = await c.env.USERS_KV.get(`ssh-keys:${username}`);
    return c.json({ keys: keys ? (JSON.parse(keys) as SSHKey[]) : [] });
  });

  app.post('/api/ssh-keys', async (c) => {
    const username = await requireUsername(c);
    if (username instanceof Response) {
      return username;
    }

    interface SSHKey {
      id: string;
      name: string;
      key: string;
      createdAt: number;
    }

    const body = await c.req.raw.json<{ name: string; key: string }>();
    const existing = await c.env.USERS_KV.get(`ssh-keys:${username}`);
    const keys: SSHKey[] = existing ? (JSON.parse(existing) as SSHKey[]) : [];
    keys.push({ id: crypto.randomUUID(), name: body.name, key: body.key, createdAt: Date.now() });
    await c.env.USERS_KV.put(`ssh-keys:${username}`, JSON.stringify(keys));

    return c.json({ success: true });
  });

  app.delete('/api/ssh-keys/:id', async (c) => {
    const username = await requireUsername(c);
    if (username instanceof Response) {
      return username;
    }

    interface SSHKey {
      id: string;
      name: string;
      key: string;
      createdAt: number;
    }

    const existing = await c.env.USERS_KV.get(`ssh-keys:${username}`);
    const keys: SSHKey[] = existing ? (JSON.parse(existing) as SSHKey[]) : [];
    const filtered = keys.filter((key) => key.id !== c.req.param('id'));
    await c.env.USERS_KV.put(`ssh-keys:${username}`, JSON.stringify(filtered));

    return c.json({ success: true });
  });

  app.post('/api/recording/start', async (c) => {
    const authenticated = await requireUsername(c);
    if (authenticated instanceof Response) {
      return authenticated;
    }

    return c.json({ recording: true, startedAt: Date.now() });
  });

  app.post('/api/recording/stop', async (c) => {
    const authenticated = await requireUsername(c);
    if (authenticated instanceof Response) {
      return authenticated;
    }

    return c.json({ saved: true, stoppedAt: Date.now() });
  });

  // Public share lookup
  app.get('/api/share/:token', async (c) => {
    const shareToken = c.req.param('token');
    const shareData = await c.env.USERS_KV.get(`share:${shareToken}`);

    if (!shareData) {
      return c.json({ error: 'Invalid or expired share link' }, 404);
    }

    interface ShareData {
      username: string;
      permissions: string;
      expiresAt: number;
    }

    const data = JSON.parse(shareData) as ShareData;
    if (Date.now() > data.expiresAt) {
      return c.json({ error: 'Share link expired' }, 410);
    }

    return c.json({ username: data.username, permissions: data.permissions });
  });

  app.get('/api/files/list', async (c) => {
    const username = await requireUsername(c);
    if (username instanceof Response) {
      return username;
    }

    const prefix = `user:${username}/`;

    try {
      const objects = await c.env.USER_DATA.list({ prefix });
      const files = objects.objects.map((object) => ({
        name: object.key.replace(prefix, ''),
        size: object.size,
        modifiedAt: object.uploaded.getTime(),
        path: object.key,
      }));

      return c.json({ files });
    } catch {
      return c.json({ error: 'Failed to list files' }, 500);
    }
  });

  app.post('/api/files/upload', async (c) => {
    const username = await requireUsername(c);
    if (username instanceof Response) {
      return username;
    }

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
    const username = await requireUsername(c);
    if (username instanceof Response) {
      return username;
    }

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

  return app;
}

const app = createApp();

export { createApp };
export default app;
