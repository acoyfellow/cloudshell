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
  }): DurableObjectOAuthClientProvider {
    const provider = new DurableObjectOAuthClientProvider(
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
    const provider = this.provider({
      serverId: params.serverUrl,
      baseRedirectUrl: params.baseRedirectUrl,
    });
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
      throw new Error(`OAuth state rejected: ${stateCheck.error ?? 'unknown'}`);
    }
    const outcome = await auth(provider, {
      serverUrl: params.serverId,
      authorizationCode: params.code,
    });
    if (outcome !== 'AUTHORIZED') {
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
    if (!record) return null;
    const provider = this.provider({
      serverId: params.serverId,
      baseRedirectUrl: params.baseRedirectUrl,
    });
    provider.clientId = record.clientId;
    try {
      const outcome = await auth(provider, { serverUrl: params.serverId });
      if (outcome !== 'AUTHORIZED') return null;
    } catch {
      return null;
    }
    const tokens = await provider.tokens();
    return tokens?.access_token ?? null;
  }
}
