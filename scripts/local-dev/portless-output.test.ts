/// <reference types="node" />

import assert from "node:assert/strict";
import test from "node:test";
import {
  parsePortlessProxyPort,
  portlessListHasAliasRoute,
} from "./portless-output.ts";
import { parseLocalTargetPort } from "./topology.ts";

test("parses an already-running proxy port", () => {
  assert.equal(
    parsePortlessProxyPort("Proxy is already running on port 1355."),
    1355,
  );
});

test("parses a newly-started proxy port", () => {
  assert.equal(
    parsePortlessProxyPort("HTTPS/2 proxy started on port 443"),
    443,
  );
});

test("ignores output without a proxy port", () => {
  assert.equal(parsePortlessProxyPort("Ensuring TLS certificates..."), undefined);
});

test("detects a registered static alias route", () => {
  assert.equal(
    portlessListHasAliasRoute(
      [
        "Active routes:",
        "  https://app.codex-test.ceird.localhost:1355  ->  localhost:1340  (alias)",
      ].join("\n"),
      {
        origin: "https://app.codex-test.ceird.localhost:1355",
        targetPort: parseLocalTargetPort(1340),
      },
    ),
    true,
  );
});

test("does not treat formatted URLs as registered static alias routes", () => {
  assert.equal(
    portlessListHasAliasRoute(
      "https://app.codex-test.ceird.localhost:1355",
      {
        origin: "https://app.codex-test.ceird.localhost:1355",
        targetPort: parseLocalTargetPort(1340),
      },
    ),
    false,
  );
});
