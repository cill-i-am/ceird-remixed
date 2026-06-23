import * as Cloudflare from "alchemy/Cloudflare";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";
import { Client } from "pg";
import { DbHealthResponse } from "@ceird/api-contract";
import type { RuntimeContextInterface } from "alchemy";

const healthProbeTimeoutMillis = 3_000;

/** Expected failure while checking API database connectivity. */
export class DbHealthCheckFailed extends Schema.TaggedErrorClass<DbHealthCheckFailed>()(
  "DbHealthCheckFailed",
  {
    operation: Schema.Union([
      Schema.Literal("connect"),
      Schema.Literal("query"),
      Schema.Literal("close"),
    ]),
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
      DbHealthCheckFailed,
      RuntimeContextInterface
    >;
  }
>()("ceird/DbHealth") {}

const toDbHealthCheckFailed =
  (operation: DbHealthCheckFailed["operation"]) => (cause: unknown) =>
    DbHealthCheckFailed.make({
      operation,
      message: cause instanceof Error ? cause.message : String(cause),
      cause,
    });

type HealthProbeRow = {
  readonly ok: number;
};

type PgHealthClient = {
  readonly connect: () => Promise<unknown>;
  readonly queryHealth: () => Promise<{
    readonly rows: ReadonlyArray<HealthProbeRow>;
  }>;
  readonly end: () => Promise<unknown>;
};

type PgHealthClientFactory = (
  connectionString: Redacted.Redacted<string>,
) => PgHealthClient;

const makePgHealthClient: PgHealthClientFactory = (connectionString) => {
  const client = new Client({
    connectionString: Redacted.value(connectionString),
    connectionTimeoutMillis: healthProbeTimeoutMillis,
    query_timeout: healthProbeTimeoutMillis,
    statement_timeout: healthProbeTimeoutMillis,
  });

  return {
    connect: () => client.connect(),
    queryHealth: () => client.query<HealthProbeRow>("select 1 as ok"),
    end: () => client.end(),
  };
};

/** Build the live API database health layer from the Worker Hyperdrive binding. */
export const makeDbHealthLive = (
  hyperdrive: Cloudflare.HyperdriveBindingClient,
  options?: {
    readonly makeClient?: PgHealthClientFactory;
  },
) =>
  Layer.succeed(DbHealth)({
    check: Effect.fn("DbHealth.check")(function* () {
      const connectionString = yield* hyperdrive.connectionString;
      const client = (options?.makeClient ?? makePgHealthClient)(
        connectionString,
      );

      const close = Effect.tryPromise({
        try: () => client.end(),
        catch: toDbHealthCheckFailed("close"),
      }).pipe(Effect.catchTag("DbHealthCheckFailed", () => Effect.void));

      return yield* Effect.gen(function* () {
        yield* Effect.tryPromise({
          try: () => client.connect(),
          catch: toDbHealthCheckFailed("connect"),
        });

        const result = yield* Effect.tryPromise({
          try: () => client.queryHealth(),
          catch: toDbHealthCheckFailed("query"),
        });

        if (result.rows[0]?.ok !== 1) {
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
      }).pipe(Effect.ensuring(close));
    }),
  });
