import assert from "node:assert/strict";
import test from "node:test";
import * as Effect from "effect/Effect";
import { makePromiseAwaitableEffectDb } from "./db.ts";

test("Alchemy Drizzle bridge makes Effect query chains awaitable", async () => {
  const query = Effect.succeed({ rows: [{ ok: 1 }] });
  const fakeDb = {
    execute: () => query,
  };
  const db = makePromiseAwaitableEffectDb(
    fakeDb,
    <A, E>(effect: Effect.Effect<A, E, never>) => Effect.runPromise(effect),
  );

  const result = await db.execute();

  assert.deepEqual(result, { rows: [{ ok: 1 }] });
});
