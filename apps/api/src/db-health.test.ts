import * as assert from "node:assert/strict";
import { test } from "node:test";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import {
  DbHealth,
  DbHealthCheckFailed,
  makeDbHealthLive,
} from "./db-health.ts";

test("DbHealth returns redacted-safe provider metadata when the probe succeeds", async () => {
  const result = await Effect.runPromise(checkDbHealth([{ ok: 1 }]));

  assert.equal(result.ok, true);
  assert.equal(result.service, "ceird-api");
  assert.deepEqual(result.database, {
    provider: "neon-postgres",
    transport: "cloudflare-hyperdrive",
  });
});

test("DbHealth fails when the probe result is unexpected", async () => {
  const exit = await Effect.runPromiseExit(checkDbHealth([{ ok: 0 }]));

  assert.equal(Exit.isFailure(exit), true);
  if (Exit.isFailure(exit)) {
    const failure = await Effect.runPromise(
      Effect.failCause(exit.cause).pipe(Effect.flip),
    );

    assert.equal(failure instanceof DbHealthCheckFailed, true);
    assert.equal(failure.operation, "query");
  }
});

test("DbHealth fails with a controlled error when the probe stalls", async () => {
  const exit = await Effect.runPromiseExit(
    Effect.gen(function* () {
      const dbHealth = yield* DbHealth;
      return yield* dbHealth.check();
    }).pipe(
      Effect.provide(
        makeDbHealthLive({
          queryHealth: () =>
            new Promise((resolve) => {
              setTimeout(() => resolve([{ ok: 1 }]), 50);
            }),
          timeoutMillis: 1,
        }),
      ),
    ),
  );

  assert.equal(Exit.isFailure(exit), true);
  if (Exit.isFailure(exit)) {
    const failure = await Effect.runPromise(
      Effect.failCause(exit.cause).pipe(Effect.flip),
    );

    assert.equal(failure instanceof DbHealthCheckFailed, true);
    assert.equal(failure.operation, "query");
    assert.match(failure.message, /timed out/);
  }
});

function checkDbHealth(rows: ReadonlyArray<{ readonly ok: number }>) {
  return Effect.gen(function* () {
    const dbHealth = yield* DbHealth;
    return yield* dbHealth.check();
  }).pipe(
    Effect.provide(
      makeDbHealthLive({
        queryHealth: () => Promise.resolve(rows),
      }),
    ),
  );
}
