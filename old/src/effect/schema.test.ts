import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';
import {
  CredentialsBodySchema,
  decodeJsonBody,
  decodeTabId,
  decodeWorkspaceId,
  OptionalNameBodySchema,
} from './schema';

describe('effect schema helpers', () => {
  it('defaults missing workspace and tab ids to main', async () => {
    await expect(
      Effect.runPromise(decodeWorkspaceId(undefined, 'Invalid session id'))
    ).resolves.toBe('main');
    await expect(Effect.runPromise(decodeTabId(undefined, 'Invalid tab id'))).resolves.toBe(
      'main'
    );
  });

  it('rejects invalid ids', async () => {
    await expect(
      Effect.runPromise(decodeWorkspaceId('bad id', 'Invalid session id'))
    ).rejects.toThrow('Invalid session id');
  });

  it('decodes JSON bodies and supports empty optional objects', async () => {
    const credentials = await Effect.runPromise(
      decodeJsonBody(
        new Request('http://localhost/login', {
          method: 'POST',
          body: JSON.stringify({ username: 'alice', password: 'secret' }),
        }),
        CredentialsBodySchema,
        'Invalid request'
      )
    );
    const optional = await Effect.runPromise(
      decodeJsonBody(
        new Request('http://localhost/session', {
          method: 'POST',
          body: '',
        }),
        OptionalNameBodySchema,
        'Invalid request',
        { allowEmptyObject: true }
      )
    );

    expect(credentials).toEqual({ username: 'alice', password: 'secret' });
    expect(optional).toEqual({});
  });
});
