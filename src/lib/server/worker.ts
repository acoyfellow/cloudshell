import { dev } from '$app/environment';
import { error, type RequestEvent } from '@sveltejs/kit';
import { resolveTerminalWebSocketClientUrl } from '../../../shared/resolve-terminal-ws-url';
import { createTerminalTicket } from '../../../shared/terminal-ticket';

const DEFAULT_DEV_WORKER_ORIGIN = 'http://localhost:1338';
const PROD_WORKER_ORIGIN = 'http://worker';

function getWorkerOrigin(event?: RequestEvent) {
  if (dev) {
    return (
      event?.platform?.env?.WORKER_DEV_ORIGIN ||
      process.env.WORKER_DEV_ORIGIN ||
      DEFAULT_DEV_WORKER_ORIGIN
    );
  }

  return PROD_WORKER_ORIGIN;
}

function buildWorkerUrl(event: RequestEvent, path: string) {
  const url = new URL(path, getWorkerOrigin(event));
  url.search = event.url.search;
  return url.toString();
}

function getAuthenticatedIdentity(event: RequestEvent) {
  const user = event.locals.user;
  const session = event.locals.session;

  if (!user || !session) {
    throw error(401, 'Authentication required');
  }

  return {
    userId: user.id,
    userEmail: user.email,
  };
}

async function fetchWorker(event: RequestEvent, request: Request) {
  if (dev) {
    return fetch(request);
  }

  const worker = event.platform?.env?.WORKER;
  if (!worker) {
    throw error(500, 'Worker binding not available');
  }

  return worker.fetch(request);
}

export async function proxyWorkerRequest(
  event: RequestEvent,
  path: string,
  options: { publicRoute?: boolean } = {}
) {
  const headers = new Headers(event.request.headers);
  headers.delete('cookie');
  headers.delete('host');
  headers.delete('content-length');

  if (!options.publicRoute) {
    const identity = getAuthenticatedIdentity(event);
    headers.set('X-User-Id', identity.userId);
    headers.set('X-User-Email', identity.userEmail);
  }

  const init: RequestInit = {
    method: event.request.method,
    headers,
  };

  if (event.request.method !== 'GET' && event.request.method !== 'HEAD') {
    init.body = await event.request.arrayBuffer();
  }

  const upstream = new Request(buildWorkerUrl(event, path), init);
  return fetchWorker(event, upstream);
}

export async function proxyTerminalWebSocket(event: RequestEvent) {
  const identity = getAuthenticatedIdentity(event);
  const headers = new Headers(event.request.headers);
  headers.set('X-User-Id', identity.userId);
  headers.set('X-User-Email', identity.userEmail);
  headers.delete('cookie');
  headers.delete('host');

  const upstream = new Request(buildWorkerUrl(event, '/ws/terminal'), {
    method: event.request.method,
    headers,
  });

  return fetchWorker(event, upstream);
}

export async function resolveTerminalConnection(
  event: RequestEvent,
  sessionId: string,
  tabId: string
): Promise<{ url: string; mode: 'proxy' | 'direct' }> {
  const identity = getAuthenticatedIdentity(event);
  const secret =
    event.platform?.env?.TERMINAL_TICKET_SECRET || event.platform?.env?.BETTER_AUTH_SECRET;

  if (!secret) {
    throw error(500, 'Terminal ticket secret is not configured');
  }

  const ticket = await createTerminalTicket(
    {
      userId: identity.userId,
      userEmail: identity.userEmail,
      sessionId,
      tabId,
      exp: Date.now() + 60_000,
    },
    secret
  );

  return resolveTerminalWebSocketClientUrl({
    dev,
    appOrigin: event.url.origin,
    workerDevOrigin: getWorkerOrigin(event),
    ticket,
  });
}
