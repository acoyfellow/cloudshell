/**
 * Regression tests for the OAuth state encoding. The bug this file
 * guards against was a 500 on every real MCP server's callback:
 * agents SDK 0.11's DurableObjectOAuthClientProvider.checkState does
 * `state.split('.')` and rejects length !== 2. Real server URLs like
 * `https://portal.mcp.cfdata.org/mcp` contain many dots.
 *
 * We fix it by base64url-encoding the serverId half of the state so
 * the only `.` in the composed state is the separator. See
 * worker/user-agent.ts CloudshellOAuthClientProvider.
 *
 * These tests exercise parseServerIdFromState in isolation — the full
 * provider flow is integration-tested via the live probes in prod.
 */

import { describe, expect, it } from 'vitest';
import { parseServerIdFromState } from './mcp-oauth';

/** Mirror of encodeServerId in worker/user-agent.ts. */
function encode(s: string): string {
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

describe('parseServerIdFromState — dot-safe for real MCP server URLs', () => {
  it('round-trips a single-word serverId', () => {
    const encoded = encode('localhost');
    expect(parseServerIdFromState(`nonce.${encoded}`)).toBe('localhost');
  });

  it('round-trips a dotted hostname', () => {
    const encoded = encode('mcp.apify.com');
    expect(parseServerIdFromState(`nonce.${encoded}`)).toBe('mcp.apify.com');
  });

  it('round-trips a full cf-portal URL with many dots + path', () => {
    const serverId = 'https://portal.mcp.cfdata.org/mcp';
    const encoded = encode(serverId);
    // This was the exact failure mode — many dots in serverId.
    expect(parseServerIdFromState(`nonce.${encoded}`)).toBe(serverId);
  });

  it('round-trips URLs with query strings + fragments', () => {
    const serverId = 'https://host.example.com:4443/mcp?env=prod&foo=bar#x';
    const encoded = encode(serverId);
    expect(parseServerIdFromState(`nonce.${encoded}`)).toBe(serverId);
  });

  it('rejects a state with no dot separator', () => {
    expect(parseServerIdFromState('nonce-only')).toBeNull();
  });

  it('rejects a state whose encoded half is not valid base64url', () => {
    // Valid base64url doesn't have "@", so this fails the decode.
    expect(parseServerIdFromState('nonce.@@@')).toBeNull();
  });

  it('rejects a state where nothing follows the dot', () => {
    expect(parseServerIdFromState('nonce.')).toBeNull();
  });

  it('rejects a state where nothing precedes the dot', () => {
    expect(parseServerIdFromState('.encoded')).toBeNull();
  });
});
