import type { RequestHandler } from './$types';
import { proxyHelloWebSocket } from '$lib/server/worker';

export const GET: RequestHandler = async (event) => proxyHelloWebSocket(event);
