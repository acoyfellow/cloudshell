import type { Context, ExecutionContext } from 'hono';
import { Cause, Exit, ManagedRuntime, type Effect } from 'effect';
import type { Env } from '../types';
import {
  getErrorMessage,
  getErrorStatus,
  InvalidInput,
  isAppError,
  UnexpectedFailure,
} from './errors';
import type { AppError } from './errors';
import { makeRequestLayer } from './services';

type WorkerContext = Context<{ Bindings: Env }>;
type RequestServices =
  | import('./services').WorkerEnv
  | import('./services').AuthService
  | import('./services').WorkspaceRepo
  | import('./services').ContainerRuntime;

function isWebSocketUpgradeResponse(value: unknown): boolean {
  if (!(value instanceof Response)) {
    return false;
  }
  if (value.status === 101) {
    return true;
  }
  return (value as { webSocket?: unknown }).webSocket != null;
}

/** Effect.runPromise rejects with wrappers; squash to the real tagged error for HTTP mapping. */
function normalizeRouteError(error: unknown): unknown {
  if (isAppError(error)) {
    return error;
  }
  if (Cause.isCause(error)) {
    return Cause.squash(error);
  }
  if (error instanceof Error && error.cause !== undefined) {
    const inner = error.cause;
    if (Cause.isCause(inner)) {
      return Cause.squash(inner);
    }
    if (isAppError(inner)) {
      return inner;
    }
  }
  return error;
}

export async function runRequestEffect<A>(
  env: Env,
  effect: Effect.Effect<A, AppError, RequestServices>,
  options?: { executionCtx?: ExecutionContext }
): Promise<A> {
  const runtime = ManagedRuntime.make(makeRequestLayer(env));
  const exit = await runtime.runPromiseExit(effect);

  if (Exit.isFailure(exit)) {
    await runtime.dispose();
    throw Cause.squash(exit.cause);
  }

  const value: A = exit.value as A;

  if (isWebSocketUpgradeResponse(value) && options?.executionCtx) {
    options.executionCtx.waitUntil(runtime.dispose());
    return value;
  }

  await runtime.dispose();
  return value;
}

export function toRouteErrorResponse(c: WorkerContext, error: unknown): Response {
  const normalized = normalizeRouteError(error);
  const appError = isAppError(normalized)
    ? normalized
    : new UnexpectedFailure({
        message: 'Internal server error',
        cause: normalized,
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

function tryGetExecutionCtx(c: WorkerContext): ExecutionContext | undefined {
  try {
    return c.executionCtx;
  } catch {
    return undefined;
  }
}

export async function runRouteEffect<A>(
  c: WorkerContext,
  effect: Effect.Effect<A, AppError, RequestServices>,
  onSuccess: (value: A) => Response
): Promise<Response> {
  try {
    const value = await runRequestEffect(c.env, effect, {
      executionCtx: tryGetExecutionCtx(c),
    });
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
