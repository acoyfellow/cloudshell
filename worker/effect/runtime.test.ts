import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import {
  Conflict,
  ContainerUnavailable,
  InvalidInput,
  NotFound,
  PersistenceFailure,
  Unauthorized,
  UnexpectedFailure,
} from './errors';
import { toRouteErrorResponse } from './runtime';

function errorResponse(error: unknown) {
  const app = new Hono();
  app.get('/', (c) => toRouteErrorResponse(c as never, error));
  return app.request('http://localhost/');
}

describe('route error mapping', () => {
  it('maps unauthorized errors to 401 JSON', async () => {
    const response = await errorResponse(new Unauthorized({ message: 'Authentication required' }));
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Authentication required' });
  });

  it('maps invalid input errors to text or JSON depending on format', async () => {
    const textResponse = await errorResponse(
      new InvalidInput({ message: 'expected websocket', status: 426, format: 'text' })
    );
    expect(textResponse.status).toBe(426);
    await expect(textResponse.text()).resolves.toBe('expected websocket');

    const jsonResponse = await errorResponse(new InvalidInput({ message: 'Invalid request' }));
    expect(jsonResponse.status).toBe(400);
    await expect(jsonResponse.json()).resolves.toEqual({ error: 'Invalid request' });
  });

  it('maps not found, conflict, and container unavailable errors', async () => {
    expect((await errorResponse(new NotFound({ message: 'Session not found' }))).status).toBe(404);
    expect((await errorResponse(new Conflict({ message: 'User already exists' }))).status).toBe(
      409
    );
    expect(
      (
        await errorResponse(
          new ContainerUnavailable({
            message: 'Container error, please retry in a moment.',
            retryable: false,
          })
        )
      ).status
    ).toBe(503);
  });

  it('maps persistence and unexpected failures to 500 JSON', async () => {
    const persistence = await errorResponse(new PersistenceFailure({ message: 'Backup failed' }));
    expect(persistence.status).toBe(500);
    await expect(persistence.json()).resolves.toEqual({ error: 'Backup failed' });

    const unexpected = await errorResponse(new UnexpectedFailure({ message: 'Internal server error' }));
    expect(unexpected.status).toBe(500);
    await expect(unexpected.json()).resolves.toEqual({ error: 'Internal server error' });
  });
});
