import { relations } from "@ceird/db/relations";
import { sql, type SQL } from "drizzle-orm";
import {
  drizzle,
  type NodePgDatabase,
} from "drizzle-orm/node-postgres";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";
import { Client } from "pg";
import { makeDbHealthLive, type HealthProbeRow } from "./db-health.ts";

export type ApiDb = NodePgDatabase<typeof relations>;

export type ApiDbHandle = {
  readonly db: ApiDb;
  readonly authDb: ApiDb;
  readonly close: () => Promise<void>;
};

const databaseQueryTimeoutMillis = 3_000;

export async function makeApiDb(
  connectionString: Effect.Effect<Redacted.Redacted<string>>,
): Promise<ApiDbHandle> {
  const client = new Client({
    connectionString: Redacted.value(await Effect.runPromise(connectionString)),
  });
  await client.connect();
  const db = drizzle({ client, relations });

  return {
    db,
    authDb: db,
    close: () => client.end(),
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
    return Promise.resolve(db.db.execute(sql<HealthProbeRow>`select 1 as ok`));
  }

  return Promise.resolve(db.execute(sql<HealthProbeRow>`select 1 as ok`));
}

function isApiDbHandle(value: unknown): value is ApiDbHandle {
  return typeof value === "object" &&
    value !== null &&
    typeof Object.getOwnPropertyDescriptor(value, "close")?.value === "function" &&
    typeof Object.getOwnPropertyDescriptor(value, "db")?.value === "object" &&
    typeof Object.getOwnPropertyDescriptor(value, "authDb")?.value === "object";
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
