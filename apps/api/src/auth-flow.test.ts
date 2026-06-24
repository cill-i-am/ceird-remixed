import * as assert from "node:assert/strict";
import { test } from "node:test";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { Auth, AuthSessionLookupFailed, makeAuthLive } from "./auth.ts";
import { makeStageAuthConfig } from "./auth-config.ts";
import { isAllowedCredentialedOrigin, makeCorsPolicy } from "./cors.ts";
import { makeAuthFlowHarness } from "./test/auth-flow-harness.ts";

test("Better Auth routes are dispatched before the Effect HttpApi router", async () => {
  await using harness = await makeAuthFlowHarness();

  const response = await harness.fetch(
    new Request("http://localhost/api/auth/ok", {
      headers: { origin: "http://localhost:3000" },
    }),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok" });
});

test("email/password sign-up and sign-in create Drizzle-backed sessions", async () => {
  await using harness = await makeAuthFlowHarness();

  const signUp = await harness.fetch(
    jsonRequest("http://localhost/api/auth/sign-up/email", {
      email: "ada@example.com",
      password: "correct horse battery staple",
      name: "Ada Lovelace",
    }),
  );

  assert.equal(signUp.status, 200);
  assert.equal(await harness.userCountByEmail("ada@example.com"), 1);
  assert.equal(await harness.sessionCount(), 1);

  const signIn = await harness.fetch(
    jsonRequest("http://localhost/api/auth/sign-in/email", {
      email: "ada@example.com",
      password: "correct horse battery staple",
    }),
  );

  assert.equal(signIn.status, 200);
  assert.match(readSetCookie(signIn), /better-auth\./);
  assert.doesNotMatch(readSetCookie(signIn), /;\s*Secure/i);
});

test("email/password sign-up uses database-backed rate limiting", async () => {
  await using harness = await makeAuthFlowHarness();

  const signUp = await harness.fetch(
    jsonRequest("http://localhost/api/auth/sign-up/email", {
      email: "rate-limited@example.com",
      password: "correct horse battery staple",
      name: "Rate Limited",
    }),
  );

  assert.equal(signUp.status, 200);
  assert.equal(await harness.rateLimitRowCount(), 1);
});

test("email/password sign-up keys rate limiting by Cloudflare client IP", async () => {
  await using harness = await makeAuthFlowHarness();

  const signUp = await harness.fetch(
    jsonRequest("http://localhost/api/auth/sign-up/email", {
      email: "cloudflare-ip@example.com",
      password: "correct horse battery staple",
      name: "Cloudflare IP",
    }, {
      "cf-connecting-ip": "203.0.113.10",
      "x-forwarded-for": "198.51.100.20",
    }),
  );

  assert.equal(signUp.status, 200);
  const keys = await harness.rateLimitKeys();
  assert.equal(keys.some((key) => key.includes("203.0.113.10")), true);
  assert.equal(keys.some((key) => key.includes("198.51.100.20")), false);
});

test("secure cookie mode is explicit for deployed auth", async () => {
  await using harness = await makeAuthFlowHarness({
    authConfig: {
      useSecureCookies: true,
    },
  });

  const signInCookie = await harness.signUpAndReadCookie({
    email: "secure-cookie@example.com",
    password: "correct horse battery staple",
    name: "Secure Cookie",
  });

  assert.match(signInCookie, /;\s*Secure/i);
});

test("GET /me requires a valid Better Auth session and returns a typed principal", async () => {
  await using harness = await makeAuthFlowHarness();

  const anonymous = await harness.fetch(new Request("http://localhost/me"));
  assert.equal(anonymous.status, 401);

  const cookie = await harness.signUpAndReadCookie({
    email: "grace@example.com",
    password: "correct horse battery staple",
    name: "Grace Hopper",
  });
  const authenticated = await harness.fetch(
    new Request("http://localhost/me", {
      headers: { cookie },
    }),
  );

  assert.equal(authenticated.status, 200);
  assert.deepEqual(await authenticated.json(), {
    id: await harness.userIdByEmail("grace@example.com"),
    email: "grace@example.com",
    emailVerified: false,
    name: "Grace Hopper",
  });
});

test("GET /db/health requires a valid Better Auth session", async () => {
  await using harness = await makeAuthFlowHarness();

  const anonymous = await harness.fetch(
    new Request("http://localhost/db/health"),
  );
  assert.equal(anonymous.status, 401);

  const cookie = await harness.signUpAndReadCookie({
    email: "db-health@example.com",
    password: "correct horse battery staple",
    name: "DB Health",
  });
  const authenticated = await harness.fetch(
    new Request("http://localhost/db/health", {
      headers: { cookie },
    }),
  );

  assert.equal(authenticated.status, 200);
  assert.deepEqual(await authenticated.json(), {
    ok: true,
    service: "ceird-api",
    database: {
      provider: "neon-postgres",
      transport: "cloudflare-hyperdrive",
    },
  });
});

test("Auth service parses Better Auth cookies into a Principal", async () => {
  await using harness = await makeAuthFlowHarness();

  const cookie = await harness.signUpAndReadCookie({
    email: "katherine@example.com",
    password: "correct horse battery staple",
    name: "Katherine Johnson",
  });
  const principal = await Effect.runPromise(
    Effect.gen(function* () {
      const auth = yield* Auth;
      return yield* auth.requirePrincipal(
        new Headers({ cookie, host: "localhost" }),
      );
    }).pipe(Effect.provide(harness.authLive)),
  );

  assert.equal(principal.email, "katherine@example.com");
  assert.equal(principal.emailVerified, false);
  assert.equal(principal.name, "Katherine Johnson");
});

test("Auth service disables Better Auth session refresh for principal lookup", async () => {
  let disableRefresh: boolean | undefined;
  const authLive = makeAuthLive({
    handler: () => Promise.resolve(new Response(null, { status: 404 })),
    api: {
      getSession: (options) => {
        disableRefresh = options.query?.disableRefresh;
        return Promise.resolve({
          user: {
            id: "readonly_user",
            email: "readonly@example.com",
            emailVerified: true,
            name: "Read Only",
          },
        });
      },
    },
  });

  await Effect.runPromise(
    Effect.gen(function* () {
      const auth = yield* Auth;
      return yield* auth.requirePrincipal(
        new Headers({ cookie: "better-auth.session_token=test" }),
      );
    }).pipe(Effect.provide(authLive)),
  );

  assert.equal(disableRefresh, true);
});

test("GET /me maps auth infrastructure lookup failures to 500", async () => {
  await using harness = await makeAuthFlowHarness({
    authLive: Layer.succeed(Auth)({
      handleAuthRequest: () =>
        Effect.succeed(new Response(null, { status: 404 })),
      requirePrincipal: () =>
        Effect.fail(
          AuthSessionLookupFailed.make({
            message: "Synthetic lookup failure.",
            cause: new Error("synthetic"),
          }),
        ),
    }),
  });

  const response = await harness.fetch(new Request("http://localhost/me"));

  assert.equal(response.status, 500);
});

test("credentialed CORS allows the app origin and omits credentials for untrusted origins", async () => {
  await using harness = await makeAuthFlowHarness();

  const allowed = await harness.fetch(
    new Request("http://localhost/me", {
      method: "OPTIONS",
      headers: {
        origin: "http://localhost:3000",
        "access-control-request-method": "GET",
      },
    }),
  );
  assert.equal(allowed.status, 204);
  assert.equal(
    allowed.headers.get("access-control-allow-origin"),
    "http://localhost:3000",
  );
  assert.equal(allowed.headers.get("access-control-allow-credentials"), "true");

  const rejected = await harness.fetch(
    new Request("http://localhost/me", {
      method: "OPTIONS",
      headers: {
        origin: "https://evil.example",
        "access-control-request-method": "GET",
      },
    }),
  );
  assert.equal(rejected.status, 204);
  assert.equal(rejected.headers.get("access-control-allow-origin"), null);
  assert.equal(rejected.headers.get("access-control-allow-credentials"), null);
});

test("default credentialed CORS policy rejects unconfigured localhost", () => {
  assert.equal(isAllowedCredentialedOrigin("http://localhost:3000"), false);
  assert.equal(isAllowedCredentialedOrigin("http://127.0.0.1:3000"), false);
});

test("credentialed CORS allows only explicit first-party app and local origins", async () => {
  await using harness = await makeAuthFlowHarness({
    corsPolicy: makeCorsPolicy({
      credentialedOrigins: [
        "https://app.ceird.app",
        "http://localhost:3000",
      ],
    }),
  });

  const appOrigin = await preflightFrom(harness.fetch, "https://app.ceird.app");
  assert.equal(
    appOrigin.headers.get("access-control-allow-origin"),
    "https://app.ceird.app",
  );

  const orgOrigin = await preflightFrom(harness.fetch, "https://acme.ceird.app");
  assert.equal(orgOrigin.headers.get("access-control-allow-origin"), null);

  const nestedOrigin = await preflightFrom(
    harness.fetch,
    "https://team.acme.ceird.app",
  );
  assert.equal(nestedOrigin.headers.get("access-control-allow-origin"), null);

  const insecureCeirdOrigin = await preflightFrom(
    harness.fetch,
    "http://acme.ceird.app",
  );
  assert.equal(
    insecureCeirdOrigin.headers.get("access-control-allow-origin"),
    null,
  );
});

test("preview credentialed CORS rejects production app unless explicitly configured", () => {
  const preview = makeStageAuthConfig("pr-12");
  const policy = makeCorsPolicy({
    credentialedOrigins: [preview.appOrigin],
  });

  assert.equal(
    isAllowedCredentialedOrigin("https://app.ceird.app", policy),
    false,
  );
  assert.equal(isAllowedCredentialedOrigin(preview.appOrigin, policy), true);
});

test("credentialed CORS can allow an exact configured preview app origin", async () => {
  const previewOrigin =
    "https://ceird-remixed-app-pr-12-abcdefghijklmnop.cillian.workers.dev";
  await using harness = await makeAuthFlowHarness({
    corsPolicy: makeCorsPolicy({
      credentialedOrigins: [previewOrigin],
    }),
  });

  const allowedPreview = await preflightFrom(harness.fetch, previewOrigin);
  assert.equal(
    allowedPreview.headers.get("access-control-allow-origin"),
    previewOrigin,
  );

  const siblingPreview = await preflightFrom(
    harness.fetch,
    "https://ceird-remixed-app-pr-13-abcdefghijklmnop.cillian.workers.dev",
  );
  assert.equal(siblingPreview.headers.get("access-control-allow-origin"), null);
});

test("Better Auth rejects spoofed forwarded host from an untrusted request URL", async () => {
  const preview = makeStageAuthConfig("pr-12");
  await using harness = await makeAuthFlowHarness({
    authConfig: {
      allowedHosts: [preview.apiHost],
      trustedOrigins: [preview.appOrigin],
      protocol: "https",
      useSecureCookies: true,
    },
    corsPolicy: makeCorsPolicy({
      credentialedOrigins: [preview.appOrigin],
    }),
  });

  const response = await harness.fetch(
    jsonRequest("https://evil.example/api/auth/sign-up/email", {
      email: "spoofed-forwarded-host@example.com",
      password: "correct horse battery staple",
      name: "Spoofed Host",
    }, {
      host: "evil.example",
      origin: preview.appOrigin,
      "x-forwarded-host": preview.apiHost,
      "x-forwarded-proto": "https",
    }),
  );

  assert.notEqual(response.status, 200);
  assert.equal(
    await harness.userCountByEmail("spoofed-forwarded-host@example.com"),
    0,
  );
});

function jsonRequest(
  url: string,
  body: unknown,
  extraHeaders: Readonly<Record<string, string>> = {},
) {
  return new Request(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost:3000",
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  });
}

function readSetCookie(response: Response) {
  const setCookie = response.headers.get("set-cookie");
  if (setCookie === null) {
    throw new Error("Expected response to include a Set-Cookie header.");
  }

  return setCookie;
}

function preflightFrom(
  fetchImplementation: (request: Request) => Promise<Response>,
  origin: string,
) {
  return fetchImplementation(
    new Request("http://localhost/me", {
      method: "OPTIONS",
      headers: {
        origin,
        "access-control-request-method": "GET",
      },
    }),
  );
}
