import { resolveTerminalConnection } from '$lib/server/worker';
import { error, json } from '@sveltejs/kit';

import type { RequestHandler } from './$types';

export const GET: RequestHandler = async (event) => {
  const sessionId = event.url.searchParams.get('sessionId')?.trim();
  const tabId = event.url.searchParams.get('tabId')?.trim();

  if (!sessionId || !tabId) {
    throw error(400, 'sessionId and tabId are required');
  }

  const connection = await resolveTerminalConnection(event, sessionId, tabId);
  return json(connection);
};
