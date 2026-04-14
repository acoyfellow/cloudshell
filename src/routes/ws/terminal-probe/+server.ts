import type { RequestHandler } from './$types';
import { proxyMinimalWebSocket } from '$lib/server/worker';

export const GET: RequestHandler = async (event) => proxyMinimalWebSocket(event);
