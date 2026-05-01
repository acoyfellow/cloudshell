/**
 * POST /api/mcp/oauth/start-from-cli
 *
 * Same as /api/mcp/oauth/start but authenticated by the container's
 * bridge ticket instead of the browser's Better Auth session. The
 * CLI calls this to obtain an authorize URL that the USER will open
 * in their browser on their own device.
 *
 * Auth: X-Cloudshell-Ticket (scope mcp-bridge). userId comes from the
 * ticket payload.
 *
 * Body: { serverUrl: string }
 * Response:
 *   { status: 'redirect', authorizeUrl: string }
 *   | { status: 'already_connected' }
 *
 * The authorizeUrl's ?redirect_uri= points back to
 * https://cloudshell.coey.dev/api/mcp/oauth/callback. When the user
 * opens it, they land on that callback URL in their browser; the
 * callback route validates Better Auth (the user is signed in on
 * their laptop) and completes the exchange on the same userId. That
 * works because both flows converge on the same user's DO.
 */

import { error, json } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { verifyBridgeTicket } from '$lib/server/mcp-bridge-auth';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async (event) => {
  const identity = await verifyBridgeTicket(event);

  const body = (await event.request
    .json()
    .catch(() => null)) as { serverUrl?: unknown } | null;
  const serverUrl = body?.serverUrl;
  if (!serverUrl || typeof serverUrl !== 'string') {
    throw error(400, 'serverUrl is required');
  }

  const redirectOrigin =
    event.url.hostname === 'host.docker.internal'
      ? 'http://localhost:5173'
      : event.url.origin;
  const redirectUrl = new URL('/api/mcp/oauth/callback', redirectOrigin).toString();

  const worker = event.platform?.env?.WORKER;
  const isDev = dev;
  const workerBase = isDev
    ? event.platform?.env?.WORKER_DEV_ORIGIN || process.env.WORKER_DEV_ORIGIN || 'http://localhost:1338'
    : 'http://worker';
  const workerUrl = new URL('/mcp/oauth/start', workerBase).toString();

  const upstreamHeaders = new Headers();
  upstreamHeaders.set('content-type', 'application/json');
  upstreamHeaders.set('X-User-Id', identity.userId);
  if (identity.userEmail) {
    upstreamHeaders.set('X-User-Email', identity.userEmail);
  }

  const bodyText = JSON.stringify({ serverUrl, redirectUrl });
  const response = isDev
    ? await fetch(workerUrl, {
        method: 'POST',
        headers: upstreamHeaders,
        body: bodyText,
      })
    : await worker!.fetch(
        new Request(workerUrl, {
          method: 'POST',
          headers: upstreamHeaders,
          body: bodyText,
        })
      );
  if (!response.ok) {
    throw error(
      response.status,
      await response.text().catch(() => 'Worker error')
    );
  }
  return json(await response.json());
};
