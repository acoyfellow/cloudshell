/**
 * Worker-side handlers for cloudshell's MCP OAuth broker.
 *
 * These routes drive the @modelcontextprotocol/sdk `auth()` helper
 * against the per-user CloudshellUserAgent DO. The APP (SvelteKit)
 * forwards authenticated requests here; this module does not trust
 * any caller that isn't coming through that forwarding path — it
 * requires the `X-User-Id` header that proxyWorkerRequest attaches
 * after it validates the Better Auth session.
 *
 * Endpoints (mounted by worker/index.ts under /mcp/oauth/):
 *   POST /mcp/oauth/start    — initiate OAuth flow for a server URL
 *   POST /mcp/oauth/callback — complete a pending flow with state+code
 *
 * Neither endpoint returns user-facing HTML — the APP renders the
 * callback page. This keeps all browser-facing surface on one origin
 * (cloudshell.coey.dev), the Worker stays an RPC-ish backend.
 */

import { CloudshellUserAgent } from './user-agent';
import type { Env } from './types';

/**
 * Minimal JSON API surface. Keeps the APP's proxy layer simple — it
 * just mirrors the status code and body.
 */
export interface StartOAuthInput {
  /** The MCP server's base URL, e.g. `https://mcp.apify.com`. */
  readonly serverUrl: string;
  /**
   * The callback URL the OAuth provider will redirect the user to.
   * Must be a valid URL on the APP origin (cloudshell.coey.dev) so the
   * Better Auth session cookie flows with it.
   */
  readonly redirectUrl: string;
}

export type StartOAuthResult =
  | { readonly status: 'redirect'; readonly authorizeUrl: string }
  | { readonly status: 'already_connected' };

export interface CallbackOAuthInput {
  /** OAuth `state` param from the callback URL. Used to locate the flow. */
  readonly state: string;
  /** OAuth `code` param from the callback URL. */
  readonly code: string;
  /**
   * The same redirectUrl used to start the flow. Must match so the
   * provider rebuilds an identical code_challenge context.
   */
  readonly redirectUrl: string;
}

export interface CallbackOAuthResult {
  readonly status: 'connected';
  readonly serverUrl: string;
}

/**
 * Extract `serverId` from an OAuth state string.
 *
 * Format produced by CloudshellOAuthClientProvider.state():
 *   `${nonce}.${base64url(serverId)}`
 *
 * We have to base64url-encode the serverId because the stock agents
 * SDK provider splits state on '.' and rejects anything that
 * produces more than 2 parts — real MCP server URLs like
 * https://portal.mcp.cfdata.org/mcp contain many dots and would
 * always fail checkState. See worker/user-agent.ts CloudshellOAuthClientProvider.
 */
export function parseServerIdFromState(state: string): string | null {
  const dot = state.indexOf('.');
  if (dot <= 0 || dot === state.length - 1) return null;
  const encoded = state.slice(dot + 1);
  try {
    const padded = encoded.replace(/-/g, '+').replace(/_/g, '/');
    return atob(padded);
  } catch {
    return null;
  }
}

/**
 * Public connection metadata — what the CLI sees. Token values and
 * OAuth client secrets are NEVER included; those stay in the DO's
 * storage and only surface inside bridge proxy logic that forwards
 * calls to upstream MCP servers.
 */
export interface McpConnectionPublic {
  readonly serverId: string;
  readonly connectedAt: number;
  /**
   * One of:
   *   'active'  — token present and not expired (or no expiry was provided)
   *   'expired' — token present but `expires_in` already elapsed, AND there
   *               is no refresh_token (so we can't silently refresh).
   *               CLI should suggest `mcp login` again.
   *   'broken'  — connection index entry exists but no access_token in
   *               storage. Shouldn't happen normally; self-healing by
   *               running login again.
   */
  readonly status: 'active' | 'expired' | 'broken';
  /** Unix ms when the access token goes stale. null if unknown. */
  readonly tokenExpiresAt: number | null;
}

/**
 * List MCP servers the user has authorized, annotated with token
 * status so the CLI can surface 'expired' without an extra roundtrip.
 * Driven by the DO's annotated listConnections method.
 */
export async function listConnections(
  env: Env,
  userId: string
): Promise<McpConnectionPublic[]> {
  const agent = getUserAgent(env, userId);
  return (await (agent as any).listConnectionsAnnotated()) as McpConnectionPublic[];
}

/**
 * Remove a stored MCP connection for `userId` + `serverUrl`. Delegates
 * to the DO to clear the connection index entry, the saved tokens,
 * client_info, and code_verifier for this (user, server) pair.
 */
export async function disconnect(
  env: Env,
  userId: string,
  serverUrl: string
): Promise<{ removed: boolean }> {
  const agent = getUserAgent(env, userId);
  return (await (agent as any).disconnectServer({ serverId: serverUrl })) as {
    removed: boolean;
  };
}

/**
 * Look up (or create) the CloudshellUserAgent DO for `userId` and
 * return its RPC stub. Durable Objects are addressed by name; one DO
 * per user id, forever stable.
 */
function getUserAgent(env: Env, userId: string) {
  const id = env.UserAgent.idFromName(userId);
  return env.UserAgent.get(id) as unknown as DurableObjectStub<CloudshellUserAgent>;
}

/**
 * Start an OAuth authorization code flow for `serverUrl` on behalf of
 * `userId`. All the real work (discovery, DCR, PKCE) happens inside
 * the DO — we can't call provider methods from the Worker because
 * the returned object would be an RPC stub that strips methods.
 * See `CloudshellUserAgent.runAuthStart` for details.
 */
export async function startOAuth(
  env: Env,
  userId: string,
  input: StartOAuthInput
): Promise<StartOAuthResult> {
  const agent = getUserAgent(env, userId);
  return (await (agent as any).runAuthStart({
    serverUrl: input.serverUrl,
    baseRedirectUrl: input.redirectUrl,
  })) as StartOAuthResult;
}

/**
 * Complete a pending OAuth flow by exchanging `code` for tokens.
 * Also runs inside the DO (see runAuthCallback for why).
 */
export async function completeOAuth(
  env: Env,
  userId: string,
  input: CallbackOAuthInput
): Promise<CallbackOAuthResult> {
  const serverId = parseServerIdFromState(input.state);
  if (!serverId) {
    throw new Error('Invalid state: missing serverId suffix');
  }
  const agent = getUserAgent(env, userId);
  return (await (agent as any).runAuthCallback({
    state: input.state,
    code: input.code,
    serverId,
    baseRedirectUrl: input.redirectUrl,
  })) as CallbackOAuthResult;
}
