import { Effect, Schema } from 'effect';
import { InvalidInput } from './errors';
import { normalizeRequestedTabId, normalizeRequestedWorkspaceId } from '../tabs';

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

export const WorkspaceIdSchema = Schema.String.pipe(
  Schema.pattern(ID_PATTERN),
  Schema.brand('WorkspaceId')
);

export const TabIdSchema = Schema.String.pipe(Schema.pattern(ID_PATTERN), Schema.brand('TabId'));

export const CredentialsBodySchema = Schema.partialWith(
  Schema.Struct({
    username: Schema.String,
    password: Schema.String,
  }),
  { exact: true }
);

export const OptionalNameBodySchema = Schema.partialWith(
  Schema.Struct({
    name: Schema.String,
  }),
  { exact: true }
);

export const SessionPatchBodySchema = Schema.partialWith(
  Schema.Struct({
    name: Schema.String,
    lastActiveTabId: Schema.String,
  }),
  { exact: true }
);

export const PortBodySchema = Schema.Struct({
  port: Schema.Number,
});

function invalidInput(message: string): InvalidInput {
  return new InvalidInput({ message });
}

export function decodeUnknownWithSchema<A, I, R>(
  schema: Schema.Schema<A, I, R>,
  input: unknown,
  message: string
): Effect.Effect<A, InvalidInput, R> {
  return Schema.decodeUnknown(schema)(input).pipe(
    Effect.mapError(() => invalidInput(message))
  );
}

async function readRequestBodyText(request: Request): Promise<string> {
  return request.text();
}

export function decodeJsonBody<A, I, R>(
  request: Request,
  schema: Schema.Schema<A, I, R>,
  message: string,
  options: { allowEmptyObject?: boolean } = {}
): Effect.Effect<A, InvalidInput, R> {
  return Effect.tryPromise({
    try: () => readRequestBodyText(request),
    catch: () => invalidInput(message),
  }).pipe(
    Effect.flatMap((text) => {
      if (text.trim() === '') {
        if (options.allowEmptyObject) {
          return decodeUnknownWithSchema(schema, {}, message);
        }
        return Effect.fail(invalidInput(message));
      }

      return Effect.try({
        try: () => JSON.parse(text) as unknown,
        catch: () => invalidInput(message),
      }).pipe(Effect.flatMap((parsed) => decodeUnknownWithSchema(schema, parsed, message)));
    })
  );
}

export function decodeWorkspaceId(
  value: string | null | undefined,
  message: string
): Effect.Effect<string, InvalidInput> {
  const normalized = normalizeRequestedWorkspaceId(value);
  if (!normalized) {
    return Effect.fail(invalidInput(message));
  }

  return decodeUnknownWithSchema(WorkspaceIdSchema, normalized, message).pipe(
    Effect.map((id) => id as string)
  );
}

export function decodeTabId(
  value: string | null | undefined,
  message: string
): Effect.Effect<string, InvalidInput> {
  const normalized = normalizeRequestedTabId(value);
  if (!normalized) {
    return Effect.fail(invalidInput(message));
  }

  return decodeUnknownWithSchema(TabIdSchema, normalized, message).pipe(
    Effect.map((id) => id as string)
  );
}
