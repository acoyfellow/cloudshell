import { Effect, Layer } from 'effect';
import { describe, expect, it } from 'vitest';
import { backupWorkspace } from './programs';
import { AuthService, ContainerRuntime, WorkspaceRepo } from './services';

describe('backupWorkspace', () => {
  it('checkpoints every session for the active user', async () => {
    const checkpointed: string[] = [];

    const program = backupWorkspace('alice').pipe(
      Effect.provide(
        Layer.mergeAll(
          Layer.succeed(AuthService, {
            requireUsername: () => Effect.succeed('alice'),
            requireTerminalIdentity: () => Effect.die('unused'),
          }),
          Layer.succeed(WorkspaceRepo, {
            listSessions: () =>
              Effect.succeed([
                {
                  id: 'main',
                  name: 'Main',
                  createdAt: 1,
                  lastActiveTabId: 'main',
                  lastOpenedAt: 1,
                },
                {
                  id: 'build',
                  name: 'Build',
                  createdAt: 2,
                  lastActiveTabId: 'main',
                  lastOpenedAt: 2,
                },
              ]),
            resolveSessionSelection: () => Effect.die('unused'),
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
            proxyTerminalRequest: () => Effect.die('unused'),
            checkpointSession: ({ sessionId }) => {
              checkpointed.push(sessionId);
              return Effect.succeed(true);
            },
            deleteSessionRuntime: () => Effect.succeed(true),
            deleteTabRuntime: () => Effect.succeed(true),
          })
        )
      )
    );

    await expect(Effect.runPromise(program)).resolves.toEqual({ success: true });
    expect(checkpointed).toEqual(['main', 'build']);
  });

  it('fails if any session checkpoint fails', async () => {
    const program = backupWorkspace('alice').pipe(
      Effect.provide(
        Layer.mergeAll(
          Layer.succeed(AuthService, {
            requireUsername: () => Effect.succeed('alice'),
            requireTerminalIdentity: () => Effect.die('unused'),
          }),
          Layer.succeed(WorkspaceRepo, {
            listSessions: () =>
              Effect.succeed([
                {
                  id: 'main',
                  name: 'Main',
                  createdAt: 1,
                  lastActiveTabId: 'main',
                  lastOpenedAt: 1,
                },
                {
                  id: 'build',
                  name: 'Build',
                  createdAt: 2,
                  lastActiveTabId: 'main',
                  lastOpenedAt: 2,
                },
              ]),
            resolveSessionSelection: () => Effect.die('unused'),
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
            proxyTerminalRequest: () => Effect.die('unused'),
            checkpointSession: ({ sessionId }) => Effect.succeed(sessionId === 'main'),
            deleteSessionRuntime: () => Effect.succeed(true),
            deleteTabRuntime: () => Effect.succeed(true),
          })
        )
      )
    );

    await expect(Effect.runPromise(program)).rejects.toThrow('Backup failed');
  });
});
