import type { Session, SessionPort, Tab } from './types';

export const DEFAULT_SESSION_ID = 'main';
export const DEFAULT_TAB_ID = 'main';

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

interface WorkspaceKVNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

type LegacyTabRecord = Tab & { sessionId?: string };

function sessionsKey(username: string): string {
  return `sessions:${username}`;
}

function sessionTabsKey(username: string, sessionId: string): string {
  return `tabs:${username}:${sessionId}`;
}

function sessionPortsKey(username: string, sessionId: string): string {
  return `ports:${username}:${sessionId}`;
}

function legacyTabsKey(username: string): string {
  return `tabs:${username}`;
}

export function isValidWorkspaceId(value: string | null | undefined): value is string {
  return typeof value === 'string' && ID_PATTERN.test(value);
}

export function normalizeRequestedWorkspaceId(value: string | null | undefined): string | null {
  if (value == null) {
    return DEFAULT_SESSION_ID;
  }

  const trimmed = value.trim();
  if (trimmed === '') {
    return DEFAULT_SESSION_ID;
  }

  return isValidWorkspaceId(trimmed) ? trimmed : null;
}

export function normalizeRequestedTabId(value: string | null | undefined): string | null {
  if (value == null) {
    return DEFAULT_TAB_ID;
  }

  const trimmed = value.trim();
  if (trimmed === '') {
    return DEFAULT_TAB_ID;
  }

  return isValidWorkspaceId(trimmed) ? trimmed : null;
}

export function getDefaultSessionName(existingCount: number): string {
  return existingCount === 0 ? 'session' : `session-${existingCount}`;
}

export function getDefaultTabName(existingCount: number): string {
  return existingCount === 0 ? 'shell' : `shell-${existingCount}`;
}

function parseJsonArray(serialized: string | null): unknown[] {
  if (!serialized) {
    return [];
  }

  try {
    const parsed = JSON.parse(serialized) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function parseStoredTabs(serialized: string | null): Tab[] {
  const parsed = parseJsonArray(serialized);
  const tabs: Tab[] = [];

  parsed.forEach((candidate, index) => {
    if (!candidate || typeof candidate !== 'object') {
      return;
    }

    const record = candidate as Partial<Record<keyof LegacyTabRecord, unknown>>;
    const id = normalizeRequestedTabId(typeof record.id === 'string' ? record.id : null);
    if (!id) {
      return;
    }

    const name =
      typeof record.name === 'string' && record.name.trim() !== ''
        ? record.name.trim()
        : getDefaultTabName(index);
    const createdAt =
      typeof record.createdAt === 'number' && Number.isFinite(record.createdAt)
        ? record.createdAt
        : 0;

    tabs.push({ id, name, createdAt });
  });

  return tabs;
}

export function parseStoredSessions(serialized: string | null): Session[] {
  const parsed = parseJsonArray(serialized);
  const sessions: Session[] = [];

  parsed.forEach((candidate, index) => {
    if (!candidate || typeof candidate !== 'object') {
      return;
    }

    const record = candidate as Partial<Record<keyof Session, unknown>>;
    const id = normalizeRequestedWorkspaceId(typeof record.id === 'string' ? record.id : null);
    const rawLastActiveTabId =
      typeof record.lastActiveTabId === 'string' ? record.lastActiveTabId.trim() : '';
    const lastActiveTabId =
      rawLastActiveTabId === '' ? '' : normalizeRequestedTabId(rawLastActiveTabId);
    if (!id || lastActiveTabId == null) {
      return;
    }

    const name =
      typeof record.name === 'string' && record.name.trim() !== ''
        ? record.name.trim()
        : getDefaultSessionName(index);
    const createdAt =
      typeof record.createdAt === 'number' && Number.isFinite(record.createdAt)
        ? record.createdAt
        : 0;
    const lastOpenedAt =
      typeof record.lastOpenedAt === 'number' && Number.isFinite(record.lastOpenedAt)
        ? record.lastOpenedAt
        : createdAt;

    sessions.push({
      id,
      name,
      createdAt,
      lastActiveTabId,
      lastOpenedAt,
    });
  });

  return sessions;
}

export function parseStoredPorts(serialized: string | null): SessionPort[] {
  const parsed = parseJsonArray(serialized);
  const ports: SessionPort[] = [];

  parsed.forEach((candidate) => {
    if (!candidate || typeof candidate !== 'object') {
      return;
    }

    const record = candidate as Partial<Record<keyof SessionPort, unknown>>;
    if (
      typeof record.port !== 'number' ||
      !Number.isInteger(record.port) ||
      typeof record.url !== 'string'
    ) {
      return;
    }

    const createdAt =
      typeof record.createdAt === 'number' && Number.isFinite(record.createdAt)
        ? record.createdAt
        : 0;

    ports.push({
      port: record.port,
      url: record.url,
      createdAt,
    });
  });

  return ports;
}

export async function getStoredSessions(
  kv: WorkspaceKVNamespace,
  username: string
): Promise<Session[]> {
  return parseStoredSessions(await kv.get(sessionsKey(username)));
}

export async function putStoredSessions(
  kv: WorkspaceKVNamespace,
  username: string,
  sessions: Session[]
): Promise<void> {
  await kv.put(sessionsKey(username), JSON.stringify(sessions));
}

export async function getStoredTabs(
  kv: WorkspaceKVNamespace,
  username: string,
  sessionId: string
): Promise<Tab[]> {
  return parseStoredTabs(await kv.get(sessionTabsKey(username, sessionId)));
}

export async function putStoredTabs(
  kv: WorkspaceKVNamespace,
  username: string,
  sessionId: string,
  tabs: Tab[]
): Promise<void> {
  await kv.put(sessionTabsKey(username, sessionId), JSON.stringify(tabs));
}

export async function deleteStoredTabs(
  kv: WorkspaceKVNamespace,
  username: string,
  sessionId: string
): Promise<void> {
  await kv.delete(sessionTabsKey(username, sessionId));
}

export async function getStoredPorts(
  kv: WorkspaceKVNamespace,
  username: string,
  sessionId: string
): Promise<SessionPort[]> {
  return parseStoredPorts(await kv.get(sessionPortsKey(username, sessionId)));
}

export async function putStoredPorts(
  kv: WorkspaceKVNamespace,
  username: string,
  sessionId: string,
  ports: SessionPort[]
): Promise<void> {
  await kv.put(sessionPortsKey(username, sessionId), JSON.stringify(ports));
}

export async function deleteStoredPorts(
  kv: WorkspaceKVNamespace,
  username: string,
  sessionId: string
): Promise<void> {
  await kv.delete(sessionPortsKey(username, sessionId));
}

export function createStoredSession(
  existingSessions: Session[],
  name?: string,
  generateId: () => string = () => crypto.randomUUID(),
  now: () => number = () => Date.now()
): Session {
  const id = existingSessions.length === 0 ? DEFAULT_SESSION_ID : generateId();
  const normalizedId = normalizeRequestedWorkspaceId(id);
  if (!normalizedId) {
    throw new Error('Generated an invalid session ID');
  }

  const trimmedName = name?.trim();
  const createdAt = now();

  return {
    id: normalizedId,
    name:
      trimmedName && trimmedName !== ''
        ? trimmedName
        : getDefaultSessionName(existingSessions.length),
    createdAt,
    lastActiveTabId: DEFAULT_TAB_ID,
    lastOpenedAt: createdAt,
  };
}

export function createStoredTab(
  existingTabs: Tab[],
  name?: string,
  generateId: () => string = () => crypto.randomUUID(),
  now: () => number = () => Date.now()
): Tab {
  const id = existingTabs.length === 0 ? DEFAULT_TAB_ID : generateId();
  const normalizedId = normalizeRequestedTabId(id);
  if (!normalizedId) {
    throw new Error('Generated an invalid tab ID');
  }

  const trimmedName = name?.trim();

  return {
    id: normalizedId,
    name: trimmedName && trimmedName !== '' ? trimmedName : getDefaultTabName(existingTabs.length),
    createdAt: now(),
  };
}

export function updateSessionRecord(
  sessions: Session[],
  sessionId: string,
  updates: Partial<Pick<Session, 'name' | 'lastActiveTabId' | 'lastOpenedAt'>>
): Session[] {
  return sessions.map((session) =>
    session.id === sessionId
      ? {
          ...session,
          ...updates,
        }
      : session
  );
}

export function getSessionIdsForBackup(sessions: Session[]): string[] {
  return sessions.map((session) => session.id);
}

export function resolveSession(
  sessions: Session[],
  requestedSessionId: string | null | undefined
): Session | null {
  const normalizedRequested = normalizeRequestedWorkspaceId(requestedSessionId);
  if (!normalizedRequested) {
    return null;
  }

  return (
    sessions.find((session) => session.id === normalizedRequested) ||
    sessions.find((session) => session.id === DEFAULT_SESSION_ID) ||
    sessions[0] ||
    null
  );
}

export function resolveTab(
  session: Session,
  tabs: Tab[],
  requestedTabId: string | null | undefined
): Tab | null {
  if (tabs.length === 0) {
    return null;
  }

  const trimmedRequested = typeof requestedTabId === 'string' ? requestedTabId.trim() : '';
  if (trimmedRequested !== '') {
    const normalizedRequested = normalizeRequestedTabId(trimmedRequested);
    if (!normalizedRequested) {
      return tabs.find((tab) => tab.id === session.lastActiveTabId) || tabs[0];
    }

    const requestedTab = tabs.find((tab) => tab.id === normalizedRequested);
    if (requestedTab) {
      return requestedTab;
    }
  }

  return tabs.find((tab) => tab.id === session.lastActiveTabId) || tabs[0];
}

export async function loadWorkspaceSessions(
  kv: WorkspaceKVNamespace,
  username: string
): Promise<Session[]> {
  let sessions = await getStoredSessions(kv, username);

  if (sessions.length === 0) {
    const legacyTabs = parseStoredTabs(await kv.get(legacyTabsKey(username)));

    if (legacyTabs.length > 0) {
      const primaryTab = legacyTabs.find((tab) => tab.id === DEFAULT_TAB_ID) ?? legacyTabs[0];
      const migratedSession: Session = {
        id: DEFAULT_SESSION_ID,
        name: getDefaultSessionName(0),
        createdAt: primaryTab.createdAt || Date.now(),
        lastActiveTabId: primaryTab.id,
        lastOpenedAt: Date.now(),
      };

      sessions = [migratedSession];
      await putStoredSessions(kv, username, sessions);
      await putStoredTabs(kv, username, migratedSession.id, legacyTabs);
      await kv.delete(legacyTabsKey(username));
      return sessions;
    }

    return [];
  }

  let sessionsChanged = false;

  for (const session of sessions) {
    let tabs = await getStoredTabs(kv, username, session.id);

    if (tabs.length === 0) {
      if (session.lastActiveTabId !== '') {
        session.lastActiveTabId = '';
        sessionsChanged = true;
      }
      continue;
    }

    if (!tabs.some((tab) => tab.id === session.lastActiveTabId)) {
      session.lastActiveTabId = tabs[0].id;
      sessionsChanged = true;
    }
  }

  if (sessionsChanged) {
    await putStoredSessions(kv, username, sessions);
  }

  return sessions;
}

export function isContainerActiveStatus(status: string): boolean {
  return status === 'running' || status === 'healthy';
}
