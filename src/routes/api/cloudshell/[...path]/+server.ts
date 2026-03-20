import type { RequestHandler } from './$types';
import { proxyWorkerRequest } from '$lib/server/worker';

const handleProxy: RequestHandler = async (event) => {
  const path = event.params.path;
  if (!path) {
    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return proxyWorkerRequest(event, `/api/${path}`);
};

export const GET = handleProxy;
export const POST = handleProxy;
export const PATCH = handleProxy;
export const DELETE = handleProxy;
