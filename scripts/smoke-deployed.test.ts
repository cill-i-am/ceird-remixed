import assert from "node:assert/strict";
import test from "node:test";
import {
  cookieHeaderFromSetCookie,
  parseSmokeOrigin,
  redactSensitiveText,
  resolveSmokeConfig,
} from "./smoke-deployed.ts";

test("derives deployed smoke URLs from the prod stage", () => {
  const config = resolveSmokeConfig({ STAGE: "prod" });

  assert.equal(config.stage, "prod");
  assert.equal(config.appOrigin.origin, "https://app.ceird.app");
  assert.equal(config.apiOrigin.origin, "https://api.ceird.app");
});

test("derives deployed smoke URLs from pull request stages", () => {
  const config = resolveSmokeConfig({ STAGE: "pr-42" });

  assert.equal(config.stage, "pr-42");
  assert.equal(config.appOrigin.origin, "https://app-pr-42.ceird.app");
  assert.equal(config.apiOrigin.origin, "https://api-pr-42.ceird.app");
});

test("allows explicit smoke URL overrides without a stage", () => {
  const config = resolveSmokeConfig({
    API_URL: "https://api-old.example.com",
    APP_URL: "https://app-old.example.com",
    SMOKE_API_URL: "http://127.0.0.1:8787",
    SMOKE_APP_URL: "http://localhost:1338",
  });

  assert.equal(config.stage, "custom");
  assert.equal(config.appOrigin.origin, "http://localhost:1338");
  assert.equal(config.apiOrigin.origin, "http://127.0.0.1:8787");
});

test("rejects smoke URLs that contain paths", () => {
  assert.throws(
    () => parseSmokeOrigin("https://api.ceird.app/health", "API_URL"),
    /origin, not a full URL path/u,
  );
});

test("rejects non-local http smoke URLs", () => {
  assert.throws(
    () => parseSmokeOrigin("http://api.ceird.app", "API_URL"),
    /https except loopback/u,
  );
});

test("builds a Cookie header from Set-Cookie headers", () => {
  assert.equal(
    cookieHeaderFromSetCookie([
      "better-auth.session_token=abc123; Path=/; HttpOnly; Secure",
      "better-auth.csrf_token=def456; Path=/; HttpOnly; Secure",
    ]),
    "better-auth.session_token=abc123; better-auth.csrf_token=def456",
  );
});

test("redacts auth tokens and cookies from failure previews", () => {
  assert.equal(
    redactSensitiveText(
      '{"token":"secret-token","password":"Smoke-test-password-12345!","cookie":"better-auth.session_token=secret-cookie"}',
    ),
    '{"token":"[redacted]","password":"[redacted-password]","cookie":"better-auth.[redacted]=[redacted]"}',
  );
});
