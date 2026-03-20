import type { RequestHandler } from './$types';
import { proxyWorkerRequest } from '$lib/server/worker';

export const GET: RequestHandler = async (event) =>
  proxyWorkerRequest(event, `/api/share/${event.params.token}`, { publicRoute: true });
