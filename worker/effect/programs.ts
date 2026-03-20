import { Effect } from 'effect';
import { InvalidInput, PersistenceFailure, Unauthorized } from './errors';
import {
  decodeJsonBody,
  decodeTabId,
  decodeWorkspaceId,
  OptionalNameBodySchema,
  PortBodySchema,
  SessionPatchBodySchema,
} from './schema';
import {
  AuthService,
  ContainerRuntime,
  WorkspaceRepo,
} from './services';

export const requireAuthorizedUsername = (input: {
  readonly userIdHeader?: string | null;
}) =>
  Effect.gen(function* () {
    const auth = yield* AuthService;
    return yield* auth.requireUsername(input);
  });

export const connectTerminal = (input: {
  readonly request: Request;
  readonly upgrade?: string;
  readonly userIdHeader?: string | null;
  readonly ticket?: string | null;
  readonly requestedSessionId?: string | null;
  readonly requestedTabId?: string | null;
}) =>
  Effect.gen(function* () {
    if (input.upgrade?.toLowerCase() !== 'websocket') {
      return yield* Effect.fail(
        new InvalidInput({
          message: 'expected websocket',
          status: 426,
          format: 'text',
        })
      );
    }

    const auth = yield* AuthService;
    const workspace = yield* WorkspaceRepo;
    const runtime = yield* ContainerRuntime;
    const identity = yield* auth.requireTerminalIdentity({
      userIdHeader: input.userIdHeader,
      ticket: input.ticket,
    });
    const username = identity.userId;
    const requestedSessionId = yield* decodeWorkspaceId(
      identity.sessionId ?? input.requestedSessionId,
      'Invalid sessionId'
    );
    const requestedTabId = yield* decodeTabId(identity.tabId ?? input.requestedTabId, 'Invalid tabId');
    const selection = yield* workspace.resolveSessionSelection(
      username,
      requestedSessionId,
      requestedTabId
    );

    yield* workspace.persistSessionSelection(
      username,
      selection.sessions,
      selection.session.id,
      selection.tab.id
    );

    const ready = yield* runtime.ensureTerminalReady({
      route: '/ws/terminal',
      username,
      sessionId: selection.session.id,
      tabId: selection.tab.id,
      tabs: selection.tabs,
    });

    return yield* runtime.proxyTerminalRequest(ready, {
      request: input.request,
      username,
      sessionId: selection.session.id,
      tabId: selection.tab.id,
    });
  });

export const listSessions = (userIdHeader?: string | null) =>
  Effect.gen(function* () {
    const workspace = yield* WorkspaceRepo;
    const username = yield* requireAuthorizedUsername({ userIdHeader });
    return { sessions: yield* workspace.listSessions(username) };
  });

export const createSession = (request: Request, userIdHeader?: string | null) =>
  Effect.gen(function* () {
    const workspace = yield* WorkspaceRepo;
    const username = yield* requireAuthorizedUsername({ userIdHeader });
    const body = yield* decodeJsonBody(request, OptionalNameBodySchema, 'Invalid request', {
      allowEmptyObject: true,
    });
    const created = yield* workspace.createSession(username, body.name);
    return { session: created.session, tab: created.tab };
  });

export const updateSession = (
  request: Request,
  userIdHeader: string | null | undefined,
  sessionIdParam: string
) =>
  Effect.gen(function* () {
    const workspace = yield* WorkspaceRepo;
    const username = yield* requireAuthorizedUsername({ userIdHeader });
    const sessionId = yield* decodeWorkspaceId(sessionIdParam, 'Invalid session id');
    const body = yield* decodeJsonBody(request, SessionPatchBodySchema, 'Invalid request', {
      allowEmptyObject: true,
    });
    const updates = {
      name: typeof body.name === 'string' ? body.name : undefined,
      lastActiveTabId:
        typeof body.lastActiveTabId === 'string'
          ? yield* decodeTabId(body.lastActiveTabId, 'Invalid tab id')
          : undefined,
    };

    return {
      session: yield* workspace.updateSession(username, sessionId, updates),
    };
  });

export const deleteSession = (userIdHeader: string | null | undefined, sessionIdParam: string) =>
  Effect.gen(function* () {
    const workspace = yield* WorkspaceRepo;
    const runtime = yield* ContainerRuntime;
    const username = yield* requireAuthorizedUsername({ userIdHeader });
    const sessionId = yield* decodeWorkspaceId(sessionIdParam, 'Invalid session id');

    yield* runtime.deleteSessionRuntime({
      route: '/api/sessions/:id',
      username,
      sessionId,
    });
    yield* workspace.deleteSessionMetadata(username, sessionId);

    return { success: true };
  });

export const checkpointSession = (
  userIdHeader: string | null | undefined,
  sessionIdParam: string
) =>
  Effect.gen(function* () {
    const workspace = yield* WorkspaceRepo;
    const runtime = yield* ContainerRuntime;
    const username = yield* requireAuthorizedUsername({ userIdHeader });
    const sessionId = yield* decodeWorkspaceId(sessionIdParam, 'Invalid session id');

    yield* workspace.listTabs(username, sessionId);
    const success = yield* runtime.checkpointSession({
      route: '/api/sessions/:id/checkpoint',
      username,
      sessionId,
    });

    if (!success) {
      return yield* Effect.fail(new PersistenceFailure({ message: 'Checkpoint failed' }));
    }

    return { success: true };
  });

export const listTabs = (userIdHeader: string | null | undefined, sessionIdParam: string) =>
  Effect.gen(function* () {
    const workspace = yield* WorkspaceRepo;
    const username = yield* requireAuthorizedUsername({ userIdHeader });
    const sessionId = yield* decodeWorkspaceId(sessionIdParam, 'Invalid session id');

    return { tabs: yield* workspace.listTabs(username, sessionId) };
  });

export const createTab = (
  request: Request,
  userIdHeader: string | null | undefined,
  sessionIdParam: string
) =>
  Effect.gen(function* () {
    const workspace = yield* WorkspaceRepo;
    const username = yield* requireAuthorizedUsername({ userIdHeader });
    const sessionId = yield* decodeWorkspaceId(sessionIdParam, 'Invalid session id');
    const body = yield* decodeJsonBody(request, OptionalNameBodySchema, 'Invalid request', {
      allowEmptyObject: true,
    });

    return { tab: yield* workspace.createTab(username, sessionId, body.name) };
  });

export const updateTab = (
  request: Request,
  userIdHeader: string | null | undefined,
  sessionIdParam: string,
  tabIdParam: string
) =>
  Effect.gen(function* () {
    const workspace = yield* WorkspaceRepo;
    const username = yield* requireAuthorizedUsername({ userIdHeader });
    const sessionId = yield* decodeWorkspaceId(sessionIdParam, 'Invalid session or tab id');
    const tabId = yield* decodeTabId(tabIdParam, 'Invalid session or tab id');
    const body = yield* decodeJsonBody(request, OptionalNameBodySchema, 'Invalid request', {
      allowEmptyObject: true,
    });

    return {
      tab: yield* workspace.updateTab(username, sessionId, tabId, {
        name: body.name,
      }),
    };
  });

export const deleteTab = (
  userIdHeader: string | null | undefined,
  sessionIdParam: string,
  tabIdParam: string
) =>
  Effect.gen(function* () {
    const workspace = yield* WorkspaceRepo;
    const runtime = yield* ContainerRuntime;
    const username = yield* requireAuthorizedUsername({ userIdHeader });
    const sessionId = yield* decodeWorkspaceId(sessionIdParam, 'Invalid session or tab id');
    const tabId = yield* decodeTabId(tabIdParam, 'Invalid session or tab id');

    yield* runtime.deleteTabRuntime({
      route: '/api/sessions/:id/tabs/:tabId',
      username,
      sessionId,
      tabId,
    });
    const result = yield* workspace.deleteTab(username, sessionId, tabId);

    return { success: true, lastActiveTabId: result.lastActiveTabId };
  });

export const listPorts = (userIdHeader: string | null | undefined, sessionIdParam: string) =>
  Effect.gen(function* () {
    const workspace = yield* WorkspaceRepo;
    const username = yield* requireAuthorizedUsername({ userIdHeader });
    const sessionId = yield* decodeWorkspaceId(sessionIdParam, 'Invalid session id');

    return { ports: yield* workspace.listPorts(username, sessionId) };
  });

export const forwardPort = (
  request: Request,
  userIdHeader: string | null | undefined,
  sessionIdParam: string
) =>
  Effect.gen(function* () {
    const workspace = yield* WorkspaceRepo;
    const username = yield* requireAuthorizedUsername({ userIdHeader });
    const sessionId = yield* decodeWorkspaceId(sessionIdParam, 'Invalid session id');
    const body = yield* decodeJsonBody(request, PortBodySchema, 'Invalid request');

    return yield* workspace.forwardPort(username, sessionId, body.port);
  });

export const listLegacyPorts = (userIdHeader?: string | null) =>
  Effect.gen(function* () {
    const workspace = yield* WorkspaceRepo;
    const username = yield* requireAuthorizedUsername({ userIdHeader });
    const defaultSession = yield* workspace.getDefaultSession(username);

    if (!defaultSession) {
      return { ports: [] };
    }

    return { ports: yield* workspace.listPorts(username, defaultSession.id) };
  });

export const forwardLegacyPort = (request: Request, userIdHeader?: string | null) =>
  Effect.gen(function* () {
    const workspace = yield* WorkspaceRepo;
    const username = yield* requireAuthorizedUsername({ userIdHeader });
    const defaultSession = yield* workspace.getDefaultSession(username);

    if (!defaultSession) {
      return yield* Effect.fail(
        new PersistenceFailure({ message: 'No default session available' })
      );
    }

    const body = yield* decodeJsonBody(request, PortBodySchema, 'Invalid request');
    return yield* workspace.forwardPort(username, defaultSession.id, body.port);
  });

export const listLegacyTabs = (userIdHeader?: string | null) =>
  Effect.gen(function* () {
    const workspace = yield* WorkspaceRepo;
    const username = yield* requireAuthorizedUsername({ userIdHeader });
    const defaultSession = yield* workspace.getDefaultSession(username);

    if (!defaultSession) {
      return { tabs: [] };
    }

    return { tabs: yield* workspace.listTabs(username, defaultSession.id) };
  });

export const createLegacyTab = (request: Request, userIdHeader?: string | null) =>
  Effect.gen(function* () {
    const workspace = yield* WorkspaceRepo;
    const username = yield* requireAuthorizedUsername({ userIdHeader });
    const defaultSession = yield* workspace.getDefaultSession(username);

    if (!defaultSession) {
      return yield* Effect.fail(
        new PersistenceFailure({ message: 'No default session available' })
      );
    }

    const body = yield* decodeJsonBody(request, OptionalNameBodySchema, 'Invalid request', {
      allowEmptyObject: true,
    });

    return { tab: yield* workspace.createTab(username, defaultSession.id, body.name) };
  });

export const deleteLegacyTab = (userIdHeader: string | null | undefined, tabIdParam: string) =>
  Effect.gen(function* () {
    const workspace = yield* WorkspaceRepo;
    const runtime = yield* ContainerRuntime;
    const username = yield* requireAuthorizedUsername({ userIdHeader });
    const defaultSession = yield* workspace.getDefaultSession(username);

    if (!defaultSession) {
      return yield* Effect.fail(
        new PersistenceFailure({ message: 'No default session available' })
      );
    }

    const tabId = yield* decodeTabId(tabIdParam, 'Invalid tab id');
    yield* runtime.deleteTabRuntime({
      route: '/api/tabs/:id',
      username,
      sessionId: defaultSession.id,
      tabId,
    });
    yield* workspace.deleteTab(username, defaultSession.id, tabId);

    return { success: true };
  });

export const backupWorkspace = (userIdHeader?: string | null) =>
  Effect.gen(function* () {
    const workspace = yield* WorkspaceRepo;
    const runtime = yield* ContainerRuntime;
    const username = yield* requireAuthorizedUsername({ userIdHeader });
    const sessions = yield* workspace.listSessions(username);
    let allSaved = true;

    for (const session of sessions) {
      const saved = yield* runtime.checkpointSession({
        route: '/api/backup',
        username,
        sessionId: session.id,
      });
      if (!saved) {
        allSaved = false;
      }
    }

    if (!allSaved) {
      return yield* Effect.fail(new PersistenceFailure({ message: 'Backup failed' }));
    }

    return { success: true };
  });
