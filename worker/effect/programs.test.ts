import { Effect, Layer } from 'effect';
import { describe, expect, it } from 'vitest';
import { connectTerminal } from './programs';
import { AuthService, ContainerRuntime, WorkspaceRepo } from './services';
import { NotFound } from './errors';
import type { Session, Tab } from '../types';

function makeSelection(): { sessions: Session[]; session: Session; tabs: Tab[]; tab: Tab } {
  const session: Session = {
    id: 'main',
    name: 'session',
    createdAt: 1,
    lastActiveTabId: 'main',
    lastOpenedAt: 1,
  };
  const tab: Tab = {
    id: 'main',
    name: 'shell',
    createdAt: 1,
  };

  return {
    sessions: [session],
    session,
    tabs: [tab],
    tab,
  };
}

describe('connectTerminal', () => {
  it('persists session selection before proxying the terminal request', async () => {
    const events: string[] = [];
    const selection = makeSelection();
    const program = connectTerminal({
      request: new Request('http://localhost/ws/terminal'),
      upgrade: 'websocket',
      userIdHeader: 'alice',
      requestedSessionId: 'main',
      requestedTabId: 'main',
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          Layer.succeed(AuthService, {
            requireUsername: () => {
              events.push('auth');
              return Effect.succeed('alice');
            },
            requireTerminalIdentity: () => {
              events.push('auth');
              return Effect.succeed({ userId: 'alice' });
            },
          }),
          Layer.succeed(WorkspaceRepo, {
            listSessions: () => Effect.die('unused'),
            resolveSessionSelection: () => {
              events.push('resolve');
              return Effect.succeed(selection);
            },
            persistSessionSelection: () => {
              events.push('persist');
              return Effect.succeed(undefined);
            },
            createSession: () => Effect.die('unused'),
            updateSession: () => Effect.die('unused'),
            deleteSessionMetadata: () => Effect.die('unused'),
            listTabs: () => Effect.die('unused'),
            createTab: () => Effect.die('unused'),
            updateTab: () => Effect.die('unused'),
            deleteTab: () => Effect.die('unused'),
            listPorts: () => Effect.die('unused'),
            forwardPort: () => Effect.die('unused'),
            getDefaultSession: () => Effect.die('unused'),
          }),
          Layer.succeed(ContainerRuntime, {
            ensureTerminalReady: () => Effect.die('unused'),
            getTerminalHandle: ({ sessionId, tabId }) => {
              events.push(`handle:${sessionId}:${tabId}`);
              return Effect.succeed({
                container: {} as never,
                containerId: 'shell:alice:main',
              });
            },
            proxyTerminalRequest: () => {
              events.push('proxy');
              return Effect.succeed(new Response('proxied'));
            },
            checkpointSession: () => Effect.succeed(true),
            deleteSessionRuntime: () => Effect.succeed(true),
            deleteTabRuntime: () => Effect.succeed(true),
          })
        )
      )
    );

    const response = await Effect.runPromise(program);

    expect(await response.text()).toBe('proxied');
    // Post-GA: WS path no longer prewarms (ensureTerminalReady). It uses
    // getTerminalHandle and lets container.fetch() auto-start.
    expect(events).toEqual(['auth', 'resolve', 'persist', 'handle:main:main', 'proxy']);
  });

  it('fails when no session selection can be resolved', async () => {
    const program = connectTerminal({
      request: new Request('http://localhost/ws/terminal'),
      upgrade: 'websocket',
      userIdHeader: 'alice',
      requestedSessionId: 'main',
      requestedTabId: 'main',
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          Layer.succeed(AuthService, {
            requireUsername: () => Effect.succeed('alice'),
            requireTerminalIdentity: () => Effect.succeed({ userId: 'alice' }),
          }),
          Layer.succeed(WorkspaceRepo, {
            listSessions: () => Effect.die('unused'),
            resolveSessionSelection: () =>
              Effect.fail(new NotFound({ message: 'No session available' })),
            persistSessionSelection: () => Effect.die('unused'),
            createSession: () => Effect.die('unused'),
            updateSession: () => Effect.die('unused'),
            deleteSessionMetadata: () => Effect.die('unused'),
            listTabs: () => Effect.die('unused'),
            createTab: () => Effect.die('unused'),
            updateTab: () => Effect.die('unused'),
            deleteTab: () => Effect.die('unused'),
            listPorts: () => Effect.die('unused'),
            forwardPort: () => Effect.die('unused'),
            getDefaultSession: () => Effect.die('unused'),
          }),
          Layer.succeed(ContainerRuntime, {
            ensureTerminalReady: () => Effect.die('unused'),
            getTerminalHandle: () => Effect.die('unused'),
            proxyTerminalRequest: () => Effect.die('unused'),
            checkpointSession: () => Effect.succeed(true),
            deleteSessionRuntime: () => Effect.succeed(true),
            deleteTabRuntime: () => Effect.succeed(true),
          })
        )
      )
    );

    await expect(Effect.runPromise(program)).rejects.toThrow('No session available');
  });
});
