import { describe, expect, it, vi } from 'vitest';
import { createApp } from './index';
import type { Env } from './types';

class MockKVNamespace implements KVNamespace {
  private readonly store = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }

  async put(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async list(options?: {
    prefix?: string;
    limit?: number;
    cursor?: string;
  }): Promise<{ keys: { name: string }[]; list_complete: boolean; cursor?: string }> {
    const prefix = options?.prefix ?? '';
    const keys = [...this.store.keys()]
      .filter((key) => key.startsWith(prefix))
      .map((name) => ({ name }));

    return {
      keys,
      list_complete: true,
    };
  }
}

interface StoredObject {
  key: string;
  body: Uint8Array;
  size: number;
  uploaded: Date;
  httpMetadata?: { contentType?: string };
}

class MockR2Bucket implements R2Bucket {
  private readonly store = new Map<string, StoredObject>();

  async put(
    key: string,
    value:
      | ReadableStream
      | ArrayBuffer
      | ArrayBufferView
      | string
      | Blob
      | null,
    options?: { httpMetadata?: { contentType?: string } }
  ): Promise<void> {
    let body: Uint8Array;

    if (value instanceof ArrayBuffer) {
      body = new Uint8Array(value);
    } else if (ArrayBuffer.isView(value)) {
      body = new Uint8Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
    } else if (typeof value === 'string') {
      body = new TextEncoder().encode(value);
    } else if (value instanceof Blob) {
      body = new Uint8Array(await value.arrayBuffer());
    } else {
      throw new Error('Unsupported R2 put payload for test');
    }

    this.store.set(key, {
      key,
      body,
      size: body.byteLength,
      uploaded: new Date(),
      httpMetadata: options?.httpMetadata,
    });
  }

  async get(key: string): Promise<{ body: Uint8Array; httpMetadata?: { contentType?: string } } | null> {
    const object = this.store.get(key);
    if (!object) {
      return null;
    }

    return {
      body: object.body,
      httpMetadata: object.httpMetadata,
    };
  }

  async list(options?: {
    prefix?: string;
    limit?: number;
    cursor?: string;
  }): Promise<{ objects: Array<{ key: string; size: number; uploaded: Date; httpMetadata?: { contentType?: string } }> }> {
    const prefix = options?.prefix ?? '';
    const objects = [...this.store.values()]
      .filter((object) => object.key.startsWith(prefix))
      .map(({ key, size, uploaded, httpMetadata }) => ({
        key,
        size,
        uploaded,
        httpMetadata,
      }));

    return { objects };
  }
}

function createEnv(): Env {
  return {
    AWS_ACCESS_KEY_ID: '',
    AWS_SECRET_ACCESS_KEY: '',
    R2_BUCKET_NAME: 'test-bucket',
    R2_ACCOUNT_ID: 'test-account',
    PORT_FORWARD_BASE_DOMAIN: 'example.com',
    TERMINAL_TICKET_SECRET: 'test-secret',
    Sandbox: {} as Env['Sandbox'],
    UserAgent: {
      idFromName(userId: string) { return `id:${userId}`; },
      get() { return { async getAccessTokenFor() { return 'route-token'; } }; },
    } as unknown as Env['UserAgent'],
    USERS_KV: new MockKVNamespace(),
    USER_DATA: new MockR2Bucket() as unknown as R2Bucket,
  };
}

function authHeaders(extra: Record<string, string> = {}): HeadersInit {
  return {
    'X-User-Id': 'alice',
    'X-User-Email': 'alice@example.com',
    ...extra,
  };
}

describe('worker utility and file routes', () => {
  it('creates and resolves share links', async () => {
    const app = createApp();
    const env = createEnv();

    const createResponse = await app.request(
      'https://example.com/api/share',
      {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ permissions: 'read' }),
      },
      env
    );

    expect(createResponse.status).toBe(200);
    const created = (await createResponse.json()) as { token: string; shareUrl: string };
    expect(created.shareUrl).toBe(`/share/${created.token}`);

    const lookupResponse = await app.request(
      `https://example.com/api/share/${created.token}`,
      undefined,
      env
    );

    expect(lookupResponse.status).toBe(200);
    await expect(lookupResponse.json()).resolves.toMatchObject({
      userId: 'alice',
      userEmail: 'alice@example.com',
      permissions: 'read',
    });
  });

  it('supports SSH key lifecycle', async () => {
    const app = createApp();
    const env = createEnv();

    const createResponse = await app.request(
      'https://example.com/api/ssh-keys',
      {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          name: 'deploy',
          key: 'ssh-ed25519 AAAATEST alice@example.com',
        }),
      },
      env
    );

    expect(createResponse.status).toBe(200);

    const listResponse = await app.request(
      'https://example.com/api/ssh-keys',
      { headers: authHeaders() },
      env
    );
    const listed = (await listResponse.json()) as {
      keys: Array<{ id: string; name: string; key: string }>;
    };

    expect(listed.keys).toHaveLength(1);
    expect(listed.keys[0]).toMatchObject({
      name: 'deploy',
      key: 'ssh-ed25519 AAAATEST alice@example.com',
    });

    const deleteResponse = await app.request(
      `https://example.com/api/ssh-keys/${listed.keys[0].id}`,
      {
        method: 'DELETE',
        headers: authHeaders(),
      },
      env
    );

    expect(deleteResponse.status).toBe(200);

    const afterDelete = await app.request(
      'https://example.com/api/ssh-keys',
      { headers: authHeaders() },
      env
    );
    await expect(afterDelete.json()).resolves.toEqual({ keys: [] });
  });

  it('uploads, lists, and downloads nested files from the user home tree', async () => {
    const app = createApp();
    const env = createEnv();
    const formData = new FormData();
    formData.append('file', new File(['id,name\n1,Alice\n'], 'users.csv', { type: 'text/csv' }));
    formData.append('path', 'demo/nested');

    const uploadResponse = await app.request(
      'https://example.com/api/files/upload',
      {
        method: 'POST',
        headers: authHeaders(),
        body: formData,
      },
      env
    );

    expect(uploadResponse.status).toBe(200);
    await expect(uploadResponse.json()).resolves.toMatchObject({
      success: true,
      path: 'demo/nested/users.csv',
      name: 'users.csv',
    });

    const treeResponse = await app.request(
      'https://example.com/api/files/tree',
      { headers: authHeaders() },
      env
    );
    await expect(treeResponse.json()).resolves.toEqual({
      files: [
        expect.objectContaining({
          name: 'users.csv',
          path: 'demo/nested/users.csv',
        }),
      ],
    });

    const downloadResponse = await app.request(
      'https://example.com/api/files/download/demo/nested/users.csv',
      { headers: authHeaders() },
      env
    );

    expect(downloadResponse.status).toBe(200);
    expect(downloadResponse.headers.get('content-type')).toContain('text/csv');
    await expect(downloadResponse.text()).resolves.toBe('id,name\n1,Alice\n');
  });

  it('starts and stops recording for an authenticated user', async () => {
    const app = createApp();
    const env = createEnv();

    const startResponse = await app.request(
      'https://example.com/api/recording/start',
      {
        method: 'POST',
        headers: authHeaders(),
      },
      env
    );

    expect(startResponse.status).toBe(200);
    await expect(startResponse.json()).resolves.toMatchObject({
      recording: true,
    });

    const stopResponse = await app.request(
      'https://example.com/api/recording/stop',
      {
        method: 'POST',
        headers: authHeaders(),
      },
      env
    );

    expect(stopResponse.status).toBe(200);
    await expect(stopResponse.json()).resolves.toMatchObject({
      saved: true,
    });
  });

  it('creates and lists forwarded ports for a session', async () => {
    const app = createApp();
    const env = createEnv();

    const createSessionResponse = await app.request(
      'https://example.com/api/sessions',
      {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ name: 'Ports' }),
      },
      env
    );
    const created = (await createSessionResponse.json()) as {
      session: { id: string };
    };

    const forwardResponse = await app.request(
      `https://example.com/api/sessions/${created.session.id}/ports`,
      {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ port: 3000 }),
      },
      env
    );

    expect(forwardResponse.status).toBe(201);
    await expect(forwardResponse.json()).resolves.toMatchObject({
      port: 3000,
      url: expect.stringContaining('3000-shell-alice'),
    });

    const listResponse = await app.request(
      `https://example.com/api/sessions/${created.session.id}/ports`,
      { headers: authHeaders() },
      env
    );

    await expect(listResponse.json()).resolves.toEqual({
      ports: [expect.objectContaining({ port: 3000 })],
    });
  });
});


describe('worker MCP bridge route', () => {
  it('requires forwarded user identity', async () => {
    const app = createApp();
    const env = createEnv();
    const response = await app.request(
      'https://example.com/mcp/bridge/mcp?server=https://mcp.example.test',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Bridge-Redirect-Url': 'https://cloudshell.local/api/mcp/oauth/callback',
        },
        body: '{}',
      },
      env
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: 'X-User-Id required' });
  });

  it('requires server query param', async () => {
    const app = createApp();
    const env = createEnv();
    const response = await app.request(
      'https://example.com/mcp/bridge/mcp',
      {
        method: 'POST',
        headers: authHeaders({
          'Content-Type': 'application/json',
          'X-Bridge-Redirect-Url': 'https://cloudshell.local/api/mcp/oauth/callback',
        }),
        body: '{}',
      },
      env
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: 'server query param required' });
  });

  it('requires bridge redirect header', async () => {
    const app = createApp();
    const env = createEnv();
    const response = await app.request(
      'https://example.com/mcp/bridge/mcp?server=https://mcp.example.test',
      {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: '{}',
      },
      env
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: 'X-Bridge-Redirect-Url header required' });
  });

  it('forwards through the bridge route with server-side bearer and stripped internals', async () => {
    const app = createApp();
    const env = createEnv();
    const calls: Array<{ url: string; init: RequestInit; body: string }> = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      calls.push({ url, init, body: new TextDecoder().decode(init.body as ArrayBuffer) });
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: 'route', result: { ok: true } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    try {
      const response = await app.request(
        'https://example.com/mcp/bridge/mcp?server=https://mcp.example.test',
        {
          method: 'POST',
          headers: authHeaders({
            'Content-Type': 'application/json',
            Accept: 'application/json, text/event-stream',
            'X-Bridge-Redirect-Url': 'https://cloudshell.local/api/mcp/oauth/callback',
            'X-Cloudshell-Ticket': 'runtime-ticket',
            Cookie: 'session=secret',
            'CF-Ray': 'abc',
          }),
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
        },
        env
      );

      expect(response.status).toBe(200);
      expect(calls).toHaveLength(1);
      expect(calls[0].url).toBe('https://mcp.example.test/mcp');
      expect(calls[0].body).toContain('tools/list');
      const headers = calls[0].init.headers as Headers;
      expect(headers.get('authorization')).toBe('Bearer route-token');
      expect(headers.get('x-cloudshell-ticket')).toBeNull();
      expect(headers.get('x-user-id')).toBeNull();
      expect(headers.get('x-user-email')).toBeNull();
      expect(headers.get('cookie')).toBeNull();
      expect(headers.get('cf-ray')).toBeNull();
      await expect(response.json()).resolves.toMatchObject({ result: { ok: true } });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
