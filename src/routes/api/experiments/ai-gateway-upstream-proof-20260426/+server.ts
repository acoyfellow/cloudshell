import { error } from '@sveltejs/kit';
import { proxyWorkerRequest } from '$lib/server/worker';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async (event) => {
  if (!event.locals.user || !event.locals.session) {
    throw error(404);
  }

  return proxyWorkerRequest(event, '/experiments/ai-gateway-upstream-proof-20260426');
};
