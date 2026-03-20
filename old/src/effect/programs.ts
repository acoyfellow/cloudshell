import { Effect } from 'effect';
import { Conflict, InvalidInput, PersistenceFailure, Unauthorized } from './errors';
import {
  CredentialsBodySchema,
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
  UserRepo,
  WorkspaceRepo,
} from './services';

function requireNonEmptyCredential(
  value: string | undefined,
  message: string
): Effect.Effect<string, InvalidInput> {
  return value ? Effect.succeed(value) : Effect.fail(new InvalidInput({ message }));
}

export const requireAuthorizedUsername = (input: {
  readonly authorizationHeader?: string;
  readonly queryToken?: string | null;
}) =>
  Effect.gen(function* () {
    const auth = yield* AuthService;
    return yield* auth.requireUsername(input);
  });

export const login = (request: Request) =>
  Effect.gen(function* () {
    const auth = yield* AuthService;
    const users = yield* UserRepo;
    const body = yield* decodeJsonBody(request, CredentialsBodySchema, 'Invalid request');
    const username = yield* requireNonEmptyCredential(
      body.username,
      'Username and password required'
    );
    const password = yield* requireNonEmptyCredential(
      body.password,
      'Username and password required'
    );
    const user = yield* users.getUser(username);

    if (!user) {
      return yield* Effect.fail(new Unauthorized({ message: 'Invalid credentials' }));
    }

    const isValid = yield* auth.verifyPasswordHash(password, user.passwordHash);
    if (!isValid) {
      return yield* Effect.fail(new Unauthorized({ message: 'Invalid credentials' }));
    }

    return yield* auth.issueToken(username);
  });

export const register = (request: Request) =>
  Effect.gen(function* () {
    const auth = yield* AuthService;
    const users = yield* UserRepo;
    const body = yield* decodeJsonBody(request, CredentialsBodySchema, 'Invalid request');
    const username = yield* requireNonEmptyCredential(
      body.username,
      'Username and password required'
    );
    const password = yield* requireNonEmptyCredential(
      body.password,
      'Username and password required'
    );
    const existing = yield* users.getUser(username);

    if (existing) {
      return yield* Effect.fail(new Conflict({ message: 'User already exists' }));
    }

    const passwordHash = yield* auth.createPasswordHash(password);
    yield* users.createUser({
      username,
      passwordHash,
      createdAt: Date.now(),
    });

    return { message: 'User created successfully' };
  });

export const connectTerminal = (input: {
  readonly request: Request;
  readonly upgrade?: string;
  readonly authorizationHeader?: string;
  readonly queryToken?: string | null;
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
    const username = yield* auth.requireUsername({
      authorizationHeader: input.authorizationHeader,
      queryToken: input.queryToken,
    });
    const requestedSessionId = yield* decodeWorkspaceId(
      input.requestedSessionId,
      'Invalid sessionId'
    );
    const requestedTabId = yield* decodeTabId(input.requestedTabId, 'Invalid tabId');
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

export const listSessions = (authorizationHeader?: string) =>
  Effect.gen(function* () {
    const workspace = yield* WorkspaceRepo;
    const username = yield* requireAuthorizedUsername({ authorizationHeader });
    return { sessions: yield* workspace.listSessions(username) };
  });

export const createSession = (request: Request, authorizationHeader?: string) =>
  Effect.gen(function* () {
    const workspace = yield* WorkspaceRepo;
    const username = yield* requireAuthorizedUsername({ authorizationHeader });
    const body = yield* decodeJsonBody(request, OptionalNameBodySchema, 'Invalid request', {
      allowEmptyObject: true,
    });
    const created = yield* workspace.createSession(username, body.name);
    return { session: created.session, tab: created.tab };
  });

export const updateSession = (
  request: Request,
  authorizationHeader: string | undefined,
  sessionIdParam: string
) =>
  Effect.gen(function* () {
    const workspace = yield* WorkspaceRepo;
    const username = yield* requireAuthorizedUsername({ authorizationHeader });
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

export const deleteSession = (authorizationHeader: string | undefined, sessionIdParam: string) =>
  Effect.gen(function* () {
    const workspace = yield* WorkspaceRepo;
    const runtime = yield* ContainerRuntime;
    const username = yield* requireAuthorizedUsername({ authorizationHeader });
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
  authorizationHeader: string | undefined,
  sessionIdParam: string
) =>
  Effect.gen(function* () {
    const workspace = yield* WorkspaceRepo;
    const runtime = yield* ContainerRuntime;
    const username = yield* requireAuthorizedUsername({ authorizationHeader });
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

export const listTabs = (authorizationHeader: string | undefined, sessionIdParam: string) =>
  Effect.gen(function* () {
    const workspace = yield* WorkspaceRepo;
    const username = yield* requireAuthorizedUsername({ authorizationHeader });
    const sessionId = yield* decodeWorkspaceId(sessionIdParam, 'Invalid session id');

    return { tabs: yield* workspace.listTabs(username, sessionId) };
  });

export const createTab = (
  request: Request,
  authorizationHeader: string | undefined,
  sessionIdParam: string
) =>
  Effect.gen(function* () {
    const workspace = yield* WorkspaceRepo;
    const username = yield* requireAuthorizedUsername({ authorizationHeader });
    const sessionId = yield* decodeWorkspaceId(sessionIdParam, 'Invalid session id');
    const body = yield* decodeJsonBody(request, OptionalNameBodySchema, 'Invalid request', {
      allowEmptyObject: true,
    });

    return { tab: yield* workspace.createTab(username, sessionId, body.name) };
  });

export const deleteTab = (
  authorizationHeader: string | undefined,
  sessionIdParam: string,
  tabIdParam: string
) =>
  Effect.gen(function* () {
    const workspace = yield* WorkspaceRepo;
    const runtime = yield* ContainerRuntime;
    const username = yield* requireAuthorizedUsername({ authorizationHeader });
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

export const listPorts = (authorizationHeader: string | undefined, sessionIdParam: string) =>
  Effect.gen(function* () {
    const workspace = yield* WorkspaceRepo;
    const username = yield* requireAuthorizedUsername({ authorizationHeader });
    const sessionId = yield* decodeWorkspaceId(sessionIdParam, 'Invalid session id');

    return { ports: yield* workspace.listPorts(username, sessionId) };
  });

export const forwardPort = (
  request: Request,
  authorizationHeader: string | undefined,
  sessionIdParam: string
) =>
  Effect.gen(function* () {
    const workspace = yield* WorkspaceRepo;
    const username = yield* requireAuthorizedUsername({ authorizationHeader });
    const sessionId = yield* decodeWorkspaceId(sessionIdParam, 'Invalid session id');
    const body = yield* decodeJsonBody(request, PortBodySchema, 'Invalid request');

    return yield* workspace.forwardPort(username, sessionId, body.port);
  });

export const listLegacyPorts = (authorizationHeader?: string) =>
  Effect.gen(function* () {
    const workspace = yield* WorkspaceRepo;
    const username = yield* requireAuthorizedUsername({ authorizationHeader });
    const defaultSession = yield* workspace.getDefaultSession(username);

    if (!defaultSession) {
      return { ports: [] };
    }

    return { ports: yield* workspace.listPorts(username, defaultSession.id) };
  });

export const forwardLegacyPort = (request: Request, authorizationHeader?: string) =>
  Effect.gen(function* () {
    const workspace = yield* WorkspaceRepo;
    const username = yield* requireAuthorizedUsername({ authorizationHeader });
    const defaultSession = yield* workspace.getDefaultSession(username);

    if (!defaultSession) {
      return yield* Effect.fail(
        new PersistenceFailure({ message: 'No default session available' })
      );
    }

    const body = yield* decodeJsonBody(request, PortBodySchema, 'Invalid request');
    return yield* workspace.forwardPort(username, defaultSession.id, body.port);
  });

export const listLegacyTabs = (authorizationHeader?: string) =>
  Effect.gen(function* () {
    const workspace = yield* WorkspaceRepo;
    const username = yield* requireAuthorizedUsername({ authorizationHeader });
    const defaultSession = yield* workspace.getDefaultSession(username);

    if (!defaultSession) {
      return { tabs: [] };
    }

    return { tabs: yield* workspace.listTabs(username, defaultSession.id) };
  });

export const createLegacyTab = (request: Request, authorizationHeader?: string) =>
  Effect.gen(function* () {
    const workspace = yield* WorkspaceRepo;
    const username = yield* requireAuthorizedUsername({ authorizationHeader });
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

export const deleteLegacyTab = (authorizationHeader: string | undefined, tabIdParam: string) =>
  Effect.gen(function* () {
    const workspace = yield* WorkspaceRepo;
    const runtime = yield* ContainerRuntime;
    const username = yield* requireAuthorizedUsername({ authorizationHeader });
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

export const backupWorkspace = (authorizationHeader?: string) =>
  Effect.gen(function* () {
    const workspace = yield* WorkspaceRepo;
    const runtime = yield* ContainerRuntime;
    const username = yield* requireAuthorizedUsername({ authorizationHeader });
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
