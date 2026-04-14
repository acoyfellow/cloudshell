import type { RequestHandler } from './$types';
import { proxyTerminalProbeWebSocket } from '$lib/server/worker';

export const GET: RequestHandler = async (event) => proxyTerminalProbeWebSocket(event);
