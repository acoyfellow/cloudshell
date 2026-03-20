import { describe, expect, it } from 'vitest';
import { createApp } from './index';
import type { Env } from './types';

class MemoryKV {
  private readonly store = new Map<string, string>();

  get(key: string) {
    return Promise.resolve(this.store.get(key) ?? null);
  }

  put(key: string, value: string) {
    this.store.set(key, value);
    return Promise.resolve();
  }

  delete(key: string) {
    this.store.delete(key);
    return Promise.resolve();
  }

  list(options?: { prefix?: string }) {
    const prefix = options?.prefix ?? '';
    return Promise.resolve({
      keys: [...this.store.keys()]
        .filter((key) => key.startsWith(prefix))
        .map((name) => ({ name })),
      list_complete: true,
      cursor: undefined,
    });
  }
}

function createEnv() {
  const kv = new MemoryKV();

  return {
    env: {
      JWT_SECRET: 'test-secret',
      AWS_ACCESS_KEY_ID: 'key',
      AWS_SECRET_ACCESS_KEY: 'secret',
      R2_BUCKET_NAME: 'bucket',
      R2_ACCOUNT_ID: 'account',
      USERS_KV: kv as unknown as Env['USERS_KV'],
      USER_DATA: {} as Env['USER_DATA'],
      Sandbox: {} as never,
    } satisfies Env,
    kv,
  };
}

describe('app integration', () => {
  it('registers and logs in with unchanged JSON shapes', async () => {
    const { env } = createEnv();
    const app = createApp();

    const registerResponse = await app.fetch(
      new Request('http://localhost/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'alice', password: 'secret' }),
      }),
      env
    );
    expect(registerResponse.status).toBe(201);
    await expect(registerResponse.json()).resolves.toEqual({
      message: 'User created successfully',
    });

    const loginResponse = await app.fetch(
      new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'alice', password: 'secret' }),
      }),
      env
    );
    expect(loginResponse.status).toBe(200);

    const loginBody: unknown = await loginResponse.json();
    if (
      typeof loginBody !== 'object' ||
      loginBody === null ||
      !('token' in loginBody) ||
      typeof loginBody.token !== 'string' ||
      !('expires' in loginBody) ||
      typeof loginBody.expires !== 'number'
    ) {
      throw new Error('Login response is missing token/expires');
    }
    expect(loginBody.token).toBeTypeOf('string');
    expect(loginBody.expires).toBeGreaterThan(Date.now());
  });

  it('returns the same websocket upgrade error response', async () => {
    const { env } = createEnv();
    const app = createApp();

    const response = await app.fetch(
      new Request('http://localhost/ws/terminal?token=test'),
      env
    );

    expect(response.status).toBe(426);
    await expect(response.text()).resolves.toBe('expected websocket');
  });

  it('keeps share-token lookup public', async () => {
    const { env, kv } = createEnv();
    const app = createApp();

    await kv.put(
      'share:token-1',
      JSON.stringify({
        username: 'alice',
        permissions: 'read',
        expiresAt: Date.now() + 60_000,
      })
    );

    const response = await app.fetch(
      new Request('http://localhost/api/share/token-1'),
      env
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      username: 'alice',
      permissions: 'read',
    });
  });
});
