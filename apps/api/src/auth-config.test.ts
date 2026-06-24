import * as assert from "node:assert/strict";
import { test } from "node:test";
import {
  makeStageAuthConfig,
  parseBetterAuthSecret,
  parseHostList,
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

test("auth config rejects non-HTTPS trusted origins except local loopback", () => {
  assert.throws(
    () => parseOriginList("http://evil.example"),
    /must use https/,
  );
  assert.deepEqual(parseOriginList("http://localhost:3000"), [
    "http://localhost:3000",
  ]);
  assert.deepEqual(parseOriginList("http://127.0.0.1:3000"), [
    "http://127.0.0.1:3000",
  ]);
});

test("auth config rejects wildcard allowed hosts", () => {
  assert.throws(() => parseHostList("*.ceird.app"), /must be exact/);
  assert.throws(() => parseHostList("api?.ceird.app"), /must be exact/);
});

test("stage auth config returns exact production origins", () => {
  assert.deepEqual(makeStageAuthConfig("prod"), {
    apiHost: "api.ceird.app",
    apiOrigin: "https://api.ceird.app",
    appHost: "app.ceird.app",
    appOrigin: "https://app.ceird.app",
  });
});

test("stage auth config returns exact preview origins", () => {
  assert.deepEqual(makeStageAuthConfig("pr-12"), {
    apiHost: "api-pr-12.ceird.app",
    apiOrigin: "https://api-pr-12.ceird.app",
    appHost: "app-pr-12.ceird.app",
    appOrigin: "https://app-pr-12.ceird.app",
  });
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
