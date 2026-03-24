import { Effect, Layer } from 'effect';
import { getContainer } from '@cloudflare/containers';
import {
  getUserSessionContainerId,
} from '../auth';
import { verifyTerminalTicket } from '../../shared/terminal-ticket';
import {
  DEFAULT_SESSION_ID,
  createStoredSession,
  createStoredTab,
  deleteStoredPorts,
  deleteStoredTabs,
  getStoredPorts,
  getStoredTabs,
  isContainerActiveStatus,
  loadWorkspaceSessions,
  normalizeRequestedTabId,
  putStoredPorts,
  putStoredSessions,
  putStoredTabs,
  resolveSession,
  resolveTab,
  updateSessionRecord,
} from '../tabs';
import type { Env, Session, SessionPort, Tab } from '../types';
import {
  ContainerUnavailable,
  InvalidInput,
  NotFound,
  PersistenceFailure,
  Unauthorized,
} from './errors';

type ContainerHandle = ReturnType<typeof getContainer>;
type ContainerState = Awaited<ReturnType<ContainerHandle['getState']>>;

export interface SessionSelection {
  readonly sessions: Session[];
  readonly session: Session;
  readonly tabs: Tab[];
  readonly tab: Tab;
}

export interface RuntimeLogContext {
  readonly route: string;
  readonly username: string;
  readonly sessionId: string;
  readonly tabId?: string;
}

interface ReadyContainer {
  readonly container: ContainerHandle;
  readonly containerId: string;
}

interface AuthServiceApi {
  readonly requireUsername: (input: {
    readonly userIdHeader?: string | null;
  }) => Effect.Effect<string, Unauthorized>;
  readonly requireTerminalIdentity: (input: {
    readonly userIdHeader?: string | null;
    readonly ticket?: string | null;
  }) => Effect.Effect<
    {
      readonly userId: string;
      readonly sessionId?: string;
      readonly tabId?: string;
    },
    Unauthorized
  >;
}

interface WorkspaceRepoApi {
  readonly listSessions: (username: string) => Effect.Effect<Session[], PersistenceFailure>;
  readonly resolveSessionSelection: (
    username: string,
    requestedSessionId?: string | null,
    requestedTabId?: string | null
  ) => Effect.Effect<SessionSelection, NotFound | PersistenceFailure>;
  readonly persistSessionSelection: (
    username: string,
    sessions: Session[],
    sessionId: string,
    tabId: string
  ) => Effect.Effect<void, PersistenceFailure>;
  readonly createSession: (
    username: string,
    name?: string
  ) => Effect.Effect<{ readonly session: Session; readonly tab: Tab }, PersistenceFailure>;
  readonly updateSession: (
    username: string,
    sessionId: string,
    updates: { readonly name?: string; readonly lastActiveTabId?: string }
  ) => Effect.Effect<Session, InvalidInput | NotFound | PersistenceFailure>;
  readonly deleteSessionMetadata: (
    username: string,
    sessionId: string
  ) => Effect.Effect<void, NotFound | PersistenceFailure>;
  readonly listTabs: (
    username: string,
    sessionId: string
  ) => Effect.Effect<Tab[], NotFound | PersistenceFailure>;
  readonly createTab: (
    username: string,
    sessionId: string,
    name?: string
  ) => Effect.Effect<Tab, NotFound | PersistenceFailure>;
  readonly updateTab: (
    username: string,
    sessionId: string,
    tabId: string,
    updates: { readonly name?: string }
  ) => Effect.Effect<Tab, InvalidInput | NotFound | PersistenceFailure>;
  readonly deleteTab: (
    username: string,
    sessionId: string,
    tabId: string
  ) => Effect.Effect<{ readonly lastActiveTabId: string }, NotFound | PersistenceFailure>;
  readonly listPorts: (
    username: string,
    sessionId: string
  ) => Effect.Effect<SessionPort[], NotFound | PersistenceFailure>;
  readonly forwardPort: (
    username: string,
    sessionId: string,
    port: number
  ) => Effect.Effect<SessionPort, InvalidInput | NotFound | PersistenceFailure>;
  readonly getDefaultSession: (
    username: string
  ) => Effect.Effect<Session | null, PersistenceFailure>;
}

interface ContainerRuntimeApi {
  readonly ensureTerminalReady: (
    input: RuntimeLogContext & { readonly tabs: Tab[] }
  ) => Effect.Effect<ReadyContainer, ContainerUnavailable>;
  readonly proxyTerminalRequest: (
    ready: ReadyContainer,
    input: {
      readonly request: Request;
      readonly username: string;
      readonly sessionId: string;
      readonly tabId: string;
    }
  ) => Effect.Effect<Response, ContainerUnavailable>;
  readonly checkpointSession: (input: RuntimeLogContext) => Effect.Effect<boolean>;
  readonly deleteSessionRuntime: (input: RuntimeLogContext) => Effect.Effect<boolean>;
  readonly deleteTabRuntime: (input: RuntimeLogContext) => Effect.Effect<boolean>;
}

export class WorkerEnv extends Effect.Tag('cloudshell/WorkerEnv')<
  WorkerEnv,
  { readonly env: Env }
>() {}

export class AuthService extends Effect.Tag('cloudshell/AuthService')<
  AuthService,
  AuthServiceApi
>() {}

export class WorkspaceRepo extends Effect.Tag('cloudshell/WorkspaceRepo')<
  WorkspaceRepo,
  WorkspaceRepoApi
>() {}

export class ContainerRuntime extends Effect.Tag('cloudshell/ContainerRuntime')<
  ContainerRuntime,
  ContainerRuntimeApi
>() {}

export function makeWorkerEnvLayer(env: Env) {
  return Layer.succeed(WorkerEnv, { env });
}

function toPersistenceFailure(message: string) {
  return (cause: unknown) => new PersistenceFailure({ message, cause });
}

function toContainerFailure(message: string, retryable: boolean) {
  return () => new ContainerUnavailable({ message, retryable });
}

function runtimeAnnotations(context: RuntimeLogContext, containerId: string) {
  return {
    route: context.route,
    username: context.username,
    sessionId: context.sessionId,
    tabId: context.tabId ?? '-',
    containerId,
  };
}

function annotateRuntime<A, E, R>(
  context: RuntimeLogContext,
  containerId: string,
  effect: Effect.Effect<A, E, R>
) {
  return effect.pipe(Effect.annotateLogs(runtimeAnnotations(context, containerId)));
}

const AuthServiceLive = Layer.effect(
  AuthService,
  Effect.gen(function* () {
    const { env } = yield* WorkerEnv;

    return {
      requireUsername: ({ userIdHeader }) =>
        Effect.gen(function* () {
          const userId = userIdHeader?.trim();
          if (!userId) {
            return yield* Effect.fail(
              new Unauthorized({ message: 'Authentication required' })
            );
          }
          return userId;
        }),
      requireTerminalIdentity: ({ userIdHeader, ticket }) =>
        Effect.gen(function* () {
          const userId = userIdHeader?.trim();
          if (userId) {
            return { userId };
          }

          const token = ticket?.trim();
          if (!token) {
            return yield* Effect.fail(
              new Unauthorized({ message: 'Authentication required' })
            );
          }

          const payload = yield* Effect.tryPromise({
            try: () => verifyTerminalTicket(token, env.TERMINAL_TICKET_SECRET),
            catch: () => new Unauthorized({ message: 'Authentication required' }),
          });

          if (!payload) {
            return yield* Effect.fail(
              new Unauthorized({ message: 'Authentication required' })
            );
          }

          return {
            userId: payload.userId,
            sessionId: payload.sessionId,
            tabId: payload.tabId,
          };
        }),
    } satisfies AuthServiceApi;
  })
);

const WorkspaceRepoLive = Layer.effect(
  WorkspaceRepo,
  Effect.gen(function* () {
    const { env } = yield* WorkerEnv;

    const listSessions = (username: string) =>
      Effect.tryPromise({
        try: () => loadWorkspaceSessions(env.USERS_KV, username),
        catch: toPersistenceFailure(`Failed to load sessions for ${username}`),
      });

    const requireSession = (
      sessions: Session[],
      sessionId: string
    ): Effect.Effect<Session, NotFound> => {
      const session = sessions.find((candidate) => candidate.id === sessionId);
      return session
        ? Effect.succeed(session)
        : Effect.fail(new NotFound({ message: 'Session not found' }));
    };

    return {
      listSessions,
      resolveSessionSelection: (username, requestedSessionId, requestedTabId) =>
        Effect.gen(function* () {
          const sessions = yield* listSessions(username);
          const session = resolveSession(sessions, requestedSessionId);

          if (!session) {
            return yield* Effect.fail(new NotFound({ message: 'No session available' }));
          }

          const tabs = yield* Effect.tryPromise({
            try: () => getStoredTabs(env.USERS_KV, username, session.id),
            catch: toPersistenceFailure(
              `Failed to load tabs for ${username}/${session.id}`
            ),
          });
          const tab = resolveTab(session, tabs, requestedTabId);

          if (!tab) {
            return yield* Effect.fail(new NotFound({ message: 'No tab available' }));
          }

          return { sessions, session, tabs, tab };
        }),
      persistSessionSelection: (username, sessions, sessionId, tabId) =>
        Effect.tryPromise({
          try: () =>
            putStoredSessions(
              env.USERS_KV,
              username,
              updateSessionRecord(sessions, sessionId, {
                lastActiveTabId: tabId,
                lastOpenedAt: Date.now(),
              })
            ),
          catch: toPersistenceFailure(
            `Failed to persist session selection for ${username}/${sessionId}/${tabId}`
          ),
        }),
      createSession: (username, name) =>
        Effect.gen(function* () {
          const sessions = yield* listSessions(username);
          const session = createStoredSession(sessions, name);
          const tab = createStoredTab([]);
          session.lastActiveTabId = tab.id;

          yield* Effect.tryPromise({
            try: async () => {
              await putStoredSessions(env.USERS_KV, username, [...sessions, session]);
              await putStoredTabs(env.USERS_KV, username, session.id, [tab]);
              await putStoredPorts(env.USERS_KV, username, session.id, []);
            },
            catch: toPersistenceFailure(`Failed to create session ${session.id}`),
          });

          return { session, tab };
        }),
      updateSession: (username, sessionId, updates) =>
        Effect.gen(function* () {
          const sessions = yield* listSessions(username);
          yield* requireSession(sessions, sessionId);
          const nextUpdates: Partial<
            Pick<Session, 'name' | 'lastActiveTabId' | 'lastOpenedAt'>
          > = {};

          if (typeof updates.name === 'string' && updates.name.trim() !== '') {
            nextUpdates.name = updates.name.trim();
          }

          if (typeof updates.lastActiveTabId === 'string') {
            const normalizedTabId = normalizeRequestedTabId(updates.lastActiveTabId);
            if (!normalizedTabId) {
              return yield* Effect.fail(new InvalidInput({ message: 'Invalid tab id' }));
            }

            const tabs = yield* Effect.tryPromise({
              try: () => getStoredTabs(env.USERS_KV, username, sessionId),
              catch: toPersistenceFailure(
                `Failed to load tabs for ${username}/${sessionId}`
              ),
            });

            if (!tabs.some((tab) => tab.id === normalizedTabId)) {
              return yield* Effect.fail(new NotFound({ message: 'Tab not found' }));
            }

            nextUpdates.lastActiveTabId = normalizedTabId;
            nextUpdates.lastOpenedAt = Date.now();
          }

          const updatedSessions = updateSessionRecord(sessions, sessionId, nextUpdates);
          yield* Effect.tryPromise({
            try: () => putStoredSessions(env.USERS_KV, username, updatedSessions),
            catch: toPersistenceFailure(`Failed to update session ${sessionId}`),
          });

          const updatedSession = updatedSessions.find(
            (candidate) => candidate.id === sessionId
          );

          if (!updatedSession) {
            return yield* Effect.fail(
              new PersistenceFailure({
                message: `Updated session ${sessionId} is missing`,
              })
            );
          }

          return updatedSession;
        }),
      deleteSessionMetadata: (username, sessionId) =>
        Effect.gen(function* () {
          const sessions = yield* listSessions(username);
          yield* requireSession(sessions, sessionId);

          yield* Effect.tryPromise({
            try: async () => {
              await deleteStoredTabs(env.USERS_KV, username, sessionId);
              await deleteStoredPorts(env.USERS_KV, username, sessionId);
              await putStoredSessions(
                env.USERS_KV,
                username,
                sessions.filter((candidate) => candidate.id !== sessionId)
              );
            },
            catch: toPersistenceFailure(`Failed to delete session ${sessionId}`),
          });
        }),
      listTabs: (username, sessionId) =>
        Effect.gen(function* () {
          const sessions = yield* listSessions(username);
          yield* requireSession(sessions, sessionId);

          return yield* Effect.tryPromise({
            try: () => getStoredTabs(env.USERS_KV, username, sessionId),
            catch: toPersistenceFailure(`Failed to load tabs for ${sessionId}`),
          });
        }),
      createTab: (username, sessionId, name) =>
        Effect.gen(function* () {
          const sessions = yield* listSessions(username);
          yield* requireSession(sessions, sessionId);

          const tabs = yield* Effect.tryPromise({
            try: () => getStoredTabs(env.USERS_KV, username, sessionId),
            catch: toPersistenceFailure(`Failed to load tabs for ${sessionId}`),
          });
          const tab = createStoredTab(tabs, name);
          const nextTabs = [...tabs, tab];

          yield* Effect.tryPromise({
            try: async () => {
              await putStoredTabs(env.USERS_KV, username, sessionId, nextTabs);
              await putStoredSessions(
                env.USERS_KV,
                username,
                updateSessionRecord(sessions, sessionId, {
                  lastActiveTabId: tab.id,
                  lastOpenedAt: Date.now(),
                })
              );
            },
            catch: toPersistenceFailure(`Failed to create tab for ${sessionId}`),
          });

          return tab;
        }),
      updateTab: (username, sessionId, tabId, updates) =>
        Effect.gen(function* () {
          const sessions = yield* listSessions(username);
          yield* requireSession(sessions, sessionId);
          const tabs = yield* Effect.tryPromise({
            try: () => getStoredTabs(env.USERS_KV, username, sessionId),
            catch: toPersistenceFailure(`Failed to load tabs for ${sessionId}`),
          });

          const existingTab = tabs.find((tab) => tab.id === tabId);
          if (!existingTab) {
            return yield* Effect.fail(new NotFound({ message: 'Tab not found' }));
          }

          const trimmedName = updates.name?.trim();
          if (!trimmedName) {
            return yield* Effect.fail(new InvalidInput({ message: 'Tab name is required' }));
          }

          const nextTabs = tabs.map((tab) =>
            tab.id === tabId
              ? {
                  ...tab,
                  name: trimmedName,
                }
              : tab
          );

          yield* Effect.tryPromise({
            try: () => putStoredTabs(env.USERS_KV, username, sessionId, nextTabs),
            catch: toPersistenceFailure(`Failed to update tab ${sessionId}/${tabId}`),
          });

          const updatedTab = nextTabs.find((tab) => tab.id === tabId);
          if (!updatedTab) {
            return yield* Effect.fail(
              new PersistenceFailure({
                message: `Updated tab ${sessionId}/${tabId} is missing`,
              })
            );
          }

          return updatedTab;
        }),
      deleteTab: (username, sessionId, tabId) =>
        Effect.gen(function* () {
          const sessions = yield* listSessions(username);
          const session = yield* requireSession(sessions, sessionId);
          const tabs = yield* Effect.tryPromise({
            try: () => getStoredTabs(env.USERS_KV, username, sessionId),
            catch: toPersistenceFailure(`Failed to load tabs for ${sessionId}`),
          });

          if (!tabs.some((tab) => tab.id === tabId)) {
            return yield* Effect.fail(new NotFound({ message: 'Tab not found' }));
          }

          const nextTabs = tabs.filter((tab) => tab.id !== tabId);
          const nextActiveTabId =
            nextTabs.length === 0
              ? ''
              : session.lastActiveTabId === tabId
                ? nextTabs[0].id
                : session.lastActiveTabId;

          yield* Effect.tryPromise({
            try: async () => {
              await putStoredTabs(env.USERS_KV, username, sessionId, nextTabs);
              await putStoredSessions(
                env.USERS_KV,
                username,
                updateSessionRecord(sessions, sessionId, {
                  lastActiveTabId: nextActiveTabId,
                  lastOpenedAt: Date.now(),
                })
              );
            },
            catch: toPersistenceFailure(`Failed to delete tab ${sessionId}/${tabId}`),
          });

          return { lastActiveTabId: nextActiveTabId };
        }),
      listPorts: (username, sessionId) =>
        Effect.gen(function* () {
          const sessions = yield* listSessions(username);
          yield* requireSession(sessions, sessionId);

          return yield* Effect.tryPromise({
            try: () => getStoredPorts(env.USERS_KV, username, sessionId),
            catch: toPersistenceFailure(`Failed to load ports for ${sessionId}`),
          });
        }),
      forwardPort: (username, sessionId, port) =>
        Effect.gen(function* () {
          const sessions = yield* listSessions(username);
          yield* requireSession(sessions, sessionId);

          if (!port || port < 1024 || port > 65535) {
            return yield* Effect.fail(
              new InvalidInput({
                message: 'Invalid port number (must be 1024-65535)',
              })
            );
          }

          const existingPorts = yield* Effect.tryPromise({
            try: () => getStoredPorts(env.USERS_KV, username, sessionId),
            catch: toPersistenceFailure(`Failed to load ports for ${sessionId}`),
          });
          const existingPort = existingPorts.find((forward) => forward.port === port);

          if (existingPort) {
            return existingPort;
          }

          const containerId = getUserSessionContainerId(username, sessionId);
          const subdomain = `${port}-${containerId}`.replace(/:/g, '-');
          const forward: SessionPort = {
            port,
            url: `https://${subdomain}.${env.PORT_FORWARD_BASE_DOMAIN}`,
            createdAt: Date.now(),
          };

          yield* Effect.tryPromise({
            try: () =>
              putStoredPorts(env.USERS_KV, username, sessionId, [...existingPorts, forward]),
            catch: toPersistenceFailure(`Failed to save port ${port} for ${sessionId}`),
          });

          return forward;
        }),
      getDefaultSession: (username) =>
        listSessions(username).pipe(
          Effect.map((sessions) => resolveSession(sessions, DEFAULT_SESSION_ID))
        ),
    } satisfies WorkspaceRepoApi;
  })
);

const ContainerRuntimeLive = Layer.effect(
  ContainerRuntime,
  Effect.gen(function* () {
    const { env } = yield* WorkerEnv;

    const callTabEndpoint = (
      container: ContainerHandle,
      username: string,
      sessionId: string,
      tabId: string,
      endpoint: 'save' | 'restore' | 'delete'
    ) =>
      Effect.tryPromise({
        try: async () => {
          const response = await container.fetch(
            new Request(`http://localhost:8080/api/tab/${endpoint}`, {
              method: 'POST',
              headers: {
                'X-User': username,
                'X-Session-Id': sessionId,
                'X-Tab-Id': tabId,
              },
            })
          );

          if (!response.ok) {
            return false;
          }

          const result: { restored?: boolean; saved?: boolean; deleted?: boolean } =
            await response.json();

          if (endpoint === 'restore') {
            return result.restored === true;
          }

          if (endpoint === 'delete') {
            return result.deleted === true;
          }

          return result.saved === true;
        },
        catch: toContainerFailure('Container error, please retry in a moment.', true),
      });

    const callSessionEndpoint = (
      container: ContainerHandle,
      username: string,
      sessionId: string,
      endpoint: 'checkpoint' | 'delete'
    ) =>
      Effect.tryPromise({
        try: async () => {
          const response = await container.fetch(
            new Request(`http://localhost:8080/api/session/${endpoint}`, {
              method: 'POST',
              headers: {
                'X-User': username,
                'X-Session-Id': sessionId,
              },
            })
          );

          if (!response.ok) {
            return false;
          }

          const result: { deleted?: boolean; saved?: boolean } = await response.json();
          return endpoint === 'delete' ? result.deleted === true : result.saved === true;
        },
        catch: toContainerFailure('Container error, please retry in a moment.', true),
      });

    const getReadyContainer = (username: string, sessionId: string): ReadyContainer => ({
      container: getContainer(env.Sandbox, getUserSessionContainerId(username, sessionId)),
      containerId: getUserSessionContainerId(username, sessionId),
    });

    const restoreTabsBestEffort = (
      ready: ReadyContainer,
      context: RuntimeLogContext,
      tabs: Tab[]
    ) =>
      Effect.gen(function* () {
        for (const tab of tabs) {
          const restored = yield* callTabEndpoint(
            ready.container,
            context.username,
            context.sessionId,
            tab.id,
            'restore'
          ).pipe(
            Effect.catchTag('ContainerUnavailable', () =>
              annotateRuntime(
                context,
                ready.containerId,
                Effect.logWarning(`Failed to restore tab ${context.sessionId}/${tab.id}`)
              ).pipe(
                Effect.annotateLogs({ restoreTabId: tab.id }),
                Effect.as(false)
              )
            )
          );

          yield* annotateRuntime(
            context,
            ready.containerId,
            restored
              ? Effect.logInfo(`Restored tab ${context.sessionId}/${tab.id}`)
              : Effect.logWarning(`No saved tab found for ${context.sessionId}/${tab.id}`)
          ).pipe(Effect.annotateLogs({ restoreTabId: tab.id }));
        }
      });

    const ensureReadyAttempt = (
      ready: ReadyContainer,
      context: RuntimeLogContext & { readonly tabs: Tab[] },
      attempt: number
    ) =>
      annotateRuntime(
        context,
        ready.containerId,
        Effect.gen(function* () {
          const state = yield* Effect.tryPromise({
            try: async () => (await ready.container.getState()) as ContainerState,
            catch: toContainerFailure('Container error, please retry in a moment.', true),
          });
          const status = state.status;

          yield* Effect.logInfo(`Container state ${status}`).pipe(
            Effect.annotateLogs({ attempt })
          );

          if (status === 'stopping') {
            return yield* Effect.fail(
              new ContainerUnavailable({
                message: 'Container is restarting, please retry in a moment.',
                retryable: false,
              })
            );
          }

          if (isContainerActiveStatus(status)) {
            yield* Effect.tryPromise({
              try: () => ready.container.waitForPort({ portToCheck: 8080 }),
              catch: toContainerFailure('Container error, please retry in a moment.', true),
            });
            return ready;
          }

          if (status === 'stopped' || status === 'stopped_with_code') {
            yield* Effect.logInfo('Starting stopped container').pipe(
              Effect.annotateLogs({ attempt })
            );
            yield* Effect.tryPromise({
              try: () => ready.container.startAndWaitForPorts({ ports: [8080] }),
              catch: toContainerFailure('Container error, please retry in a moment.', true),
            });
            yield* restoreTabsBestEffort(ready, context, context.tabs);
            return ready;
          }

          return yield* Effect.fail(
            new ContainerUnavailable({
              message: 'Container error, please retry in a moment.',
              retryable: true,
            })
          );
        })
      );

    const retryContainerReadiness = (
      ready: ReadyContainer,
      context: RuntimeLogContext & { readonly tabs: Tab[] },
      startedAt: number,
      attempt: number
    ): Effect.Effect<ReadyContainer, ContainerUnavailable> =>
      ensureReadyAttempt(ready, context, attempt).pipe(
        Effect.catchTag('ContainerUnavailable', (error) => {
          const elapsed = Date.now() - startedAt;
          const delay = Math.min(250 * 2 ** (attempt - 1), 2000);

          if (!error.retryable || attempt >= 6 || elapsed + delay > 10000) {
            return Effect.fail(
              new ContainerUnavailable({
                message: error.message,
                retryable: false,
              })
            );
          }

          return annotateRuntime(
            context,
            ready.containerId,
            Effect.logWarning('Retrying container readiness')
          ).pipe(
            Effect.annotateLogs({ attempt, delayMs: delay }),
            Effect.zipRight(Effect.sleep(delay)),
            Effect.zipRight(retryContainerReadiness(ready, context, startedAt, attempt + 1))
          );
        })
      );

    const ensureRuntimeContainer = (
      context: RuntimeLogContext,
      options: { readonly startIfStopped?: boolean } = {}
    ): Effect.Effect<
      ReadyContainer & { readonly status: string },
      ContainerUnavailable
    > => {
      const ready = getReadyContainer(context.username, context.sessionId);

      return annotateRuntime(
        context,
        ready.containerId,
        Effect.tryPromise({
          try: async () => (await ready.container.getState()) as ContainerState,
          catch: toContainerFailure('Container error, please retry in a moment.', false),
        })
      ).pipe(
        Effect.flatMap((state) => {
          const status = state.status;

          if (isContainerActiveStatus(status)) {
            return annotateRuntime(
              context,
              ready.containerId,
              Effect.tryPromise({
                try: () => ready.container.waitForPort({ portToCheck: 8080 }),
                catch: toContainerFailure(
                  'Container error, please retry in a moment.',
                  false
                ),
              })
            ).pipe(Effect.as({ ...ready, status }));
          }

          if (status === 'stopping') {
            return Effect.fail(
              new ContainerUnavailable({
                message: 'Container is restarting, please retry in a moment.',
                retryable: false,
              })
            );
          }

          if (!options.startIfStopped) {
            return Effect.succeed({ ...ready, status });
          }

          return annotateRuntime(
            context,
            ready.containerId,
            Effect.tryPromise({
              try: () => ready.container.startAndWaitForPorts({ ports: [8080] }),
              catch: toContainerFailure('Container error, please retry in a moment.', false),
            })
          ).pipe(Effect.as({ ...ready, status: 'healthy' }));
        })
      );
    };

    const swallowRuntimeFailure = (
      context: RuntimeLogContext,
      effect: Effect.Effect<boolean, ContainerUnavailable>
    ) => {
      const ready = getReadyContainer(context.username, context.sessionId);
      return effect.pipe(
        Effect.catchTag('ContainerUnavailable', (error) =>
          annotateRuntime(
            context,
            ready.containerId,
            Effect.logError(error.message)
          ).pipe(Effect.as(false))
        )
      );
    };

    return {
      ensureTerminalReady: (input) => {
        const ready = getReadyContainer(input.username, input.sessionId);
        return retryContainerReadiness(ready, input, Date.now(), 1);
      },
      proxyTerminalRequest: (ready, input) =>
        annotateRuntime(
          {
            route: '/ws/terminal',
            username: input.username,
            sessionId: input.sessionId,
            tabId: input.tabId,
          },
          ready.containerId,
          Effect.tryPromise({
            try: async () => {
              const headers = new Headers(input.request.headers);
              headers.set('X-User', input.username);
              headers.set('X-Session-Id', input.sessionId);
              headers.set('X-Tab-Id', input.tabId);
              // Match Cloudflare's container WebSocket example: synthetic http://host (not the browser's https worker URL).
              // https://developers.cloudflare.com/containers/examples/websocket/
              const u = new URL(input.request.url);
              const internal = new URL(`${u.pathname}${u.search}`, 'http://localhost:8080');
              return ready.container.fetch(
                new Request(internal, {
                  method: input.request.method,
                  headers,
                })
              );
            },
            catch: toContainerFailure('Container error, please retry in a moment.', true),
          })
        ),
      checkpointSession: (input) =>
        swallowRuntimeFailure(
          input,
          ensureRuntimeContainer(input).pipe(
            Effect.flatMap((ready) => {
              if (!isContainerActiveStatus(ready.status)) {
                return Effect.succeed(true);
              }

              return callSessionEndpoint(
                ready.container,
                input.username,
                input.sessionId,
                'checkpoint'
              );
            })
          )
        ),
      deleteSessionRuntime: (input) =>
        swallowRuntimeFailure(
          input,
          ensureRuntimeContainer(input, { startIfStopped: true }).pipe(
            Effect.flatMap((ready) =>
              callSessionEndpoint(ready.container, input.username, input.sessionId, 'delete')
            )
          )
        ),
      deleteTabRuntime: (input) =>
        swallowRuntimeFailure(
          input,
          ensureRuntimeContainer(input, { startIfStopped: true }).pipe(
            Effect.flatMap((ready) =>
              callTabEndpoint(
                ready.container,
                input.username,
                input.sessionId,
                input.tabId ?? 'main',
                'delete'
              )
            )
          )
        ),
    } satisfies ContainerRuntimeApi;
  })
);

export function makeRequestLayer(env: Env) {
  const workerEnv = makeWorkerEnvLayer(env);

  return Layer.mergeAll(
    workerEnv,
    Layer.provide(AuthServiceLive, workerEnv),
    Layer.provide(WorkspaceRepoLive, workerEnv),
    Layer.provide(ContainerRuntimeLive, workerEnv)
  );
}
