/**
 * /api/mcp/bridge/*
 *
 * Catch-all bridge endpoint for MCP JSON-RPC calls from the container.
 * The CLI (A.6) hits paths like:
 *   POST https://cloudshell.coey.dev/api/mcp/bridge/mcp?server=<url>
 *   POST https://cloudshell.coey.dev/api/mcp/bridge/sse?server=<url>
 *
 * Auth: X-Cloudshell-Ticket (scope mcp-bridge). Validated by
 * verifyBridgeTicket; no Better Auth cookie needed.
 *
 * Behaviour:
 *   1. Verify bridge ticket, extract userId.
 *   2. Forward the full request (method, body, headers minus our own
 *      internal ones) to the Worker's /mcp/bridge/* endpoint.
 *   3. Worker attaches the OAuth bearer and forwards upstream;
 *      response streams back end-to-end.
 *
 * All HTTP methods accepted — POST for tool calls, GET for SSE
 * stream, DELETE for session close. The Worker handles routing.
 */

import { error } from '@sveltejs/kit';
import { verifyBridgeTicket } from '$lib/server/mcp-bridge-auth';
import type { RequestHandler } from './$types';

async function handle(event: Parameters<RequestHandler>[0]) {
  const identity = await verifyBridgeTicket(event);

  const serverUrl = event.url.searchParams.get('server');
  if (!serverUrl) {
    throw error(400, 'server query param required');
  }

  const worker = event.platform?.env?.WORKER;
  const isDev = !worker;

  // Build upstream URL preserving the remainder of the path after
  // /api/mcp/bridge, plus the same query string (server=...).
  // Path from SvelteKit params is pre-decoded; re-encode ok.
  const path = event.params.path ?? '';
  const workerBase = isDev ? 'http://localhost:1338' : 'http://worker';
  const workerUrl = new URL(
    `/mcp/bridge/${path}`,
    workerBase
  );
  workerUrl.search = event.url.search;

  // Propagate everything except our own cookies. The Worker needs:
  //   - X-User-Id (derived from ticket, attached here)
  //   - X-Bridge-Redirect-Url (so the provider can instantiate; never
  //     actually used to redirect, but the DO provider constructor
  //     requires it). Set to the same callback URL used by /start.
  const upstreamHeaders = new Headers(event.request.headers);
  upstreamHeaders.delete('cookie');
  upstreamHeaders.delete('host');
  upstreamHeaders.delete('content-length');
  upstreamHeaders.delete('x-cloudshell-ticket'); // don't leak to Worker/upstream

  upstreamHeaders.set('X-User-Id', identity.userId);
  if (identity.userEmail) {
    upstreamHeaders.set('X-User-Email', identity.userEmail);
  }

  const baseRedirectUrl = new URL(
    '/api/mcp/oauth/callback',
    event.url.origin
  ).toString();
  upstreamHeaders.set('X-Bridge-Redirect-Url', baseRedirectUrl);

  const hasBody =
    event.request.method !== 'GET' && event.request.method !== 'HEAD';
  const body = hasBody ? await event.request.arrayBuffer() : undefined;

  const upstream = new Request(workerUrl.toString(), {
    method: event.request.method,
    headers: upstreamHeaders,
    body,
  });

  return isDev ? await fetch(upstream) : await worker!.fetch(upstream);
}

export const GET: RequestHandler = handle;
export const POST: RequestHandler = handle;
export const PUT: RequestHandler = handle;
export const PATCH: RequestHandler = handle;
export const DELETE: RequestHandler = handle;
