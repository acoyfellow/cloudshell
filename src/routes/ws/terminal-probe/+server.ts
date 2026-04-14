import type { RequestHandler } from './$types';
import { proxyTerminalWebSocket } from '$lib/server/worker';

export const GET: RequestHandler = async (event) => proxyTerminalWebSocket(event);
