import * as assert from "node:assert/strict";
import { test } from "node:test";
import {
  isLocalAuthStage,
  makeStageAuthConfig,
  parseAuthHost,
  parseAuthCookieDomain,
  parseAuthOrigin,
  parseBetterAuthSecret,
  parseHostList,
  parseLocalAuthCookieDomain,
  parseOriginList,
} from "./auth-config.ts";

test("auth config rejects wildcard trusted origins", () => {
  assert.throws(
    () => parseOriginList("https://*.ceird.app"),
    /must be exact/,
  );
  assert.throws(
    () => parseOriginList("https://app?.ceird.app"),
    /must be exact/,
  );
});

test("auth config rejects non-HTTPS trusted origins in deployed config", () => {
  assert.throws(
    () => parseOriginList("http://evil.example"),
    /must use https/,
  );
  assert.throws(
    () => parseOriginList("http://localhost:3000"),
    /must use https/,
  );
  assert.throws(
    () => parseOriginList("http://127.0.0.1:3000"),
    /must use https/,
  );
  assert.throws(
    () => parseOriginList("http://[::1]:3000"),
    /must use https/,
  );
});

test("auth config accepts local HTTP loopback only for local dev", () => {
  assert.deepEqual(parseOriginList("http://localhost:3000", {
    allowLocalHttp: true,
  }), [
    "http://localhost:3000",
  ]);
  assert.deepEqual(parseOriginList("http://127.0.0.1:3000", {
    allowLocalHttp: true,
  }), [
    "http://127.0.0.1:3000",
  ]);
  assert.deepEqual(parseOriginList("http://[::1]:3000", {
    allowLocalHttp: true,
  }), [
    "http://[::1]:3000",
  ]);
  assert.throws(
    () => parseOriginList("http://evil.example", { allowLocalHttp: true }),
    /must use https/,
  );
});

test("auth config rejects wildcard allowed hosts", () => {
  assert.throws(() => parseHostList("*.ceird.app"), /must be exact/);
  assert.throws(() => parseHostList("api?.ceird.app"), /must be exact/);
});

test("auth config rejects local allowed hosts in deployed config", () => {
  assert.throws(() => parseHostList("localhost"), /local hosts/);
  assert.throws(() => parseHostList("127.0.0.1:8787"), /local hosts/);
  assert.throws(() => parseHostList("[::1]:8787"), /local hosts/);
  assert.throws(() => parseHostList("http://api.ceird.app"), /must use https/);
});

test("auth config accepts local allowed hosts only for local dev", () => {
  assert.deepEqual(parseHostList("localhost", { allowLocalHosts: true }), [
    "localhost",
  ]);
  assert.deepEqual(parseHostList("127.0.0.1:8787", {
    allowLocalHosts: true,
  }), [
    "127.0.0.1:8787",
  ]);
  assert.deepEqual(parseHostList("[::1]:8787", { allowLocalHosts: true }), [
    "[::1]:8787",
  ]);
  assert.deepEqual(parseHostList("http://localhost:8787", {
    allowLocalHosts: true,
  }), [
    "localhost:8787",
  ]);
});

test("stage auth config returns exact production origins", () => {
  assert.deepEqual(makeStageAuthConfig("prod"), {
    apiHost: "api.ceird.app",
    apiOrigin: "https://api.ceird.app",
    appHost: "app.ceird.app",
    appOrigin: "https://app.ceird.app",
    sharedCookieDomain: "ceird.app",
  });
});

test("stage auth config returns exact preview origins", () => {
  assert.deepEqual(makeStageAuthConfig("pr-12"), {
    apiHost: "api-pr-12.ceird.app",
    apiOrigin: "https://api-pr-12.ceird.app",
    appHost: "app-pr-12.ceird.app",
    appOrigin: "https://app-pr-12.ceird.app",
    sharedCookieDomain: "ceird.app",
  });
});

test("auth stage classification treats branch-like dev stages as local", () => {
  assert.equal(isLocalAuthStage("prod"), false);
  assert.equal(isLocalAuthStage("pr-12"), false);
  assert.equal(isLocalAuthStage("dev"), true);
  assert.equal(isLocalAuthStage("dev_cillian"), true);
  assert.equal(isLocalAuthStage("codex-portless-local-dev"), true);
  assert.equal(isLocalAuthStage("pr-local-experiment"), true);
});

test("auth host parser accepts exact hosts", () => {
  assert.equal(parseAuthHost("api.ceird.app"), "api.ceird.app");
  assert.equal(parseAuthHost("localhost"), "localhost");
  assert.equal(parseAuthHost("127.0.0.1:8787"), "127.0.0.1:8787");
  assert.equal(parseAuthHost("[::1]:8787"), "[::1]:8787");
});

test("auth host parser rejects wildcard and URL-shaped values", () => {
  assert.throws(() => parseAuthHost("*.ceird.app"), /exact host/);
  assert.throws(() => parseAuthHost("https://api.ceird.app"), /exact host/);
  assert.throws(() => parseAuthHost("api.ceird.app/path"), /exact host/);
});

test("auth origin parser accepts exact HTTP(S) origins", () => {
  assert.equal(parseAuthOrigin("https://app.ceird.app"), "https://app.ceird.app");
  assert.equal(parseAuthOrigin("http://localhost:3000"), "http://localhost:3000");
});

test("auth origin parser rejects non-origin values", () => {
  assert.throws(() => parseAuthOrigin("app.ceird.app"), /exact HTTP\(S\) origin/);
  assert.throws(
    () => parseAuthOrigin("https://app.ceird.app/path"),
    /exact HTTP\(S\) origin/,
  );
  assert.throws(
    () => parseAuthOrigin("https://app.ceird.app?next=/"),
    /exact HTTP\(S\) origin/,
  );
});

test("auth cookie domain accepts the deployed shared parent domain", () => {
  assert.equal(
    parseAuthCookieDomain("ceird.app", {
      apiHost: "api-pr-12.ceird.app",
      appOrigin: "https://app-pr-12.ceird.app",
    }),
    "ceird.app",
  );
});

test("auth cookie domain accepts a stage-scoped local portless parent domain", () => {
  assert.equal(
    parseAuthCookieDomain("dev-cillian.ceird.localhost", {
      apiHost: "api.dev-cillian.ceird.localhost:1355",
      appOrigin: "https://app.dev-cillian.ceird.localhost:1355",
    }),
    "dev-cillian.ceird.localhost",
  );
});

test("local auth cookie domain requires one exact local app and API entry", () => {
  assert.equal(
    parseLocalAuthCookieDomain("dev-cillian.ceird.localhost", {
      apiHosts: ["api.dev-cillian.ceird.localhost:1355"],
      appOrigins: ["https://app.dev-cillian.ceird.localhost:1355"],
    }),
    "dev-cillian.ceird.localhost",
  );

  assert.throws(
    () =>
      parseLocalAuthCookieDomain("dev-cillian.ceird.localhost", {
        apiHosts: [],
        appOrigins: ["https://app.dev-cillian.ceird.localhost:1355"],
      }),
    /requires exactly one CEIRD_AUTH_ALLOWED_HOSTS entry/,
  );
  assert.throws(
    () =>
      parseLocalAuthCookieDomain("dev-cillian.ceird.localhost", {
        apiHosts: [
          "api.dev-cillian.ceird.localhost:1355",
          "api.other-stage.ceird.localhost:1355",
        ],
        appOrigins: ["https://app.dev-cillian.ceird.localhost:1355"],
      }),
    /requires exactly one CEIRD_AUTH_ALLOWED_HOSTS entry/,
  );
  assert.throws(
    () =>
      parseLocalAuthCookieDomain("dev-cillian.ceird.localhost", {
        apiHosts: ["api.dev-cillian.ceird.localhost:1355"],
        appOrigins: [
          "https://app.dev-cillian.ceird.localhost:1355",
          "https://app.other-stage.ceird.localhost:1355",
        ],
      }),
    /requires exactly one CEIRD_AUTH_TRUSTED_ORIGINS entry/,
  );
});

test("auth cookie domain rejects wildcard and URL-shaped domains", () => {
  assert.throws(
    () =>
      parseAuthCookieDomain("*.ceird.app", {
        apiHost: "api.ceird.app",
        appOrigin: "https://app.ceird.app",
      }),
    /must be an exact domain/,
  );
  assert.throws(
    () =>
      parseAuthCookieDomain("https://ceird.app", {
        apiHost: "api.ceird.app",
        appOrigin: "https://app.ceird.app",
      }),
    /exact cookie domain/,
  );
  assert.throws(
    () =>
      parseAuthCookieDomain("ceird.app:443", {
        apiHost: "api.ceird.app",
        appOrigin: "https://app.ceird.app",
      }),
    /exact cookie domain/,
  );
});

test("auth cookie domain rejects mismatched or overbroad parent domains", () => {
  assert.throws(
    () =>
      parseAuthCookieDomain("evil.example", {
        apiHost: "api.ceird.app",
        appOrigin: "https://app.ceird.app",
      }),
    /must equal the shared parent domain ceird\.app/,
  );
  assert.throws(
    () =>
      parseAuthCookieDomain("ceird.localhost", {
        apiHost: "api.dev-cillian.ceird.localhost",
        appOrigin: "https://app.dev-cillian.ceird.localhost",
      }),
    /must equal the shared parent domain dev-cillian\.ceird\.localhost/,
  );
  assert.throws(
    () =>
      parseAuthCookieDomain("ceird.app", {
        apiHost: "api.dev-cillian.ceird.localhost",
        appOrigin: "https://app.other-stage.ceird.localhost",
      }),
    /requires sibling API and app hosts/,
  );
});

test("auth config rejects short Better Auth secrets", () => {
  assert.throws(
    () => parseBetterAuthSecret("short-secret"),
    /Invalid data <redacted>/,
  );
});

test("auth config accepts Better Auth secrets without exposing the value", () => {
  const secret = parseBetterAuthSecret(
    "local-test-secret-at-least-thirty-two-characters",
  );

  assert.equal(String(secret), "<redacted>");
});
