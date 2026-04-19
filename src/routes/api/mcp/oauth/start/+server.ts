/**
 * POST /api/mcp/oauth/start
 *
 * Initiates an MCP OAuth authorization flow on behalf of the signed-in
 * user. Returns an authorize URL the client must navigate the browser
 * to (or `already_connected` if we already hold valid tokens).
 *
 * Trust boundary: this route requires a valid Better Auth session. It
 * does the only credential check; the Worker backend trusts the
 * forwarded X-User-Id header that proxyWorkerRequest attaches.
 *
 * Body: { serverUrl: string }
 * Response:
 *   { status: 'redirect', authorizeUrl: string }
 *   | { status: 'already_connected' }
 */

import { error, json } from '@sveltejs/kit';
import { proxyWorkerRequest } from '$lib/server/worker';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async (event) => {
  const body = (await event.request
    .json()
    .catch(() => null)) as { serverUrl?: unknown } | null;
  const serverUrl = body?.serverUrl;
  if (!serverUrl || typeof serverUrl !== 'string') {
    throw error(400, 'serverUrl is required');
  }

  // The OAuth provider will redirect the browser back to this callback
  // URL. It must be on the APP origin so the user's Better Auth session
  // cookie flows with the return request (needed to authenticate the
  // code exchange).
  const redirectUrl = new URL('/api/mcp/oauth/callback', event.url.origin).toString();

  // Rewrap the body so it matches the Worker's expected shape — the
  // Worker accepts both `serverUrl` and `redirectUrl` in one POST.
  const workerRequest = new Request(event.request.url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ serverUrl, redirectUrl }),
  });
  const rewrappedEvent = {
    ...event,
    request: workerRequest,
  } as typeof event;

  const response = await proxyWorkerRequest(rewrappedEvent, '/mcp/oauth/start');
  if (!response.ok) {
    throw error(response.status, await response.text().catch(() => 'Worker error'));
  }
  return json(await response.json());
};
