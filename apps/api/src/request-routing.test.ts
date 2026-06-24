import * as assert from "node:assert/strict";
import { test } from "node:test";
import { classifyApiRequest } from "./request-routing.ts";

test("API request routing short-circuits preflight before scoped runtime setup", () => {
  assert.deepEqual(
    classifyApiRequest(new Request("https://api.ceird.app/me", {
      method: "OPTIONS",
    })),
    { _tag: "preflight" },
  );
});

test("API request routing keeps public non-DB routes outside scoped runtime setup", () => {
  assert.deepEqual(
    classifyApiRequest(new Request("https://api.ceird.app/health")),
    { _tag: "public", path: "/health" },
  );
  assert.deepEqual(
    classifyApiRequest(new Request("https://api.ceird.app/hello")),
    { _tag: "public", path: "/hello" },
  );
  assert.deepEqual(
    classifyApiRequest(new Request("https://api.ceird.app/")),
    { _tag: "public", path: "/" },
  );
});

test("API request routing keeps auth, protected, and DB routes scoped", () => {
  assert.deepEqual(
    classifyApiRequest(new Request("https://api.ceird.app/api/auth/ok")),
    { _tag: "scoped" },
  );
  assert.deepEqual(
    classifyApiRequest(new Request("https://api.ceird.app/me")),
    { _tag: "scoped" },
  );
  assert.deepEqual(
    classifyApiRequest(new Request("https://api.ceird.app/db/health")),
    { _tag: "scoped" },
  );
});
