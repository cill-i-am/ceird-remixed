import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as url from "node:url";
import * as schema from "@ceird/db/schema";
import { relations } from "@ceird/db/relations";
import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import { createAuth, makeAuthLive, type AuthInstance } from "../auth.ts";
import type { CorsPolicy } from "../cors.ts";
import { makeDbHealthLiveFromDb } from "../db.ts";
import { makeHttpApiFetch } from "../http.ts";

type SignUpInput = {
  readonly email: string;
  readonly password: string;
  readonly name: string;
};

const testSecret = Redacted.make(
  "local-test-secret-at-least-thirty-two-characters",
);

export type AuthFlowHarness = AsyncDisposable & {
  readonly auth: AuthInstance;
  readonly authLive: Layer.Layer<import("../auth.ts").Auth>;
  readonly fetch: (request: Request) => Promise<Response>;
  readonly userCountByEmail: (email: string) => Promise<number>;
  readonly userIdByEmail: (email: string) => Promise<string>;
  readonly sessionCount: () => Promise<number>;
  readonly signUpAndReadCookie: (input: SignUpInput) => Promise<string>;
};

export async function makeAuthFlowHarness(options?: {
  readonly corsPolicy?: CorsPolicy;
}): Promise<AuthFlowHarness> {
  const client = new PGlite();
  await applyMigration(client);
  await assertAuthTablesExist(client);
  const db = drizzle({
    client,
    relations,
  });
  const auth = createAuth(db, { secret: testSecret });
  const api = makeHttpApiFetch(
    options?.corsPolicy === undefined
      ? {
          auth,
          dbHealthLive: makeDbHealthLiveFromDb(db),
        }
      : {
          auth,
          dbHealthLive: makeDbHealthLiveFromDb(db),
          corsPolicy: options.corsPolicy,
        },
  );
  let disposed = false;

  return {
    auth,
    authLive: makeAuthLive(auth),
    fetch: api.fetch,
    userCountByEmail: async (email) => {
      const rows = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.user)
        .where(sql`${schema.user.email} = ${email}`);

      return rows[0]?.count ?? 0;
    },
    userIdByEmail: async (email) => {
      const rows = await db
        .select({ id: schema.user.id })
        .from(schema.user)
        .where(sql`${schema.user.email} = ${email}`);
      const id = rows[0]?.id;

      if (id === undefined) {
        throw new Error(`No test user found for ${email}.`);
      }

      return id;
    },
    sessionCount: async () => {
      const rows = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.session);

      return rows[0]?.count ?? 0;
    },
    signUpAndReadCookie: async (input) => {
      const response = await api.fetch(jsonRequest("/api/auth/sign-up/email", input));

      if (response.status !== 200) {
        throw new Error(`Expected sign-up to pass, got ${response.status}.`);
      }

      const cookie = response.headers.get("set-cookie");

      if (cookie === null) {
        throw new Error("Expected sign-up response to set a session cookie.");
      }

      return cookie;
    },
    async [Symbol.asyncDispose]() {
      if (disposed) {
        return;
      }

      disposed = true;
      await api.dispose();
      await client.close();
    },
  };
}

async function applyMigration(client: PGlite) {
  const migrationPath = path.resolve(
    path.dirname(url.fileURLToPath(import.meta.url)),
    "../../../../packages/db/migrations/0000_better_auth.sql",
  );
  const migration = await fs.readFile(migrationPath, "utf8");

  await client.exec(migration);
}

async function assertAuthTablesExist(client: PGlite) {
  const result = await client.query<{ exists: boolean }>(
    "select to_regclass('public.user') is not null as exists",
  );

  if (result.rows[0]?.exists !== true) {
    throw new Error("Auth test database migration did not create public.user.");
  }
}

function jsonRequest(pathname: string, body: unknown) {
  return new Request(`http://localhost${pathname}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost:3000",
    },
    body: JSON.stringify(body),
  });
}
