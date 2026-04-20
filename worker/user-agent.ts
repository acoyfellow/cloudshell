/**
 * CloudshellUserAgent — per-user Durable Object holding the user's MCP
 * connections and their OAuth state.
 *
 * Why:
 *   cloudshell wants to be a cloud shell where agents (claude-code,
 *   opencode, pi) can call MCP tools on the user's behalf WITHOUT the
 *   container holding any OAuth credential. The container holds only a
 *   short-lived capability ticket; the tokens live here.
 *
 * Why a DO per user:
 *   - Matches the Agents SDK conventional "Agent instance per user" shape,
 *     which is a per-name DO namespace lookup (name = userId).
 *   - SQLite + R2 are already how @cloudflare/agents persists state; we
 *     inherit the DurableObjectOAuthClientProvider contract for free.
 *   - Credential invalidation is scoped to the single DO — disconnecting
 *     an MCP server in one session doesn't touch the other user's state.
 *
 * This file is the scaffold for step A.1 only. The OAuth routes, bridge,
 * and control WS layer on top of this DO in A.2 through A.6. Nothing in
 * this class is user-facing yet; binding it just makes the namespace
 * exist on the Worker.
 */

import { Agent } from 'agents';
import { DurableObjectOAuthClientProvider } from 'agents/mcp/do-oauth-client-provider';
import { auth } from '@modelcontextprotocol/sdk/client/auth.js';
import type { Env } from './types';

/**
 * Upstream `DurableObjectOAuthClientProvider.state()` composes OAuth
 * state as `${nonce}.${serverId}`, then `checkState()` parses it with
 * `state.split('.')` and rejects any result whose length isn't 2.
 *
 * That's fine when serverId is a single word, but MCP server URLs
 * like `https://portal.mcp.cfdata.org/mcp` contain many dots — every
 * real callback into checkState returns `{ valid: false, error:
 * 'Invalid state format' }` and the exchange fails with a 500.
 *
 * We override state() and checkState() to base64url-encode the
 * serverId, so the only `.` in the composed state is the separator.
 * Stored nonce record + key format are untouched, so this is
 * backwards-compatible with any already-persisted state rows.
 */
export class CloudshellOAuthClientProvider extends DurableObjectOAuthClientProvider {
  override async state(): Promise<string> {
    // Reuse the upstream state() to get the stored row + raw state
    // string, then rewrite the serverId portion. Cheaper than
    // reimplementing; still correct because we only touch the return
    // value's encoding, not what's saved to storage.
    const raw = await super.state();
    const dot = raw.indexOf('.');
    if (dot <= 0) return raw;
    const nonce = raw.slice(0, dot);
    const serverId = raw.slice(dot + 1);
    return `${nonce}.${encodeServerId(serverId)}`;
  }

  /**
   * Fully re-implemented (NOT delegating to upstream). Upstream
   * `checkState` is what we're working around — calling it with a
   * plaintext serverId that has dots would still trip the same bug.
   * Instead we duplicate the logic here: parse only at the first
   * '.', decode the right half, look up the stored nonce record
   * directly, validate serverId match + expiry.
   */
  override async checkState(state: string): Promise<{
    valid: boolean;
    serverId?: string;
    error?: string;
  }> {
    const dot = state.indexOf('.');
    if (dot <= 0 || dot === state.length - 1) {
      return { valid: false, error: 'Invalid state format' };
    }
    const nonce = state.slice(0, dot);
    const encoded = state.slice(dot + 1);
    const decoded = decodeServerId(encoded);
    if (decoded == null) {
      return { valid: false, error: 'Invalid state encoding' };
    }
    // Same storage key shape upstream uses.
    const key = this.stateKey(nonce);
    const stored = await this.storage.get<{
      nonce: string;
      serverId: string;
      createdAt: number;
    }>(key);
    if (!stored) {
      return { valid: false, error: 'State not found or already used' };
    }
    if (stored.serverId !== decoded) {
      await this.storage.delete(key);
      return { valid: false, error: 'State serverId mismatch' };
    }
    // Upstream's STATE_EXPIRATION_MS is 10 minutes.
    const age = Date.now() - stored.createdAt;
    if (age > 10 * 60 * 1000) {
      await this.storage.delete(key);
      return { valid: false, error: 'State expired' };
    }
    return { valid: true, serverId: decoded };
  }

  /**
   * Consume (burn) the state nonce. Same logic as upstream but we
   * extract the nonce from our encoded format.
   */
  override async consumeState(state: string): Promise<void> {
    const dot = state.indexOf('.');
    if (dot <= 0) return;
    const nonce = state.slice(0, dot);
    await this.storage.delete(this.stateKey(nonce));
  }
}

function encodeServerId(serverId: string): string {
  return btoa(serverId).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Error thrown for bad MCP server URLs. Caught by the HTTP layer
 * (`toRouteErrorResponse` in worker/index.ts) and returned as a 400
 * with the message intact, instead of a bare 500.
 */
export class InvalidMcpServerUrl extends Error {
  readonly status = 400;
  constructor(message: string) {
    super(message);
    this.name = 'InvalidMcpServerUrl';
  }
}

/**
 * Validate that the user-supplied serverUrl is a proper https:// URL.
 * We accept http:// only on localhost for dev convenience; everything
 * else must be https.
 */
function assertValidServerUrl(serverUrl: string): void {
  let url: URL;
  try {
    url = new URL(serverUrl);
  } catch {
    throw new InvalidMcpServerUrl(
      `Not a URL: ${serverUrl}. Expected e.g. https://mcp.example.com/mcp`
    );
  }
  if (url.protocol === 'https:') return;
  if (url.protocol === 'http:' && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(url.hostname)) {
    return;
  }
  throw new InvalidMcpServerUrl(
    `MCP server URL must use https:// (got ${url.protocol}//). Try https://${url.host}${url.pathname || ''}`
  );
}

function decodeServerId(encoded: string): string | null {
  try {
    const padded = encoded.replace(/-/g, '+').replace(/_/g, '/');
    return atob(padded);
  } catch {
    return null;
  }
}

export const CLIENT_NAME = 'cloudshell';

/**
 * The subset of `DurableObjectOAuthClientProvider` state we want to expose
 * from RPC calls. The DO itself never sends raw tokens over the wire —
 * callers ask for "is this server connected" or use the bridge to invoke
 * a tool; they never read the access token directly.
 */
export interface McpConnectionSummary {
  readonly serverId: string;
  readonly connectedAt: number;
  readonly clientId: string;
  readonly tokenExpiresAt: number | null;
}

/** Lightweight shape persisted alongside the provider's own keys. */
interface McpConnectionRecord {
  readonly serverId: string;
  readonly connectedAt: number;
  readonly clientId: string;
}

const CONNECTION_INDEX_KEY = '/cloudshell/mcp/connections';

export class CloudshellUserAgent extends Agent<Env> {
  /**
   * Scan this DO's storage for an existing DCR'd client for
   * `serverId` and return its client_id, preferring the most-recently-
   * registered one when multiple exist.
   *
   * Keys are laid out by upstream as
   *   /${clientName}/${serverId}/${clientId}/client_info/
   * The stored value has an optional `client_id_issued_at` timestamp
   * we can use to order. If timestamps are missing or equal, we fall
   * back to the last-listed key (alphabetical order; still
   * deterministic).
   */
  async findLatestStoredClientId(serverId: string): Promise<string | null> {
    const prefix = `/${CLIENT_NAME}/${serverId}/`;
    const suffix = '/client_info/';
    const results = (await this.ctx.storage.list({ prefix })) as Map<
      string,
      { client_id_issued_at?: number }
    >;
    let bestId: string | null = null;
    let bestIssuedAt = -Infinity;
    for (const [key, value] of results) {
      if (!key.endsWith(suffix)) continue;
      const head = key.slice(0, -suffix.length);
      const lastSlash = head.lastIndexOf('/');
      if (lastSlash < 0) continue;
      const clientId = head.slice(lastSlash + 1);
      const issuedAt =
        typeof value?.client_id_issued_at === 'number'
          ? value.client_id_issued_at
          : 0;
      if (issuedAt > bestIssuedAt || bestId == null) {
        bestIssuedAt = issuedAt;
        bestId = clientId;
      }
    }
    return bestId;
  }

  /**
   * Return a `DurableObjectOAuthClientProvider` scoped to `serverId`.
   * The provider shares this DO's storage so tokens persist with the
   * agent.
   *
   * `baseRedirectUrl` is the app-host callback URL that the OAuth
   * provider hands to the upstream MCP server's authorization endpoint.
   * Cloudshell hosts this at `/oauth/mcp/callback` on the app Worker
   * (see A.3). Using a single shared callback works because each flow
   * carries its own `state` nonce, which the provider validates on
   * return and maps back to the right `serverId`.
   */
  provider(params: {
    readonly serverId: string;
    readonly baseRedirectUrl: string;
  }): CloudshellOAuthClientProvider {
    const provider = new CloudshellOAuthClientProvider(
      this.ctx.storage,
      CLIENT_NAME,
      params.baseRedirectUrl
    );
    provider.serverId = params.serverId;
    return provider;
  }

  /**
   * Record that an OAuth flow for `serverId` completed successfully.
   * Called by the app Worker's /oauth/mcp/callback route after the
   * upstream token exchange. The provider itself has already stored
   * the tokens via `saveTokens` — this method just lets us enumerate
   * connections later without scanning every provider key.
   */
  async recordConnection(record: McpConnectionRecord): Promise<void> {
    const existing = await this.listConnections();
    const filtered = existing.filter((c) => c.serverId !== record.serverId);
    filtered.push(record);
    await this.ctx.storage.put(CONNECTION_INDEX_KEY, filtered);
  }

  /**
   * Remove the connection index entry for `serverId`. Does NOT touch the
   * provider's own keys — callers that want to fully revoke credentials
   * should pair this with `provider.invalidateCredentials({ scope: 'all' })`.
   */
  async forgetConnection(serverId: string): Promise<void> {
    const existing = await this.listConnections();
    const filtered = existing.filter((c) => c.serverId !== serverId);
    await this.ctx.storage.put(CONNECTION_INDEX_KEY, filtered);
  }

  /** List known connections for this user. Cheap — no upstream calls. */
  async listConnections(): Promise<McpConnectionRecord[]> {
    const stored = await this.ctx.storage.get<McpConnectionRecord[]>(
      CONNECTION_INDEX_KEY
    );
    return stored ?? [];
  }

  /**
   * listConnections annotated with token status so the CLI / UI can
   * show "active" vs "expired" without a second RPC. Iterates through
   * connection records, reads the stored tokens for each, and
   * computes expiry. Does NOT perform any network call; the refresh
   * flow happens only when a bridge call is actually made.
   */
  async listConnectionsAnnotated(): Promise<
    Array<{
      serverId: string;
      connectedAt: number;
      status: 'active' | 'expired' | 'broken';
      tokenExpiresAt: number | null;
    }>
  > {
    const records = await this.listConnections();
    const out: Array<{
      serverId: string;
      connectedAt: number;
      status: 'active' | 'expired' | 'broken';
      tokenExpiresAt: number | null;
    }> = [];
    for (const r of records) {
      const provider = this.provider({
        serverId: r.serverId,
        baseRedirectUrl: 'https://cloudshell.coey.dev/api/mcp/oauth/callback',
      });
      provider.clientId = r.clientId;
      let status: 'active' | 'expired' | 'broken' = 'broken';
      let tokenExpiresAt: number | null = null;
      try {
        const tokens = await provider.tokens();
        if (tokens?.access_token) {
          if (typeof tokens.expires_in === 'number') {
            const expiresAtMs = r.connectedAt + tokens.expires_in * 1000;
            tokenExpiresAt = expiresAtMs;
            // 60s grace window — if we're within 60s of expiry, call it
            // expired already, since a tool call starting now may not
            // finish before the token dies.
            if (Date.now() > expiresAtMs - 60_000) {
              status = tokens.refresh_token ? 'active' : 'expired';
              // If refresh_token exists, we can refresh on next call,
              // so leave as 'active'. If not, user must re-login.
            } else {
              status = 'active';
            }
          } else {
            // No expires_in from upstream — treat as active, no way to
            // tell.
            status = 'active';
          }
        }
      } catch {
        status = 'broken';
      }
      out.push({
        serverId: r.serverId,
        connectedAt: r.connectedAt,
        status,
        tokenExpiresAt,
      });
    }
    return out;
  }

  /**
   * Fully disconnect a stored MCP connection. Clears:
   *   - the connection index entry
   *   - the provider's saved tokens, client_info, state, code_verifier
   *     (via invalidateCredentials({scope:'all'}))
   * Idempotent: returns { removed: false } if nothing was stored.
   */
  async disconnectServer(params: {
    readonly serverId: string;
  }): Promise<{ removed: boolean }> {
    const existing = await this.listConnections();
    const record = existing.find((c) => c.serverId === params.serverId);
    if (!record) return { removed: false };

    const provider = this.provider({
      serverId: params.serverId,
      baseRedirectUrl: 'https://cloudshell.coey.dev/api/mcp/oauth/callback',
    });
    provider.clientId = record.clientId;
    try {
      await provider.invalidateCredentials('all');
    } catch {
      // Best-effort: even if invalidation trips, we still want to
      // drop the index entry so mcp list stops showing a stale record.
    }
    await this.forgetConnection(params.serverId);
    return { removed: true };
  }

  /**
   * Inspect a connection including the (non-secret) token expiry. The
   * access token itself is never returned by this method; the bridge
   * reads it via `provider.tokens()` and forwards to upstream MCP
   * servers without ever exposing it to an RPC caller.
   */
  async inspectConnection(params: {
    readonly serverId: string;
    readonly baseRedirectUrl: string;
  }): Promise<McpConnectionSummary | null> {
    const record = (await this.listConnections()).find(
      (c) => c.serverId === params.serverId
    );
    if (!record) return null;
    const provider = this.provider({
      serverId: params.serverId,
      baseRedirectUrl: params.baseRedirectUrl,
    });
    provider.clientId = record.clientId;
    const tokens = await provider.tokens();
    return {
      serverId: record.serverId,
      connectedAt: record.connectedAt,
      clientId: record.clientId,
      tokenExpiresAt:
        tokens?.expires_in != null
          ? record.connectedAt + tokens.expires_in * 1000
          : null,
    };
  }

  /**
   * Run the MCP SDK's `auth()` flow inline inside this DO.
   *
   * This has to run here (not in Worker code calling `provider()` as
   * an RPC) because `auth()` calls many methods on the provider
   * (saveCodeVerifier, saveClientInformation, state, etc.) and each
   * call needs the real provider instance — not an RPC stub where
   * methods get stripped in serialization.
   *
   * Returns either the authorize URL (the caller should redirect the
   * user there) or `null` if the user is already authorized (valid
   * tokens in storage).
   */
  async runAuthStart(params: {
    readonly serverUrl: string;
    readonly baseRedirectUrl: string;
  }): Promise<{ status: 'redirect'; authorizeUrl: string } | { status: 'already_connected' }> {
    // Validate the serverUrl shape before doing any OAuth work. Without
    // this, a bad input like `mcp login cf-portal` (no scheme, no host)
    // would crash deep in the MCP SDK's discovery fetch and surface as
    // a bare HTTP 500 with no useful diagnostic.
    assertValidServerUrl(params.serverUrl);
    const provider = this.provider({
      serverId: params.serverUrl,
      baseRedirectUrl: params.baseRedirectUrl,
    });
    // A fresh provider instance has no in-memory clientId, so
    // `clientInformation()` returns undefined, so MCP SDK's auth()
    // runs Dynamic Client Registration AGAIN on every login attempt
    // \u2014 including repeated 'mcp login' retries for the same user.
    // Each new DCR registers a brand-new client_id with the upstream
    // OAuth server, so when the user finally approves, the auth
    // code is tied to the LATEST registered client. If our callback
    // picks the wrong client_id (e.g. earliest stored), upstream
    // rejects the token exchange with InvalidGrantError 'Client ID
    // mismatch' \u2014 exactly what we saw in prod.
    //
    // Fix: rehydrate the most-recently-saved clientId BEFORE calling
    // auth(), so if a DCR is already stored for this (user, server)
    // we reuse it instead of registering again. See
    // findLatestStoredClientId below.
    const existing = await this.findLatestStoredClientId(params.serverUrl);
    if (existing) {
      provider.clientId = existing;
      // Upstream's saveCodeVerifier refuses to overwrite an existing
      // verifier (intentional — protects a concurrent in-flight flow
      // from corruption). But when we reuse a clientId from a
      // previous FAILED attempt, the stale verifier from that attempt
      // is still on disk, and saveCodeVerifier silently no-ops on
      // the new one. Then cf-portal's /token endpoint rejects the
      // exchange: "Invalid PKCE code_verifier" — the stored old
      // verifier doesn't hash to the new challenge sent on this
      // authorize URL.
      //
      // Clearing the verifier here lets auth() save a fresh one.
      // Safe because runAuthStart is always user-initiated; there's
      // no concurrent flow this can trample.
      await provider.deleteCodeVerifier();
    }
    const outcome = await auth(provider, { serverUrl: params.serverUrl });
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
    throw new Error(`Unexpected auth() outcome: ${String(outcome)}`);
  }

  /**
   * Complete an OAuth flow with `state` + `code` from the upstream
   * callback. Runs inline in the DO for the same reason as
   * runAuthStart. Persists tokens + records the connection on success.
   *
   * Logs the actual upstream failure reason to the Worker tail when
   * anything goes wrong — `toRouteErrorResponse` swallows the error
   * message at the HTTP boundary, so without these console.error
   * calls the Worker tail just shows a bare 500 with no diagnostics.
   */
  async runAuthCallback(params: {
    readonly state: string;
    readonly code: string;
    readonly serverId: string;
    readonly baseRedirectUrl: string;
  }): Promise<{ status: 'connected'; serverUrl: string }> {
    const provider = this.provider({
      serverId: params.serverId,
      baseRedirectUrl: params.baseRedirectUrl,
    });
    const stateCheck = await provider.checkState(params.state);
    if (!stateCheck.valid) {
      console.error('[mcp] state check failed', {
        serverId: params.serverId,
        error: stateCheck.error,
      });
      throw new Error(`OAuth state rejected: ${stateCheck.error ?? 'unknown'}`);
    }
    // `auth()` with an `authorizationCode` demands that
    // provider.clientInformation() return something (i.e. the
    // client_id from the earlier DCR register). Our Provider instance
    // here is fresh — it has no in-memory clientId.
    //
    // After the runAuthStart fix (rehydrating clientId before
    // auth()), each user+server pair should have exactly one stored
    // client_info. Still, pick the most-recently-registered one just
    // in case: if a prior partial flow left a stale entry, the
    // latest is what corresponds to the authorize URL the user just
    // completed.
    const clientIdFromStorage = await this.findLatestStoredClientId(
      params.serverId
    );
    if (!clientIdFromStorage) {
      console.error('[mcp] no stored clientId for serverId', {
        serverId: params.serverId,
      });
      throw new Error(
        `No OAuth client registration found for ${params.serverId}. Run \`mcp login\` again.`
      );
    }
    provider.clientId = clientIdFromStorage;

    let outcome: string;
    try {
      outcome = await auth(provider, {
        serverUrl: params.serverId,
        authorizationCode: params.code,
      });
    } catch (err) {
      // MCP SDK's auth() throws on token exchange failures. Capture
      // the real error shape (class + message + optional body) and
      // log before re-throwing so we can see it in the tail.
      const e = err as Error & { message?: string; statusCode?: number; body?: unknown };
      console.error('[mcp] auth() threw during token exchange', {
        serverId: params.serverId,
        errorName: e?.name,
        errorMessage: e?.message,
        statusCode: e?.statusCode,
        body: e?.body,
      });
      // Clear the stored code_verifier so the user's NEXT `mcp login`
      // / Connect click isn't bitten by the no-overwrite guard in
      // saveCodeVerifier. Without this, every failure permanently
      // wedges that (user, server) pair until someone manually wipes
      // the DO.
      try {
        await provider.deleteCodeVerifier();
      } catch {
        // best-effort; don't mask the original error
      }
      throw err;
    }
    if (outcome !== 'AUTHORIZED') {
      console.error('[mcp] auth() returned non-AUTHORIZED', {
        serverId: params.serverId,
        outcome,
      });
      throw new Error(
        `OAuth callback did not authorize; outcome=${String(outcome)}`
      );
    }
    await provider.consumeState(params.state);
    const clientInfo = await provider.clientInformation();
    if (clientInfo?.client_id) {
      await this.recordConnection({
        serverId: params.serverId,
        clientId: clientInfo.client_id,
        connectedAt: Date.now(),
      });
    }
    return { status: 'connected', serverUrl: params.serverId };
  }

  /**
   * Return the current access token for `serverId` for outbound bridge
   * proxying. Never exposed over HTTP; only called via RPC from the
   * Worker's mcp-bridge module. Drives auth() so expired tokens
   * auto-refresh via the stored refresh_token.
   *
   * Returns null on any failure (no connection, refresh failed,
   * re-auth required). Caller should surface a 401 so the CLI can
   * prompt `mcp login`.
   */
  async getAccessTokenFor(params: {
    readonly serverId: string;
    readonly baseRedirectUrl: string;
  }): Promise<string | null> {
    const record = (await this.listConnections()).find(
      (c) => c.serverId === params.serverId
    );
    if (!record) {
      console.error('[mcp] getAccessTokenFor: no connection record', {
        serverId: params.serverId,
      });
      return null;
    }
    const provider = this.provider({
      serverId: params.serverId,
      baseRedirectUrl: params.baseRedirectUrl,
    });
    provider.clientId = record.clientId;

    // Resolve tokens WITHOUT calling MCP SDK's auth() helper.
    //
    // auth(provider, {serverUrl}) is NOT "give me the current valid access
    // token" — it's "refresh or start a new flow". If the stored tokens
    // have no refresh_token (cf-portal doesn't issue one), auth() falls
    // through to `redirectToAuthorization` and returns 'REDIRECT' even
    // when a perfectly usable access_token is in storage. Found in prod
    // 2026-04-19 against cf-portal.
    //
    // We read tokens directly, honor the expiry, and try a refresh ONLY
    // if a refresh_token exists. If the access token is expired and no
    // refresh_token is available, we return null (CLI prompts re-login).
    const tokens = await provider.tokens();
    if (!tokens?.access_token) {
      console.error('[mcp] getAccessTokenFor: no access_token stored', {
        serverId: params.serverId,
      });
      return null;
    }

    // Check expiry. `expires_in` is seconds from issue; record.connectedAt
    // is our best proxy for issue time (we recorded the connection right
    // after the token was saved on successful callback).
    if (typeof tokens.expires_in === 'number') {
      const expiresAtMs = record.connectedAt + tokens.expires_in * 1000;
      // 60s skew buffer so we don't hand out a token about to expire
      // mid-request.
      if (Date.now() > expiresAtMs - 60_000) {
        if (!tokens.refresh_token) {
          console.error('[mcp] access token expired, no refresh_token', {
            serverId: params.serverId,
            expiresAtMs,
          });
          return null;
        }
        // Refresh path: ask auth() to refresh. If it throws, null.
        try {
          const outcome = await auth(provider, { serverUrl: params.serverId });
          if (outcome !== 'AUTHORIZED') {
            console.error('[mcp] refresh flow did not authorize', {
              serverId: params.serverId,
              outcome,
            });
            return null;
          }
          const refreshed = await provider.tokens();
          return refreshed?.access_token ?? null;
        } catch (err) {
          const e = err as Error & {
            message?: string;
            statusCode?: number;
            body?: unknown;
          };
          console.error('[mcp] auth() threw during refresh', {
            serverId: params.serverId,
            errorName: e?.name,
            errorMessage: e?.message,
            statusCode: e?.statusCode,
            body: e?.body,
          });
          return null;
        }
      }
    }

    // Token is present and not expired — hand it back.
    return tokens.access_token;
  }
}
