import * as assert from "node:assert/strict";
import { test } from "node:test";
import * as Redacted from "effect/Redacted";
import { runAuthBackgroundTask } from "./background-tasks.ts";
import { makeCorsPolicy } from "./cors.ts";
import { type AuthHandler } from "./http.ts";
import { makeWorkerFetch } from "./worker-runtime.ts";

test("public and preflight requests skip scoped DB/Auth runtime construction", async () => {
  const harness = makeWorkerRuntimeHarness();

  const publicResponse = await harness.fetch(
    new Request("https://api-pr-12.ceird.app/health"),
  );
  const preflightResponse = await harness.fetch(
    new Request("https://api-pr-12.ceird.app/me", {
      method: "OPTIONS",
      headers: {
        origin: "https://app-pr-12.ceird.app",
        "access-control-request-method": "GET",
      },
    }),
  );

  assert.equal(publicResponse.status, 200);
  assert.equal(preflightResponse.status, 204);
  assert.deepEqual(harness.calls(), {
    db: 0,
    auth: 0,
    httpApi: 0,
    close: 0,
  });
});

test("auth routes skip Effect HttpApi router construction", async () => {
  const harness = makeWorkerRuntimeHarness();

  const response = await harness.fetch(
    new Request("https://api-pr-12.ceird.app/api/auth/ok"),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok" });
  assert.deepEqual(harness.calls(), {
    db: 1,
    auth: 1,
    httpApi: 0,
    close: 1,
  });
});

test("scoped Effect routes use request-scoped DB/Auth/HttpApi runtime", async () => {
  const harness = makeWorkerRuntimeHarness();

  const response = await harness.fetch(
    new Request("https://api-pr-12.ceird.app/me"),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { route: "http-api" });
  assert.deepEqual(harness.calls(), {
    db: 1,
    auth: 1,
    httpApi: 1,
    close: 1,
  });
});

test("request cleanup is bounded when router disposal hangs", async () => {
  const harness = makeWorkerRuntimeHarness({
    cleanupTimeoutMillis: 1,
    dispose: () => new Promise(() => undefined),
  });

  const response = await harness.fetch(
    new Request("https://api-pr-12.ceird.app/me"),
  );

  assert.equal(response.status, 200);
  await harness.waitForCleanup();
  assert.equal(harness.calls().close, 1);
  assert.equal(
    harness.warnings().some((warning) =>
      warning.fields.operation === "http-api-dispose"
    ),
    true,
  );
});

test("request cleanup is bounded when DB close hangs", async () => {
  const harness = makeWorkerRuntimeHarness({
    cleanupTimeoutMillis: 1,
    closeDb: () => new Promise(() => undefined),
  });

  const response = await harness.fetch(
    new Request("https://api-pr-12.ceird.app/me"),
  );

  assert.equal(response.status, 200);
  await harness.waitForCleanup();
  assert.equal(harness.calls().close, 1);
  assert.equal(
    harness.warnings().some((warning) =>
      warning.fields.operation === "db-close"
    ),
    true,
  );
});

test("request cleanup closes DB when auth construction throws", async () => {
  const harness = makeWorkerRuntimeHarness({
    createAuth: () => {
      throw new Error("synthetic auth construction failure");
    },
  });

  await assert.rejects(
    () => harness.fetch(new Request("https://api-pr-12.ceird.app/me")),
    /synthetic auth construction failure/,
  );
  await harness.waitForCleanup();
  assert.equal(harness.calls().close, 1);
});

test("request cleanup closes DB when HttpApi construction throws", async () => {
  const harness = makeWorkerRuntimeHarness({
    makeHttpApiFetch: () => {
      throw new Error("synthetic router construction failure");
    },
  });

  await assert.rejects(
    () => harness.fetch(new Request("https://api-pr-12.ceird.app/me")),
    /synthetic router construction failure/,
  );
  await harness.waitForCleanup();
  assert.equal(harness.calls().close, 1);
});

type RuntimeCalls = {
  readonly db: number;
  readonly auth: number;
  readonly httpApi: number;
  readonly close: number;
};

type RuntimeWarning = {
  readonly message: string;
  readonly fields: Readonly<Record<string, string>>;
};

type HarnessOptions = {
  readonly cleanupTimeoutMillis?: number;
  readonly dispose?: () => Promise<void>;
  readonly closeDb?: () => Promise<void>;
  readonly createAuth?: () => AuthHandler;
  readonly makeHttpApiFetch?: () => {
    readonly fetch: (request: Request) => Promise<Response>;
    readonly dispose: () => Promise<void>;
  };
};

function makeWorkerRuntimeHarness(options: HarnessOptions = {}) {
  let dbCalls = 0;
  let authCalls = 0;
  let httpApiCalls = 0;
  let closeCalls = 0;
  const cleanupTasks: Array<Promise<unknown>> = [];
  const warnings: Array<RuntimeWarning> = [];
  const fakeDb = { _tag: "fake-db" };
  const fakeAuth: AuthHandler = {
    handler: () => Promise.resolve(new Response("{}", { status: 200 })),
  };
  const fetch = makeWorkerFetch({
    config: {
      authSecret: Redacted.make(
        "local-test-secret-at-least-thirty-two-characters",
      ),
      trustedOrigins: ["https://app-pr-12.ceird.app"],
      allowedHosts: ["api-pr-12.ceird.app"],
      corsPolicy: makeCorsPolicy({
        credentialedOrigins: ["https://app-pr-12.ceird.app"],
      }),
      protocol: "https",
      useSecureCookies: true,
    },
    deps: {
      makeDb: () => {
        dbCalls += 1;
        return Promise.resolve(fakeDb);
      },
      closeDb: () => {
        closeCalls += 1;
        return options.closeDb?.() ?? Promise.resolve();
      },
      createAuth: () => {
        authCalls += 1;
        return options.createAuth?.() ?? fakeAuth;
      },
      makeHttpApiFetch: () => {
        httpApiCalls += 1;
        return options.makeHttpApiFetch?.() ?? {
          fetch: () => Promise.resolve(Response.json({ route: "http-api" })),
          dispose: options.dispose ?? (() => Promise.resolve()),
        };
      },
      backgroundTaskHandler: runAuthBackgroundTask,
      warn: (message, fields) => {
        warnings.push({ message, fields });
      },
      ...(options.cleanupTimeoutMillis === undefined
        ? {}
        : { cleanupTimeoutMillis: options.cleanupTimeoutMillis }),
    },
  });

  return {
    fetch: async (request: Request) => {
      const response = await fetch(request, {
        waitUntil: (promise) => {
          cleanupTasks.push(promise);
        },
      });
      await Promise.allSettled(cleanupTasks);
      return response;
    },
    waitForCleanup: async () => {
      await Promise.allSettled(cleanupTasks);
    },
    calls: (): RuntimeCalls => ({
      db: dbCalls,
      auth: authCalls,
      httpApi: httpApiCalls,
      close: closeCalls,
    }),
    warnings: () => warnings,
  };
}
