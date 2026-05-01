/**
 * /api/mcp/connections
 *
 * GET: list the MCP servers connected for the authenticated shell,
 *      annotated with token status ('active' | 'expired' | 'broken')
 *      and expiry timestamp. Used by:
 *        - `mcp list` (CLI) for a status column
 *        - `mcp login` polling (CLI) to detect flow completion
 *        - Tools panel UI to render the connections list
 *      Token values are NEVER returned by this endpoint. Actual tool
 *      calls go through the bridge proxy, which attaches the token
 *      server-side before forwarding.
 *
 * DELETE ?server=<url>: remove a stored connection. Clears tokens,
 *      client_info, saved state and code_verifier for this
 *      (user, server) pair. Idempotent.
 *
 * Auth: X-Cloudshell-Ticket (mcp-bridge scope). Validated by
 * verifyBridgeTicket. Container never has access to Better Auth
 * cookies; the ticket is the only credential it presents.
 */

import { error, json, type RequestEvent } from '@sveltejs/kit';
import { verifyBridgeTicket } from '$lib/server/mcp-bridge-auth';
import type { RequestHandler } from './$types';

/**
 * Shared forwarder to the Worker's /mcp/connections endpoint. We
 * build the upstream request preserving method + query string and
 * attach X-User-Id from the verified bridge ticket.
 */
async function forward(event: RequestEvent, method: 'GET' | 'DELETE') {
  const identity = await verifyBridgeTicket(event);

  const worker = event.platform?.env?.WORKER;
  const isDev = !worker;
  const base = isDev ? 'http://localhost:1338' : 'http://worker';
  const workerUrl = new URL('/mcp/connections', base);
  workerUrl.search = event.url.search;

  const upstreamHeaders = new Headers();
  upstreamHeaders.set('X-User-Id', identity.userId);
  if (identity.userEmail) {
    upstreamHeaders.set('X-User-Email', identity.userEmail);
  }

  const response = isDev
    ? await fetch(workerUrl.toString(), { method, headers: upstreamHeaders })
    : await worker!.fetch(
        new Request(workerUrl.toString(), {
          method,
          headers: upstreamHeaders,
        })
      );

  if (!response.ok) {
    throw error(
      response.status,
      await response.text().catch(() => 'Worker error')
    );
  }

  return json(await response.json());
}

export const GET: RequestHandler = (event) => forward(event, 'GET');
export const DELETE: RequestHandler = (event) => forward(event, 'DELETE');
