/** Pure URL builder for the browser terminal WebSocket (no Svelte / Workers imports). */

export function resolveTerminalWebSocketClientUrl(input: {
  readonly dev: boolean;
  readonly appOrigin: string;
  readonly workerDevOrigin: string;
  readonly ticket: string;
}): { readonly url: string; readonly mode: 'proxy' | 'direct' } {
  if (input.dev) {
    const url = new URL('/ws/terminal', input.workerDevOrigin);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.searchParams.set('ticket', input.ticket);
    return { url: url.toString(), mode: 'direct' };
  }

  const url = new URL('/ws/terminal', input.appOrigin);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.searchParams.set('ticket', input.ticket);
  return { url: url.toString(), mode: 'proxy' };
}
