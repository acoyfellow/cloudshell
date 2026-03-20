import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SESSION_ID,
  DEFAULT_TAB_ID,
  createStoredSession,
  createStoredTab,
  getDefaultSessionName,
  getDefaultTabName,
  normalizeRequestedTabId,
  normalizeRequestedWorkspaceId,
  parseStoredSessions,
  parseStoredTabs,
  resolveSession,
  resolveTab,
} from './tabs';

describe('workspace helpers', () => {
  it('defaults missing ids to main', () => {
    expect(normalizeRequestedWorkspaceId(undefined)).toBe(DEFAULT_SESSION_ID);
    expect(normalizeRequestedWorkspaceId(null)).toBe(DEFAULT_SESSION_ID);
    expect(normalizeRequestedTabId(undefined)).toBe(DEFAULT_TAB_ID);
    expect(normalizeRequestedTabId('   ')).toBe(DEFAULT_TAB_ID);
  });

  it('rejects invalid ids', () => {
    expect(normalizeRequestedWorkspaceId('has spaces')).toBeNull();
    expect(normalizeRequestedWorkspaceId('dots.not.allowed')).toBeNull();
    expect(normalizeRequestedTabId('../escape')).toBeNull();
  });

  it('creates the first session and tab as main ids', () => {
    const session = createStoredSession(
      [],
      undefined,
      () => 'ignored',
      () => 100
    );
    const tab = createStoredTab(
      [],
      undefined,
      () => 'ignored',
      () => 200
    );

    expect(session).toEqual({
      id: DEFAULT_SESSION_ID,
      name: 'session',
      createdAt: 100,
      lastActiveTabId: DEFAULT_TAB_ID,
      lastOpenedAt: 100,
    });

    expect(tab).toEqual({
      id: DEFAULT_TAB_ID,
      name: 'shell',
      createdAt: 200,
    });
  });

  it('creates later sessions and tabs from generated ids', () => {
    const session = createStoredSession(
      [{ id: 'main', name: 'session', createdAt: 1, lastActiveTabId: 'main', lastOpenedAt: 1 }],
      undefined,
      () => 'session-2',
      () => 300
    );
    const tab = createStoredTab(
      [{ id: 'main', name: 'shell', createdAt: 1 }],
      undefined,
      () => 'tab-2',
      () => 400
    );

    expect(session.id).toBe('session-2');
    expect(session.name).toBe('session-1');
    expect(tab).toEqual({
      id: 'tab-2',
      name: 'shell-1',
      createdAt: 400,
    });
  });

  it('parses stored sessions and tabs', () => {
    expect(
      parseStoredSessions(
        JSON.stringify([
          {
            id: 'main',
            name: 'session',
            createdAt: 10,
            lastActiveTabId: 'main',
            lastOpenedAt: 20,
          },
        ])
      )
    ).toEqual([
      {
        id: 'main',
        name: 'session',
        createdAt: 10,
        lastActiveTabId: 'main',
        lastOpenedAt: 20,
      },
    ]);

    expect(
      parseStoredTabs(
        JSON.stringify([
          { id: 'main', name: 'shell', createdAt: 10 },
          { id: 'tab-2', name: 'shell-1', createdAt: 20, sessionId: 'legacy' },
        ])
      )
    ).toEqual([
      { id: 'main', name: 'shell', createdAt: 10 },
      { id: 'tab-2', name: 'shell-1', createdAt: 20 },
    ]);
  });

  it('resolves requested sessions and tabs with defaults', () => {
    const sessions = [
      { id: 'main', name: 'session', createdAt: 1, lastActiveTabId: 'tab-2', lastOpenedAt: 1 },
      {
        id: 'session-2',
        name: 'session-1',
        createdAt: 2,
        lastActiveTabId: 'main',
        lastOpenedAt: 2,
      },
    ];
    const tabs = [
      { id: 'main', name: 'shell', createdAt: 1 },
      { id: 'tab-2', name: 'shell-1', createdAt: 2 },
    ];

    expect(resolveSession(sessions, 'session-2')?.id).toBe('session-2');
    expect(resolveSession(sessions, undefined)?.id).toBe('main');
    expect(resolveTab(sessions[0], tabs, undefined)?.id).toBe('tab-2');
    expect(resolveTab(sessions[0], tabs, '   ')?.id).toBe('tab-2');
    expect(resolveTab(sessions[0], tabs, 'missing')?.id).toBe('tab-2');
  });

  it('generates default names by index', () => {
    expect(getDefaultSessionName(0)).toBe('session');
    expect(getDefaultSessionName(1)).toBe('session-1');
    expect(getDefaultTabName(0)).toBe('shell');
    expect(getDefaultTabName(1)).toBe('shell-1');
  });
});
