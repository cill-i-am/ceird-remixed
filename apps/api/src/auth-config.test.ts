import * as assert from "node:assert/strict";
import { test } from "node:test";
import { parseHostList, parseOriginList } from "./auth-config.ts";

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

test("auth config rejects wildcard allowed hosts", () => {
  assert.throws(() => parseHostList("*.ceird.app"), /must be exact/);
  assert.throws(() => parseHostList("api?.ceird.app"), /must be exact/);
});

