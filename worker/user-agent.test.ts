/**
 * Unit tests for the CloudshellUserAgent's local connection-index
 * semantics. We don't spin up a real DO here — that comes in A.2/A.3
 * integration tests once the OAuth routes consume this class. The
 * purpose of this file is to prove the bookkeeping methods
 * (recordConnection / forgetConnection / listConnections) behave
 * correctly against a tiny in-memory storage stub.
 */

import { describe, expect, it, beforeEach } from 'vitest';
import { CloudshellUserAgent } from './user-agent';

/**
 * Minimal storage stub matching the subset of DurableObjectStorage the
 * CloudshellUserAgent methods exercise. Anything else on the Agent base
 * class (alarms, websocket storage, etc.) isn't reachable from the
 * methods under test.
 */
function makeStorageStub() {
  const map = new Map<string, unknown>();
  return {
    get: async <T>(key: string) => (map.get(key) as T | undefined) ?? undefined,
    put: async (key: string, value: unknown) => {
      map.set(key, value);
    },
    delete: async (key: string) => {
      map.delete(key);
    },
    raw: map,
  };
}

/**
 * Build a CloudshellUserAgent-shaped object whose `ctx.storage` is the
 * stub above. We bypass the Agent base class constructor because it
 * expects a real DurableObjectState; only the storage methods matter
 * for this surface. If the CloudshellUserAgent class grows dependencies
 * on other ctx fields, this helper has to grow too — that's a signal
 * to move to the miniflare DO harness instead of stubs.
 */
function makeAgent() {
  const storage = makeStorageStub();
  const instance = Object.create(CloudshellUserAgent.prototype) as CloudshellUserAgent;
  Object.defineProperty(instance, 'ctx', {
    value: { storage },
    writable: false,
  });
  return { agent: instance, storage };
}

describe('CloudshellUserAgent connection index', () => {
  let agent: CloudshellUserAgent;

  beforeEach(() => {
    agent = makeAgent().agent;
  });

  it('starts empty', async () => {
    await expect(agent.listConnections()).resolves.toEqual([]);
  });

  it('records a new connection', async () => {
    await agent.recordConnection({
      serverId: 'mcp.apify.com',
      clientId: 'client_abc',
      connectedAt: 1_000_000,
    });
    const list = await agent.listConnections();
    expect(list).toEqual([
      { serverId: 'mcp.apify.com', clientId: 'client_abc', connectedAt: 1_000_000 },
    ]);
  });

  it('upserts when the same serverId is recorded twice', async () => {
    await agent.recordConnection({
      serverId: 'mcp.apify.com',
      clientId: 'client_old',
      connectedAt: 1_000_000,
    });
    await agent.recordConnection({
      serverId: 'mcp.apify.com',
      clientId: 'client_new',
      connectedAt: 2_000_000,
    });
    const list = await agent.listConnections();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      serverId: 'mcp.apify.com',
      clientId: 'client_new',
      connectedAt: 2_000_000,
    });
  });

  it('tracks multiple distinct servers independently', async () => {
    await agent.recordConnection({ serverId: 'a', clientId: 'c1', connectedAt: 1 });
    await agent.recordConnection({ serverId: 'b', clientId: 'c2', connectedAt: 2 });
    const list = await agent.listConnections();
    const ids = list.map((c) => c.serverId).sort();
    expect(ids).toEqual(['a', 'b']);
  });

  it('forgets a connection without touching others', async () => {
    await agent.recordConnection({ serverId: 'a', clientId: 'c1', connectedAt: 1 });
    await agent.recordConnection({ serverId: 'b', clientId: 'c2', connectedAt: 2 });
    await agent.forgetConnection('a');
    const list = await agent.listConnections();
    expect(list.map((c) => c.serverId)).toEqual(['b']);
  });

  it('forgetting a non-existent connection is a no-op', async () => {
    await agent.recordConnection({ serverId: 'a', clientId: 'c1', connectedAt: 1 });
    await agent.forgetConnection('never-connected');
    const list = await agent.listConnections();
    expect(list).toHaveLength(1);
  });
});
