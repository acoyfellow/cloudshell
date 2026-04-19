/**
 * Worker-side MCP bridge: forward an incoming HTTP request (the CLI's
 * MCP JSON-RPC call) to the upstream MCP server with the user's
 * stored OAuth token attached.
 *
 * The MCP protocol's streamable-HTTP transport uses regular POST for
 * requests and returns either JSON or `text/event-stream` for streamed
 * responses. We raw-forward the body both ways and never buffer the
 * response — `fetch()` in Workers streams natively.
 *
 * Trust boundary: this is called by the Worker's /mcp/bridge route
 * after it has validated X-User-Id forwarded by the APP (which in
 * turn validated the bridge ticket). Nothing in this module reads
 * any ticket or Better Auth state — it trusts forwarded identity.
 *
 * Inputs:
 *   - userId:    from X-User-Id
 *   - serverUrl: raw MCP server origin (e.g. "https://mcp.apify.com")
 *   - path:      the MCP path under the origin ("mcp" or "sse")
 *   - request:   the original Request object with body, headers, method
 *
 * Failure modes:
 *   - User has no connection for this server → 404 with a hint
 *   - Token refresh fails → 401 bubbled up; CLI should prompt re-login
 *   - Upstream returns any status → forwarded as-is
 */

import { auth } from '@modelcontextprotocol/sdk/client/auth.js';
import { CloudshellUserAgent } from './user-agent';
import type { Env } from './types';

function getUserAgent(env: Env, userId: string) {
  const id = env.UserAgent.idFromName(userId);
  return env.UserAgent.get(id) as unknown as DurableObjectStub<CloudshellUserAgent>;
}

/**
 * Resolve the current access token for (userId, serverUrl). Drives
 * the MCP SDK's auth() which will automatically refresh if the stored
 * refresh_token is still valid. Returns null if the user has no
 * connection or the access token can't be obtained (caller should
 * surface 401 and prompt re-login).
 *
 * `baseRedirectUrl` is passed only to satisfy the provider's
 * constructor — no redirect actually happens on this path, we're
 * using the provider purely for its token storage + refresh logic.
 */
async function getAccessToken(
  env: Env,
  userId: string,
  serverUrl: string,
  baseRedirectUrl: string
): Promise<string | null> {
  const agent = getUserAgent(env, userId);
  const connections = await (agent as any).listConnections();
  const match = (connections as Array<{ serverId: string; clientId: string }>).find(
    (c) => c.serverId === serverUrl
  );
  if (!match) return null;

  const provider = await (agent as any).provider({
    serverId: serverUrl,
    baseRedirectUrl,
  });
  provider.clientId = match.clientId;

  // auth() will refresh the token if expired; for our purposes we
  // want AUTHORIZED or nothing. If it needs to redirect the user for
  // re-consent, treat that as "no token available."
  try {
    const outcome = await auth(provider, { serverUrl });
    if (outcome !== 'AUTHORIZED') return null;
  } catch {
    // Refresh failed, client creds invalid, etc. — caller surfaces
    // 401 so the CLI can prompt a fresh login.
    return null;
  }

  const tokens = await provider.tokens();
  return tokens?.access_token ?? null;
}

export interface BridgeRequestInput {
  readonly userId: string;
  readonly serverUrl: string;
  /** Relative path on the MCP server, e.g. "/mcp" or "/sse". */
  readonly path: string;
  /** Original request (body, method, headers). */
  readonly request: Request;
  /** Same callback URL used when initiating OAuth; needed only for provider init. */
  readonly baseRedirectUrl: string;
}

/**
 * Forward the MCP request upstream. Returns the upstream response
 * directly so streamable-HTTP / SSE responses flow through without
 * buffering.
 *
 * Fetch body semantics: Workers' fetch() accepts any BodyInit; we
 * pass the incoming request's body as an ArrayBuffer (Workers can't
 * stream request bodies through fetch without special opt-in, and
 * MCP request bodies are JSON-RPC — small).
 */
export async function bridgeMcpRequest(
  env: Env,
  input: BridgeRequestInput
): Promise<Response> {
  const accessToken = await getAccessToken(
    env,
    input.userId,
    input.serverUrl,
    input.baseRedirectUrl
  );
  if (!accessToken) {
    return new Response(
      JSON.stringify({
        error: 'not_connected',
        detail: `No active MCP connection for ${input.serverUrl}. Run \`mcp login <server>\`.`,
      }),
      {
        status: 401,
        headers: { 'content-type': 'application/json' },
      }
    );
  }

  const upstreamUrl = new URL(input.path, input.serverUrl).toString();

  // Rebuild headers. Drop CF-internal forwarding headers; upstream
  // MCP servers shouldn't see X-User-Id or ticket bits. Attach the
  // OAuth bearer.
  const upstreamHeaders = new Headers();
  for (const [name, value] of input.request.headers) {
    const lower = name.toLowerCase();
    // These are ours / CF's, never forward:
    if (lower.startsWith('x-cloudshell-')) continue;
    if (lower === 'x-user-id' || lower === 'x-user-email') continue;
    if (lower === 'cookie') continue;
    // Let fetch() set these itself based on body / URL:
    if (lower === 'host' || lower === 'content-length') continue;
    if (lower.startsWith('cf-')) continue;
    upstreamHeaders.set(name, value);
  }
  upstreamHeaders.set('Authorization', `Bearer ${accessToken}`);

  const body =
    input.request.method === 'GET' || input.request.method === 'HEAD'
      ? undefined
      : await input.request.arrayBuffer();

  const upstreamResponse = await fetch(upstreamUrl, {
    method: input.request.method,
    headers: upstreamHeaders,
    body,
  });

  // Return directly — fetch() streams response bodies. SSE flows end-to-end.
  return upstreamResponse;
}
