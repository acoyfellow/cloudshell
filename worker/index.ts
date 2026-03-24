import { Hono } from 'hono';
import type { Context } from 'hono';
import { Container, getContainer } from '@cloudflare/containers';
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
  requireAuthorizedUsername,
  updateTab,
  updateSession,
} from './effect/programs';
import { runJsonRoute, runRequestEffect, runRouteEffect, toRouteErrorResponse } from './effect/runtime';
import { getUserSessionContainerId, readWorkerIdentity } from './auth';
import { isContainerActiveStatus } from './tabs';
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

function normalizeRelativeFilePath(input: string | undefined | null): string {
  const trimmed = (input ?? '').trim().replace(/^\/+|\/+$/g, '');
  if (!trimmed) {
    return '';
  }

  const segments = trimmed
    .split('/')
    .map((segment) => segment.trim())
    .filter((segment) => segment && segment !== '.' && segment !== '..');

  return segments.join('/');
}

function fileStoragePrefix(userId: string): string {
  return `${userId}/`;
}

function buildFileStorageKey(userId: string, relativePath: string): string {
  const normalizedPath = normalizeRelativeFilePath(relativePath);
  return `${fileStoragePrefix(userId)}${normalizedPath}`;
}

async function verifyShellVisibleFile(
  env: Env,
  userId: string,
  sessionId: string | null,
  relativePath: string
): Promise<boolean | null> {
  const normalizedSessionId = sessionId?.trim();
  const normalizedPath = normalizeRelativeFilePath(relativePath);

  if (!normalizedSessionId || !normalizedPath) {
    return null;
  }

  try {
    const container = getContainer(env.Sandbox, getUserSessionContainerId(userId, normalizedSessionId));
    const state = await container.getState();
    if (!isContainerActiveStatus(state.status)) {
      return null;
    }

    await container.waitForPort({ portToCheck: 8080 });

    for (let attempt = 0; attempt < 6; attempt += 1) {
      const response = await container.fetch(
        new Request(
          `http://localhost:8080/api/files/stat?path=${encodeURIComponent(normalizedPath)}`,
          {
            method: 'GET',
            headers: {
              'X-User': userId,
              'X-Session-Id': normalizedSessionId,
            },
          }
        )
      );

      if (response.ok) {
        const payload = (await response.json()) as { exists?: boolean };
        if (payload.exists === true) {
          return true;
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    return false;
  } catch {
    return null;
  }
}

function createApp() {
  const app = new Hono<{ Bindings: Env }>();

  async function requireUserId(c: Context<{ Bindings: Env }>) {
    try {
      return await runRequestEffect(
        c.env,
        requireAuthorizedUsername({ userIdHeader: c.req.header('X-User-Id') })
      );
    } catch (error) {
      return toRouteErrorResponse(c, error);
    }
  }

  // Health check
  app.get('/health', (c) => c.json({ status: 'ok' }));

  // WebSocket terminal with Effect orchestration
  app.get('/ws/terminal', (c) => {
    const upgrade = c.req.header('Upgrade');
    if (upgrade?.toLowerCase() !== 'websocket') {
      return c.text('expected websocket', 426);
    }

    // Workers Logs (not Container stdout): confirms the request reached this worker before DO/container.
    console.log('[ws/terminal] incoming', {
      hasTicket: Boolean(c.req.query('ticket')),
      querySessionId: c.req.query('sessionId') ?? null,
      queryTabId: c.req.query('tabId') ?? null,
      hasUserHeader: Boolean(c.req.header('X-User-Id')),
    });

    return runRouteEffect(
      c,
      connectTerminal({
        request: c.req.raw,
        upgrade,
        userIdHeader: c.req.header('X-User-Id'),
        ticket: c.req.query('ticket'),
        requestedSessionId: c.req.query('sessionId'),
        requestedTabId: c.req.query('tabId'),
      }),
      (response) => response
    );
  });

  // Session APIs
  app.get('/api/sessions', (c) => runJsonRoute(c, listSessions(c.req.header('X-User-Id'))));
  app.post('/api/sessions', (c) =>
    runJsonRoute(c, createSession(c.req.raw, c.req.header('X-User-Id')), 201)
  );
  app.patch('/api/sessions/:id', (c) =>
    runJsonRoute(c, updateSession(c.req.raw, c.req.header('X-User-Id'), c.req.param('id')))
  );
  app.delete('/api/sessions/:id', (c) =>
    runJsonRoute(c, deleteSession(c.req.header('X-User-Id'), c.req.param('id')))
  );
  app.post('/api/sessions/:id/checkpoint', (c) =>
    runJsonRoute(c, checkpointSession(c.req.header('X-User-Id'), c.req.param('id')))
  );

  app.get('/api/sessions/:id/tabs', (c) =>
    runJsonRoute(c, listTabs(c.req.header('X-User-Id'), c.req.param('id')))
  );
  app.post('/api/sessions/:id/tabs', (c) =>
    runJsonRoute(c, createTab(c.req.raw, c.req.header('X-User-Id'), c.req.param('id')), 201)
  );
  app.patch('/api/sessions/:id/tabs/:tabId', (c) =>
    runJsonRoute(
      c,
      updateTab(
        c.req.raw,
        c.req.header('X-User-Id'),
        c.req.param('id'),
        c.req.param('tabId')
      )
    )
  );
  app.delete('/api/sessions/:id/tabs/:tabId', (c) =>
    runJsonRoute(
      c,
      deleteTab(c.req.header('X-User-Id'), c.req.param('id'), c.req.param('tabId'))
    )
  );

  app.get('/api/sessions/:id/ports', (c) =>
    runJsonRoute(c, listPorts(c.req.header('X-User-Id'), c.req.param('id')))
  );
  app.post('/api/sessions/:id/ports', (c) =>
    runJsonRoute(c, forwardPort(c.req.raw, c.req.header('X-User-Id'), c.req.param('id')), 201)
  );

  // Legacy compatibility routes
  app.get('/api/ports', (c) => runJsonRoute(c, listLegacyPorts(c.req.header('X-User-Id'))));
  app.post('/api/ports/forward', (c) =>
    runJsonRoute(c, forwardLegacyPort(c.req.raw, c.req.header('X-User-Id')))
  );
  app.get('/api/tabs', (c) => runJsonRoute(c, listLegacyTabs(c.req.header('X-User-Id'))));
  app.post('/api/tabs', (c) =>
    runJsonRoute(c, createLegacyTab(c.req.raw, c.req.header('X-User-Id')))
  );
  app.delete('/api/tabs/:id', (c) =>
    runJsonRoute(c, deleteLegacyTab(c.req.header('X-User-Id'), c.req.param('id')))
  );
  app.post('/api/backup', (c) =>
    runJsonRoute(c, backupWorkspace(c.req.header('X-User-Id')))
  );

  app.post('/api/share', async (c) => {
    const userId = await requireUserId(c);
    if (userId instanceof Response) {
      return userId;
    }
    const identity = readWorkerIdentity(c.req.raw.headers);

    const body = await c.req.raw
      .json<{ permissions?: 'read' | 'write' }>()
      .catch(() => ({}) as { permissions?: 'read' | 'write' });
    const shareToken = crypto.randomUUID();

    await c.env.USERS_KV.put(
      `share:${shareToken}`,
      JSON.stringify({
        userId,
        userEmail: identity?.userEmail ?? null,
        permissions: body.permissions || 'read',
        createdAt: Date.now(),
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      })
    );

    const shareUrl = `/share/${shareToken}`;
    return c.json({ shareUrl, token: shareToken });
  });

  app.get('/api/ssh-keys', async (c) => {
    const userId = await requireUserId(c);
    if (userId instanceof Response) {
      return userId;
    }

    interface SSHKey {
      id: string;
      name: string;
      key: string;
      createdAt: number;
    }

    const keys = await c.env.USERS_KV.get(`ssh-keys:${userId}`);
    return c.json({ keys: keys ? (JSON.parse(keys) as SSHKey[]) : [] });
  });

  app.post('/api/ssh-keys', async (c) => {
    const userId = await requireUserId(c);
    if (userId instanceof Response) {
      return userId;
    }

    interface SSHKey {
      id: string;
      name: string;
      key: string;
      createdAt: number;
    }

    const body = await c.req.raw.json<{ name: string; key: string }>();
    const existing = await c.env.USERS_KV.get(`ssh-keys:${userId}`);
    const keys: SSHKey[] = existing ? (JSON.parse(existing) as SSHKey[]) : [];
    keys.push({ id: crypto.randomUUID(), name: body.name, key: body.key, createdAt: Date.now() });
    await c.env.USERS_KV.put(`ssh-keys:${userId}`, JSON.stringify(keys));

    return c.json({ success: true });
  });

  app.delete('/api/ssh-keys/:id', async (c) => {
    const userId = await requireUserId(c);
    if (userId instanceof Response) {
      return userId;
    }

    interface SSHKey {
      id: string;
      name: string;
      key: string;
      createdAt: number;
    }

    const existing = await c.env.USERS_KV.get(`ssh-keys:${userId}`);
    const keys: SSHKey[] = existing ? (JSON.parse(existing) as SSHKey[]) : [];
    const filtered = keys.filter((key) => key.id !== c.req.param('id'));
    await c.env.USERS_KV.put(`ssh-keys:${userId}`, JSON.stringify(filtered));

    return c.json({ success: true });
  });

  app.post('/api/recording/start', async (c) => {
    const authenticated = await requireUserId(c);
    if (authenticated instanceof Response) {
      return authenticated;
    }

    return c.json({ recording: true, startedAt: Date.now() });
  });

  app.post('/api/recording/stop', async (c) => {
    const authenticated = await requireUserId(c);
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
      userId: string;
      userEmail: string | null;
      permissions: string;
      expiresAt: number;
    }

    const data = JSON.parse(shareData) as ShareData;
    if (Date.now() > data.expiresAt) {
      return c.json({ error: 'Share link expired' }, 410);
    }

    return c.json({
      userId: data.userId,
      userEmail: data.userEmail,
      permissions: data.permissions,
    });
  });

  async function listFiles(c: Context<{ Bindings: Env }>) {
    const userId = await requireUserId(c);
    if (userId instanceof Response) {
      return userId;
    }

    const prefix = fileStoragePrefix(userId);

    try {
      const objects = await c.env.USER_DATA.list({ prefix });
      const files = objects.objects.map((object) => ({
        name: object.key.replace(prefix, '').split('/').pop() ?? object.key.replace(prefix, ''),
        size: object.size,
        modifiedAt: object.uploaded.getTime(),
        path: object.key.replace(prefix, ''),
      }));

      return c.json({ files });
    } catch {
      return c.json({ error: 'Failed to list files' }, 500);
    }
  }

  app.get('/api/files/list', listFiles);
  app.get('/api/files/tree', listFiles);

  app.post('/api/files/upload', async (c) => {
    const userId = await requireUserId(c);
    if (userId instanceof Response) {
      return userId;
    }

    const body = await c.req.parseBody();
    const file = body.file;
    const targetPath =
      typeof body.path === 'string' ? normalizeRelativeFilePath(body.path) : '';
    const activeSessionId =
      typeof body.sessionId === 'string' && body.sessionId.trim() !== ''
        ? body.sessionId.trim()
        : null;

    if (!file || !(file instanceof File)) {
      return c.json({ error: 'No file provided' }, 400);
    }

    const relativePath = normalizeRelativeFilePath(
      targetPath ? `${targetPath}/${file.name}` : file.name
    );
    const key = buildFileStorageKey(userId, relativePath);
    const arrayBuffer = await file.arrayBuffer();

    try {
      await c.env.USER_DATA.put(key, arrayBuffer, {
        httpMetadata: { contentType: file.type || 'application/octet-stream' },
      });

      const shellVisible = await verifyShellVisibleFile(
        c.env,
        userId,
        activeSessionId,
        relativePath
      );

      return c.json({
        success: true,
        path: relativePath,
        name: file.name,
        size: file.size,
        shellVisible,
      });
    } catch {
      return c.json({ error: 'Failed to upload file' }, 500);
    }
  });

  app.get('/api/files/download/*', async (c) => {
    const userId = await requireUserId(c);
    if (userId instanceof Response) {
      return userId;
    }

    const requestPath = c.req.path.replace('/api/files/download/', '');
    const relativePath = normalizeRelativeFilePath(decodeURIComponent(requestPath));

    if (!relativePath) {
      return c.json({ error: 'File path is required' }, 400);
    }

    const key = buildFileStorageKey(userId, relativePath);

    try {
      const object = await c.env.USER_DATA.get(key);
      if (!object) {
        return c.json({ error: 'File not found' }, 404);
      }

      const headers = new Headers();
      headers.set('Content-Type', object.httpMetadata?.contentType || 'application/octet-stream');
      headers.set('Content-Disposition', `attachment; filename="${relativePath.split('/').pop() ?? relativePath}"`);

      return new Response(object.body, { headers });
    } catch {
      return c.json({ error: 'Failed to download file' }, 500);
    }
  });

  app.get('/api/files/download/:name', async (c) => {
    const userId = await requireUserId(c);
    if (userId instanceof Response) {
      return userId;
    }

    const filename = normalizeRelativeFilePath(c.req.param('name'));
    const key = buildFileStorageKey(userId, filename);

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
