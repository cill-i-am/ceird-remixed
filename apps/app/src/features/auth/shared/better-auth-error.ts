import * as Schema from "effect/Schema";

const BetterAuthClientErrorSchema = Schema.Struct({
  message: Schema.optionalKey(Schema.String),
});

const parseBetterAuthClientError = Schema.decodeUnknownSync(
  BetterAuthClientErrorSchema,
);

export function betterAuthErrorMessage(
  error: unknown,
  fallbackMessage: string,
): string {
  try {
    return parseBetterAuthClientError(error).message ?? fallbackMessage;
  } catch {
    return fallbackMessage;
  }
}
