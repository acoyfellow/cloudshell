import type { Context } from 'hono';
import { Effect, ManagedRuntime } from 'effect';
import type { Env } from '../types';
import {
  AppError,
  getErrorMessage,
  getErrorStatus,
  InvalidInput,
  isAppError,
  UnexpectedFailure,
} from './errors';
import { makeRequestLayer } from './services';

type WorkerContext = Context<{ Bindings: Env }>;
type RequestServices =
  | import('./services').WorkerEnv
  | import('./services').AuthService
  | import('./services').UserRepo
  | import('./services').WorkspaceRepo
  | import('./services').ContainerRuntime;

export async function runRequestEffect<A>(
  env: Env,
  effect: Effect.Effect<A, AppError, RequestServices>
): Promise<A> {
  const runtime = ManagedRuntime.make(makeRequestLayer(env));

  try {
    return await runtime.runPromise(effect);
  } finally {
    await runtime.dispose();
  }
}

export function toRouteErrorResponse(c: WorkerContext, error: unknown): Response {
  const appError = isAppError(error)
    ? error
    : new UnexpectedFailure({
        message: 'Internal server error',
        cause: error,
      });
  const status = getErrorStatus(appError);
  const message = getErrorMessage(appError);

  if (appError instanceof InvalidInput && appError.format === 'text') {
    return new Response(message, {
      status,
      headers: { 'Content-Type': 'text/plain; charset=UTF-8' },
    });
  }

  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json; charset=UTF-8' },
  });
}

export async function runRouteEffect<A>(
  c: WorkerContext,
  effect: Effect.Effect<A, AppError, RequestServices>,
  onSuccess: (value: A) => Response
): Promise<Response> {
  try {
    const value = await runRequestEffect(c.env, effect);
    return onSuccess(value);
  } catch (error) {
    return toRouteErrorResponse(c, error);
  }
}

export async function runJsonRoute<A>(
  c: WorkerContext,
  effect: Effect.Effect<A, AppError, RequestServices>,
  status: 200 | 201 = 200
): Promise<Response> {
  return runRouteEffect(c, effect, (value) => c.json(value, status));
}
