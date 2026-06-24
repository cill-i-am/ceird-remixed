import { relations } from "@ceird/db/relations";
import * as Drizzle from "alchemy/Drizzle";
import { ExecutionContext } from "alchemy/ExecutionContext";
import type { EffectPgDatabase } from "drizzle-orm/effect-postgres";
import { sql, type SQL } from "drizzle-orm";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Redacted from "effect/Redacted";
import * as Scope from "effect/Scope";
import { makeDbHealthLive, type HealthProbeRow } from "./db-health.ts";

export type ApiDb = EffectPgDatabase<typeof relations>;

export type ApiDbHandle = {
  readonly db: ApiDb;
  readonly authDb: ApiDb;
  readonly run: <A, E>(effect: Effect.Effect<A, E, never>) => Promise<A>;
  readonly close: () => Promise<void>;
};

const databaseQueryTimeoutMillis = 3_000;

export async function makeApiDb(
  connectionString: Effect.Effect<Redacted.Redacted<string>>,
): Promise<ApiDbHandle> {
  const scope = await Effect.runPromise(Scope.make());
  const executionContext = {
    scope,
    cache: {},
  };
  const run = <A, E>(effect: Effect.Effect<A, E, never>) =>
    Effect.runPromise(
      effect.pipe(
        Effect.provideService(ExecutionContext, executionContext),
      ),
    );
  const db = await run(Drizzle.postgres(connectionString, { relations }));

  return {
    db,
    authDb: makePromiseAwaitableEffectDb(db, run),
    run,
    close: () => Effect.runPromise(Scope.close(scope, Exit.void)),
  };
}

export async function closeApiDb(handle: ApiDbHandle) {
  await handle.close();
}

type DrizzleHealthDb<TResult> = {
  readonly execute: (query: SQL<HealthProbeRow>) => TResult;
};

export const makeDbHealthLiveFromDb = <TResult>(
  db: ApiDbHandle | DrizzleHealthDb<TResult>,
) =>
  makeDbHealthLive({
    queryHealth: async () => normalizeHealthProbeRows(await queryHealth(db)),
    timeoutMillis: databaseQueryTimeoutMillis,
  });

function queryHealth<TResult>(
  db: ApiDbHandle | DrizzleHealthDb<TResult>,
): Promise<unknown> {
  if (isApiDbHandle(db)) {
    return db.run(Effect.gen(function* () {
      return yield* db.db.execute(sql<HealthProbeRow>`select 1 as ok`);
    }));
  }

  return Promise.resolve(db.execute(sql<HealthProbeRow>`select 1 as ok`));
}

function isApiDbHandle(value: unknown): value is ApiDbHandle {
  return typeof value === "object" &&
    value !== null &&
    typeof Object.getOwnPropertyDescriptor(value, "run")?.value === "function" &&
    typeof Object.getOwnPropertyDescriptor(value, "close")?.value === "function" &&
    typeof Object.getOwnPropertyDescriptor(value, "db")?.value === "object" &&
    typeof Object.getOwnPropertyDescriptor(value, "authDb")?.value === "object";
}

type ChainFunction = {
  (...args: ReadonlyArray<unknown>): unknown;
};

type EffectRunner = <A, E>(effect: Effect.Effect<A, E, never>) => Promise<A>;

function makePromiseAwaitableEffectDb<T extends object>(
  db: T,
  run: EffectRunner,
): T {
  return wrapEffectChain(db, run);
}

function wrapIfObject(value: unknown, run: EffectRunner): unknown {
  return (typeof value === "object" || typeof value === "function") &&
      value !== null
    ? wrapEffectChain(value, run)
    : value;
}

function wrapEffectChain<T extends object>(target: T, run: EffectRunner): T {
  return new Proxy(target, {
    get(innerTarget, prop, receiver) {
      if (prop === "then") {
        return makeThen(innerTarget, run);
      }

      return wrapIfObject(Reflect.get(innerTarget, prop, receiver), run);
    },
    apply(innerTarget, thisArg, args) {
      // Proxy apply only runs for Alchemy's callable Drizzle chain proxy.
      const callable = innerTarget as T & ChainFunction;

      return wrapIfObject(Reflect.apply(callable, thisArg, args), run);
    },
  });
}

function makeThen(target: object, run: EffectRunner) {
  return (
    onFulfilled?: ((value: unknown) => unknown) | null,
    onRejected?: ((reason: unknown) => unknown) | null,
  ) => runYieldable(target, run).then(onFulfilled, onRejected);
}

function runYieldable(target: object, run: EffectRunner) {
  // Alchemy's Drizzle proxy-chain is yieldable but Better Auth awaits it like a
  // Promise. This adapter is the API-edge bridge between those two protocols.
  const yieldable = target as Effect.Effect<unknown, unknown, never>;

  return run(Effect.gen(function* () {
    return yield* yieldable;
  }));
}

function normalizeHealthProbeRows(result: unknown): ReadonlyArray<HealthProbeRow> {
  if (Array.isArray(result)) {
    return result.filter(isHealthProbeRow);
  }

  if (typeof result !== "object" || result === null) {
    return [];
  }

  const rows = Object.getOwnPropertyDescriptor(result, "rows")?.value;

  return Array.isArray(rows) ? rows.filter(isHealthProbeRow) : [];
}

function isHealthProbeRow(value: unknown): value is HealthProbeRow {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  return Object.getOwnPropertyDescriptor(value, "ok")?.value === 1;
}
