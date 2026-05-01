import { afterEach, describe, expect, it, vi } from 'vitest';
import { bridgeMcpRequest } from './mcp-bridge';

function envWithToken(token: string) {
  return {
    UserAgent: {
      idFromName(userId: string) {
        return `id:${userId}`;
      },
      get() {
        return {
          async getAccessTokenFor() {
            return token;
          },
        };
      },
    },
  } as any;
}

describe('bridgeMcpRequest fake upstream proof', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('forwards JSON-RPC to fake upstream with bearer and without Cloudshell internals', async () => {
    const calls: Array<{ url: string; init: RequestInit; body: string }> = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      const body = new TextDecoder().decode(init.body as ArrayBuffer);
      calls.push({ url, init, body });
      return new Response(
        JSON.stringify({ jsonrpc: '2.0', id: 'fake', result: { tools: [{ name: 'fake_tool' }] } }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    });

    const request = new Request('https://cloudshell.local/mcp/bridge/mcp', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        'x-cloudshell-ticket': 'runtime-ticket',
        'x-user-id': 'user-123',
        'x-user-email': 'u@example.com',
        cookie: 'session=secret',
        'cf-ray': 'abc',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });

    const response = await bridgeMcpRequest(envWithToken('fake-upstream-token'), {
      userId: 'user-123',
      serverUrl: 'https://mcp.example.test',
      path: '/mcp',
      request,
      baseRedirectUrl: 'https://cloudshell.local/api/mcp/oauth/callback',
    });

    expect(response.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://mcp.example.test/mcp');
    expect(calls[0].body).toContain('tools/list');

    const headers = calls[0].init.headers as Headers;
    expect(headers.get('authorization')).toBe('Bearer fake-upstream-token');
    expect(headers.get('content-type')).toBe('application/json');
    expect(headers.get('accept')).toBe('application/json, text/event-stream');
    expect(headers.get('x-cloudshell-ticket')).toBeNull();
    expect(headers.get('x-user-id')).toBeNull();
    expect(headers.get('x-user-email')).toBeNull();
    expect(headers.get('cookie')).toBeNull();
    expect(headers.get('cf-ray')).toBeNull();

    await expect(response.json()).resolves.toMatchObject({ result: { tools: [{ name: 'fake_tool' }] } });
  });
});
