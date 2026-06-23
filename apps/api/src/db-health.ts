import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import { DbHealthResponse } from "@ceird/api-contract";

/** Expected failure while checking API database connectivity. */
export class DbHealthCheckFailed extends Schema.TaggedErrorClass<DbHealthCheckFailed>()(
  "DbHealthCheckFailed",
  {
    operation: Schema.Literal("query"),
    message: Schema.String,
    cause: Schema.Defect(),
  },
) {}

/** API database health capability backed by the Hyperdrive binding. */
export class DbHealth extends Context.Service<
  DbHealth,
  {
    readonly check: () => Effect.Effect<
      DbHealthResponse,
      DbHealthCheckFailed
    >;
  }
>()("ceird/DbHealth") {}

export type HealthProbeRow = {
  readonly ok: number;
};

export const makeDbHealthLive = (options: {
  readonly queryHealth: () => Promise<ReadonlyArray<HealthProbeRow>>;
  readonly timeoutMillis?: number;
}) =>
  Layer.succeed(DbHealth)({
    check: Effect.fn("DbHealth.check")(function* () {
      const rows = yield* Effect.tryPromise({
        try: () =>
          withTimeout(
            options.queryHealth(),
            options.timeoutMillis ?? 3_000,
          ),
        catch: (cause) =>
          DbHealthCheckFailed.make({
            operation: "query",
            message: cause instanceof Error ? cause.message : String(cause),
            cause,
          }),
      });

      if (rows[0]?.ok !== 1) {
        return yield* Effect.fail(
          DbHealthCheckFailed.make({
            operation: "query",
            message: "Unexpected database health probe result.",
            cause: new Error("Expected select 1 as ok to return ok = 1."),
          }),
        );
      }

      return DbHealthResponse.make({
        ok: true,
        service: "ceird-api",
        database: {
          provider: "neon-postgres",
          transport: "cloudflare-hyperdrive",
        },
      });
    }),
  });

function withTimeout<T>(promise: Promise<T>, timeoutMillis: number) {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Database health query timed out after ${timeoutMillis}ms.`));
    }, timeoutMillis);

    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}
