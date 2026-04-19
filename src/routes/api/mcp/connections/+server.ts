/**
 * GET /api/mcp/connections
 *
 * List the MCP servers connected for the authenticated shell. The CLI
 * polls this endpoint during `mcp login` to detect completion, and
 * every so often during steady-state to show connected servers in
 * the prompt.
 *
 * Auth: X-Cloudshell-Ticket (mcp-bridge scope). Validated by
 * verifyBridgeTicket. Container never has access to Better Auth
 * cookies; the ticket is the only credential it presents.
 *
 * Response: { connections: [{serverId, connectedAt, clientId}] }
 *
 * Token values are NEVER returned by this endpoint. The CLI only
 * sees which servers exist; actual tool calls go through the bridge
 * proxy, which attaches the token server-side before forwarding.
 */

import { error, json } from '@sveltejs/kit';
import { verifyBridgeTicket } from '$lib/server/mcp-bridge-auth';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async (event) => {
  const identity = await verifyBridgeTicket(event);

  // Forward to Worker, which owns the per-user UserAgent DO. The
  // Worker trusts X-User-Id from proxyWorkerRequest-equivalent
  // callers; we build that header directly here since we've already
  // verified the bridge ticket.
  const worker = event.platform?.env?.WORKER;
  const isDev = !worker;

  const workerUrl = isDev
    ? new URL('/mcp/connections', 'http://localhost:1338').toString()
    : new URL('/mcp/connections', 'http://worker').toString();

  const upstreamHeaders = new Headers();
  upstreamHeaders.set('X-User-Id', identity.userId);
  if (identity.userEmail) {
    upstreamHeaders.set('X-User-Email', identity.userEmail);
  }

  const upstream = new Request(workerUrl, {
    method: 'GET',
    headers: upstreamHeaders,
  });

  const response = isDev ? await fetch(upstream) : await worker.fetch(upstream);

  if (!response.ok) {
    throw error(
      response.status,
      await response.text().catch(() => 'Worker error')
    );
  }

  return json(await response.json());
};
