import * as assert from "node:assert/strict";
import { test } from "node:test";
import { makeApiFetch, type AuthHandler } from "./http.ts";

test("auth adapter maps unexpected handler failures to 500", async () => {
  const auth = {
    handler: () => Promise.reject(new Error("synthetic outage")),
  } satisfies AuthHandler;
  const fetch = makeApiFetch({
    auth,
    apiFetch: () => Promise.resolve(new Response("unreachable")),
  });

  const response = await fetch(new Request("https://api.example/api/auth/ok"));

  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: "auth_handler_failed" });
});

test("auth adapter maps known invalid auth requests to 400", async () => {
  const error = new Error("Host is not in the allowed hosts list.");
  error.name = "BetterAuthError";
  const auth = {
    handler: () => Promise.reject(error),
  } satisfies AuthHandler;
  const fetch = makeApiFetch({
    auth,
    apiFetch: () => Promise.resolve(new Response("unreachable")),
  });

  const response = await fetch(new Request("https://api.example/api/auth/ok"));

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "invalid_auth_request" });
});
