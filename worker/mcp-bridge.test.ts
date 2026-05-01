import { describe, expect, it, vi } from 'vitest';
import { bridgeMcpRequest } from './mcp-bridge';

function envWithToken(token: string | null) {
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

describe('bridgeMcpRequest local proof harness', () => {
  it('attaches upstream bearer server-side and strips container/internal headers', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      const request = new Request('https://cloudshell.local/mcp/bridge/mcp?server=https://mcp.example.com', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-cloudshell-ticket': 'scoped-ticket-from-container',
          'x-user-id': 'user-1',
          'x-user-email': 'user@example.com',
          cookie: 'session=secret',
          'cf-ray': 'abc',
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
      });

      const response = await bridgeMcpRequest(envWithToken('upstream-token'), {
        userId: 'user-1',
        serverUrl: 'https://mcp.example.com',
        path: '/mcp',
        request,
        baseRedirectUrl: 'https://cloudshell.local/api/mcp/oauth/callback',
      });

      expect(response.status).toBe(200);
      expect(fetchMock).toHaveBeenCalledOnce();
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://mcp.example.com/mcp');
      expect(init.method).toBe('POST');
      const headers = init.headers as Headers;
      expect(headers.get('authorization')).toBe('Bearer upstream-token');
      expect(headers.get('x-cloudshell-ticket')).toBeNull();
      expect(headers.get('x-user-id')).toBeNull();
      expect(headers.get('x-user-email')).toBeNull();
      expect(headers.get('cookie')).toBeNull();
      expect(headers.get('cf-ray')).toBeNull();
      expect(headers.get('content-type')).toBe('application/json');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('returns not_connected when the broker has no upstream token', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    try {
      const response = await bridgeMcpRequest(envWithToken(null), {
        userId: 'user-1',
        serverUrl: 'https://mcp.example.com',
        path: '/mcp',
        request: new Request('https://cloudshell.local/mcp/bridge/mcp', { method: 'POST', body: '{}' }),
        baseRedirectUrl: 'https://cloudshell.local/api/mcp/oauth/callback',
      });

      expect(response.status).toBe(401);
      expect(await response.json()).toMatchObject({ error: 'not_connected' });
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
