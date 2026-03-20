import { SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

describe('worker health', () => {
  it('returns ok', async () => {
    const response = await SELF.fetch('https://example.com/health');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: 'ok' });
  });
});
