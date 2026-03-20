import { Data } from 'effect';

export class Unauthorized extends Data.TaggedError('Unauthorized')<{
  readonly message: string;
}> {}

export class InvalidInput extends Data.TaggedError('InvalidInput')<{
  readonly message: string;
  readonly status?: number;
  readonly format?: 'json' | 'text';
}> {}

export class NotFound extends Data.TaggedError('NotFound')<{
  readonly message: string;
}> {}

export class Conflict extends Data.TaggedError('Conflict')<{
  readonly message: string;
}> {}

export class ContainerUnavailable extends Data.TaggedError('ContainerUnavailable')<{
  readonly message: string;
  readonly retryable: boolean;
}> {}

export class PersistenceFailure extends Data.TaggedError('PersistenceFailure')<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export class UnexpectedFailure extends Data.TaggedError('UnexpectedFailure')<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export type AppError =
  | Unauthorized
  | InvalidInput
  | NotFound
  | Conflict
  | ContainerUnavailable
  | PersistenceFailure
  | UnexpectedFailure;

export function isAppError(error: unknown): error is AppError {
  return (
    error instanceof Unauthorized ||
    error instanceof InvalidInput ||
    error instanceof NotFound ||
    error instanceof Conflict ||
    error instanceof ContainerUnavailable ||
    error instanceof PersistenceFailure ||
    error instanceof UnexpectedFailure
  );
}

export function getErrorStatus(error: AppError): number {
  switch (error._tag) {
    case 'Unauthorized':
      return 401;
    case 'InvalidInput':
      return error.status ?? 400;
    case 'NotFound':
      return 404;
    case 'Conflict':
      return 409;
    case 'ContainerUnavailable':
      return 503;
    case 'PersistenceFailure':
    case 'UnexpectedFailure':
      return 500;
  }
}

export function getErrorMessage(error: AppError): string {
  return error.message;
}
