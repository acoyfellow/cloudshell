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

import { auth } from '@modelcontextprotocol/sdk/client/auth.js';
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

/** Extract `serverId` from an OAuth state string (format: `nonce.serverId`). */
function parseServerIdFromState(state: string): string | null {
  const dot = state.indexOf('.');
  if (dot <= 0 || dot === state.length - 1) return null;
  return state.slice(dot + 1);
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
}

/**
 * List MCP servers the user has authorized. Cheap — reads the DO's
 * connection index, which is a single KV lookup. Does not call the
 * upstream provider.
 */
export async function listConnections(
  env: Env,
  userId: string
): Promise<McpConnectionPublic[]> {
  const agent = getUserAgent(env, userId);
  const records = await (agent as any).listConnections();
  return records.map((r: { serverId: string; connectedAt: number }) => ({
    serverId: r.serverId,
    connectedAt: r.connectedAt,
  }));
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
 * `userId`. The provider performs discovery (well-known metadata),
 * DCR if the server advertises it, PKCE challenge generation, and
 * produces an authorize URL the user's browser must visit.
 *
 * Returns `{status: 'already_connected'}` if the provider already has
 * valid tokens for this user+server pair. Callers can use that to skip
 * the popup entirely.
 */
export async function startOAuth(
  env: Env,
  userId: string,
  input: StartOAuthInput
): Promise<StartOAuthResult> {
  const agent = getUserAgent(env, userId);
  // The provider state + per-server namespacing is encoded via
  // `serverId` on the provider instance. We use the serverUrl as the
  // serverId — unique per target server, stable across attempts, and
  // safely embeddable in state nonces (it rides in state as a suffix).
  const serverId = input.serverUrl;

  // Calling RPC methods on an Agent-shaped DO through a stub is the
  // standard agents SDK pattern. We ask the DO to hand back a provider
  // bound to its own storage; the storage round-trips via the ctx so
  // everything we save here is durable.
  //
  // Today agents@0.11 exposes the provider only when we create it in
  // worker code and pass the DO's storage. That's what the DO's
  // `provider()` method does — we call it here, but the provider
  // actually hitting storage happens when auth() calls its methods.
  //
  // Because auth() drives the provider through many round-trips, and
  // each provider method hits the DO, we want to keep calls efficient;
  // that's why the provider is thin and stateless except for the
  // in-memory authUrl/clientId/serverId fields.
  const provider = await (agent as any).provider({
    serverId,
    baseRedirectUrl: input.redirectUrl,
  });

  const outcome = await auth(provider, { serverUrl: input.serverUrl });
  if (outcome === 'AUTHORIZED') {
    return { status: 'already_connected' };
  }
  if (outcome === 'REDIRECT') {
    const authorizeUrl = provider.authUrl;
    if (!authorizeUrl) {
      throw new Error('OAuth provider did not produce an authorize URL');
    }
    return { status: 'redirect', authorizeUrl };
  }
  // auth() returns only AUTHORIZED or REDIRECT per MCP SDK impl.
  throw new Error(`Unexpected auth() outcome: ${String(outcome)}`);
}

/**
 * Complete a pending OAuth flow by exchanging `code` for tokens.
 * The provider validates `state` against the stored nonce (10-minute
 * expiry), retrieves the matching code_verifier, and persists tokens
 * on success.
 *
 * On success also records the connection in the user's connection
 * index so later listings / disconnect flows don't need to scan
 * provider keys.
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
  const provider = await (agent as any).provider({
    serverId,
    baseRedirectUrl: input.redirectUrl,
  });

  // Validate state nonce explicitly before handing to auth(). auth()
  // will use the stored code_verifier regardless; this gives us a
  // clearer error path when the state is expired or forged.
  const stateCheck = await provider.checkState(input.state);
  if (!stateCheck.valid) {
    throw new Error(`OAuth state rejected: ${stateCheck.error ?? 'unknown'}`);
  }

  const outcome = await auth(provider, {
    serverUrl: serverId,
    authorizationCode: input.code,
  });
  if (outcome !== 'AUTHORIZED') {
    throw new Error(`OAuth callback did not authorize; outcome=${String(outcome)}`);
  }

  // State has been used — burn the nonce. Provider's own codeVerifier
  // cleanup happens inside auth() on success.
  await provider.consumeState(input.state);

  // Record the connection for listings + disconnect flows.
  const clientInfo = await provider.clientInformation();
  if (clientInfo?.client_id) {
    await (agent as any).recordConnection({
      serverId,
      clientId: clientInfo.client_id,
      connectedAt: Date.now(),
    });
  }

  return { status: 'connected', serverUrl: serverId };
}
