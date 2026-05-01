import { describe, expect, it, vi } from 'vitest';
import { createCapabilityTicket, createTerminalTicket } from '../../shared/terminal-ticket';
import { verifyBridgeTicket } from '../../src/lib/server/mcp-bridge-auth';

const SECRET = 'test-secret';
const FUTURE_EXP = Date.now() + 60_000;

function eventFor({ ticket }: { ticket?: string }) {
  const headers = new Headers();
  if (ticket) headers.set('X-Cloudshell-Ticket', ticket);
  return {
    request: new Request('https://cloudshell.local/api/mcp/bridge/mcp?server=https://mcp.example.test', { headers }),
    platform: { env: { TERMINAL_TICKET_SECRET: SECRET } },
  } as any;
}

describe('app bridge ticket authority', () => {
  it('rejects missing bridge ticket', async () => {
    await expect(verifyBridgeTicket(eventFor({}))).rejects.toMatchObject({ status: 401 });
  });

  it('rejects a plain terminal identity ticket', async () => {
    const ticket = await createTerminalTicket({ userId: 'alice', userEmail: 'alice@example.com', sessionId: 's1', tabId: 't1', exp: FUTURE_EXP }, SECRET);
    await expect(verifyBridgeTicket(eventFor({ ticket }))).rejects.toMatchObject({ status: 401 });
  });

  it('accepts a scoped mcp-bridge capability ticket', async () => {
    const ticket = await createCapabilityTicket({ userId: 'alice', userEmail: 'alice@example.com', sessionId: 'bridge', tabId: 'bridge', exp: FUTURE_EXP, scope: ['mcp-bridge'] }, SECRET);
    await expect(verifyBridgeTicket(eventFor({ ticket }))).resolves.toEqual({ userId: 'alice', userEmail: 'alice@example.com' });
  });
});
