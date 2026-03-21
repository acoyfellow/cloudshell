import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SESSION_ID,
  DEFAULT_TAB_ID,
  loadWorkspaceSessions,
  parseStoredSessions,
} from './tabs';

function createMockKv(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));

  return {
    async get(key: string) {
      return store.get(key) ?? null;
    },
    async put(key: string, value: string) {
      store.set(key, value);
    },
    async delete(key: string) {
      store.delete(key);
    },
    snapshot() {
      return new Map(store);
    },
  };
}

describe('loadWorkspaceSessions', () => {
  it('preserves a stored session with no tabs instead of recreating one', async () => {
    const kv = createMockKv({
      'sessions:alice': JSON.stringify([
        {
          id: DEFAULT_SESSION_ID,
          name: 'session',
          createdAt: 1,
          lastActiveTabId: DEFAULT_TAB_ID,
          lastOpenedAt: 2,
        },
      ]),
      'tabs:alice:main': JSON.stringify([]),
    });

    await expect(loadWorkspaceSessions(kv, 'alice')).resolves.toEqual([
      {
        id: DEFAULT_SESSION_ID,
        name: 'session',
        createdAt: 1,
        lastActiveTabId: '',
        lastOpenedAt: 2,
      },
    ]);
    expect(kv.snapshot().get('tabs:alice:main')).toBe('[]');
  });

  it('returns an empty list when the workspace has no sessions yet', async () => {
    const kv = createMockKv();

    await expect(loadWorkspaceSessions(kv, 'alice')).resolves.toEqual([]);
    expect(kv.snapshot().size).toBe(0);
  });

  it('migrates legacy flat tabs into a default session', async () => {
    const kv = createMockKv({
      'tabs:alice': JSON.stringify([
        { id: DEFAULT_TAB_ID, name: 'shell', createdAt: 1 },
        { id: 'build', name: 'build-tab', createdAt: 2 },
      ]),
    });

    const sessions = await loadWorkspaceSessions(kv, 'alice');
    const snapshot = kv.snapshot();

    expect(sessions).toEqual([
      {
        id: DEFAULT_SESSION_ID,
        name: 'session',
        createdAt: 1,
        lastActiveTabId: DEFAULT_TAB_ID,
        lastOpenedAt: expect.any(Number),
      },
    ]);
    expect(snapshot.get('sessions:alice')).toContain('"id":"main"');
    expect(snapshot.get('tabs:alice:main')).toContain('"id":"build"');
    expect(snapshot.has('tabs:alice')).toBe(false);
  });
});

describe('parseStoredSessions', () => {
  it('accepts an empty lastActiveTabId for tab-empty sessions', () => {
    expect(
      parseStoredSessions(
        JSON.stringify([
          {
            id: DEFAULT_SESSION_ID,
            name: 'session',
            createdAt: 1,
            lastActiveTabId: '',
            lastOpenedAt: 2,
          },
        ])
      )
    ).toEqual([
      {
        id: DEFAULT_SESSION_ID,
        name: 'session',
        createdAt: 1,
        lastActiveTabId: '',
        lastOpenedAt: 2,
      },
    ]);
  });
});
