import { describe, expect, it } from 'vitest';
import {
  createTerminalTicket,
  verifyTerminalTicket,
  createCapabilityTicket,
  verifyCapabilityTicket,
} from './terminal-ticket';

const SECRET = 'test-secret-does-not-ship';
const NEVER_EXPIRES = Date.now() + 60_000;

describe('terminal ticket primitive (identity-only, pre-capability)', () => {
  it('round-trips a plain identity ticket with no scope', async () => {
    const ticket = await createTerminalTicket(
      {
        userId: 'u1',
        userEmail: 'u1@example.com',
        sessionId: 'main',
        tabId: 'main',
        exp: NEVER_EXPIRES,
      },
      SECRET
    );
    const decoded = await verifyTerminalTicket(ticket, SECRET);
    expect(decoded?.userId).toBe('u1');
    expect(decoded?.scope).toBeUndefined();
  });

  it('rejects a mangled signature', async () => {
    const ticket = await createTerminalTicket(
      { userId: 'u1', userEmail: null, sessionId: 'main', tabId: 'main', exp: NEVER_EXPIRES },
      SECRET
    );
    const [body, sig] = ticket.split('.');
    // Flip the last char to a DIFFERENT value in base64url alphabet so the
    // tampering is guaranteed. The original impl (append 'A') was flaky:
    // if the sig naturally ended in 'A', the tampered value was identical.
    const last = sig.slice(-1);
    const replacement = last === 'A' ? 'B' : 'A';
    const tampered = `${body}.${sig.slice(0, -1)}${replacement}`;
    expect(await verifyTerminalTicket(tampered, SECRET)).toBeNull();
  });

  it('rejects an expired ticket', async () => {
    const ticket = await createTerminalTicket(
      { userId: 'u1', userEmail: null, sessionId: 'main', tabId: 'main', exp: Date.now() - 1 },
      SECRET
    );
    expect(await verifyTerminalTicket(ticket, SECRET)).toBeNull();
  });
});

describe('capability ticket (scoped bridge authority)', () => {
  it('mints with scope and round-trips the scope field', async () => {
    const ticket = await createCapabilityTicket(
      {
        userId: 'u1',
        userEmail: null,
        sessionId: 'main',
        tabId: 'main',
        exp: NEVER_EXPIRES,
        scope: ['cf-portal'],
      },
      SECRET
    );
    const decoded = await verifyTerminalTicket(ticket, SECRET);
    expect(decoded?.scope).toEqual(['cf-portal']);
  });

  it('refuses to mint an unbounded capability (empty scope)', async () => {
    await expect(
      createCapabilityTicket(
        {
          userId: 'u1',
          userEmail: null,
          sessionId: 'main',
          tabId: 'main',
          exp: NEVER_EXPIRES,
          scope: [],
        },
        SECRET
      )
    ).rejects.toThrow(/non-empty scope/);
  });

  it('verifyCapabilityTicket accepts a ticket whose scope includes the required value', async () => {
    const ticket = await createCapabilityTicket(
      {
        userId: 'u1',
        userEmail: null,
        sessionId: 'main',
        tabId: 'main',
        exp: NEVER_EXPIRES,
        scope: ['cf-portal', 'future-other-host'],
      },
      SECRET
    );
    const decoded = await verifyCapabilityTicket(ticket, SECRET, 'cf-portal');
    expect(decoded?.userId).toBe('u1');
  });

  it('verifyCapabilityTicket rejects a ticket whose scope lacks the required value', async () => {
    const ticket = await createCapabilityTicket(
      {
        userId: 'u1',
        userEmail: null,
        sessionId: 'main',
        tabId: 'main',
        exp: NEVER_EXPIRES,
        scope: ['some-other-host'],
      },
      SECRET
    );
    expect(await verifyCapabilityTicket(ticket, SECRET, 'cf-portal')).toBeNull();
  });

  it('verifyCapabilityTicket rejects a plain identity ticket (no scope at all)', async () => {
    // A malicious or legacy ticket with no capability field must not be
    // accepted as capability authority. This is the important negative test:
    // existing terminal-WS tickets should NOT be reusable as bridge auth.
    const ticket = await createTerminalTicket(
      { userId: 'u1', userEmail: null, sessionId: 'main', tabId: 'main', exp: NEVER_EXPIRES },
      SECRET
    );
    expect(await verifyCapabilityTicket(ticket, SECRET, 'cf-portal')).toBeNull();
  });

  it('verifyCapabilityTicket rejects expired even when scope matches', async () => {
    const ticket = await createCapabilityTicket(
      {
        userId: 'u1',
        userEmail: null,
        sessionId: 'main',
        tabId: 'main',
        exp: Date.now() - 1,
        scope: ['cf-portal'],
      },
      SECRET
    );
    expect(await verifyCapabilityTicket(ticket, SECRET, 'cf-portal')).toBeNull();
  });

  it('verifyCapabilityTicket rejects wrong secret even when scope matches', async () => {
    const ticket = await createCapabilityTicket(
      {
        userId: 'u1',
        userEmail: null,
        sessionId: 'main',
        tabId: 'main',
        exp: NEVER_EXPIRES,
        scope: ['cf-portal'],
      },
      SECRET
    );
    expect(await verifyCapabilityTicket(ticket, 'other-secret', 'cf-portal')).toBeNull();
  });
});
