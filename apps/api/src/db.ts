import { relations } from "@ceird/db/relations";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { sql, type SQL } from "drizzle-orm";
import * as Redacted from "effect/Redacted";
import type { Pool } from "pg";
import { makeDbHealthLive, type HealthProbeRow } from "./db-health.ts";

export type ApiDb = NodePgDatabase<typeof relations> & {
  readonly $client: Pool;
};

const databaseConnectionTimeoutMillis = 3_000;
const databaseQueryTimeoutMillis = 3_000;
const databaseIdleTimeoutMillis = 10_000;
const databasePoolMaxConnections = 5;

export function makeApiDb(
  connectionString: Redacted.Redacted<string>,
): ApiDb {
  // Keep the pool small and bound both connection acquisition and statements so
  // stalled queries cannot occupy every Hyperdrive-backed slot indefinitely.
  return drizzle({
    connection: {
      connectionString: Redacted.value(connectionString),
      max: databasePoolMaxConnections,
      connectionTimeoutMillis: databaseConnectionTimeoutMillis,
      idleTimeoutMillis: databaseIdleTimeoutMillis,
      query_timeout: databaseQueryTimeoutMillis,
      statement_timeout: databaseQueryTimeoutMillis,
    },
    relations,
  });
}

export async function closeApiDb(db: ApiDb) {
  await db.$client.end();
}

type DrizzleHealthDb<TResult> = {
  readonly execute: (query: SQL<HealthProbeRow>) => TResult;
};

export const makeDbHealthLiveFromDb = <TResult>(
  db: DrizzleHealthDb<TResult>,
) =>
  makeDbHealthLive({
    queryHealth: async () =>
      normalizeHealthProbeRows(
        await db.execute(sql<HealthProbeRow>`select 1 as ok`),
      ),
    timeoutMillis: databaseQueryTimeoutMillis,
  });

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
