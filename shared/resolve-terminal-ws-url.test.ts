import { describe, expect, it } from 'bun:test';
import { resolveTerminalWebSocketClientUrl } from './resolve-terminal-ws-url';

describe('resolveTerminalWebSocketClientUrl', () => {
  it('prod: same-origin WSS on app host, proxy mode (not API subdomain)', () => {
    const apiOrigin = 'https://cloudshell-api.example.com';
    const { url, mode } = resolveTerminalWebSocketClientUrl({
      dev: false,
      appOrigin: 'https://cloudshell.example.com',
      workerDevOrigin: 'unused',
      ticket: 'a.b',
    });

    expect(mode).toBe('proxy');
    expect(url.startsWith('wss://cloudshell.example.com/ws/terminal?')).toBe(true);
    expect(url).toContain('ticket=a.b');
    expect(url).not.toContain(apiOrigin);
    expect(url).not.toContain('cloudshell-api');
  });

  it('dev: WS URL targets worker dev origin, direct mode', () => {
    const { url, mode } = resolveTerminalWebSocketClientUrl({
      dev: true,
      appOrigin: 'https://unused',
      workerDevOrigin: 'http://localhost:1338',
      ticket: 't',
    });

    expect(mode).toBe('direct');
    expect(url).toBe('ws://localhost:1338/ws/terminal?ticket=t');
  });
});
