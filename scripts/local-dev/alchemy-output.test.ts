/// <reference types="node" />

import assert from "node:assert/strict";
import test from "node:test";
import {
  createAlchemyOutputObserver,
  parseAlchemyLocalTargetLine,
} from "./alchemy-output.ts";

test("parses Alchemy local target URLs from stack output lines", () => {
  const target = parseAlchemyLocalTargetLine(
    "  localApiTargetUrl: 'http://127.0.0.1:8787',",
  );

  assert.equal(target?.serviceName, "api");
  assert.equal(target?.outputKey, "localApiTargetUrl");
  assert.equal(target?.url.href, "http://127.0.0.1:8787/");
  assert.equal(target?.port, 8787);
});

test("ignores non-target output lines", () => {
  assert.equal(parseAlchemyLocalTargetLine("  apiUrl: 'https://api.test'"), undefined);
  assert.equal(
    parseAlchemyLocalTargetLine(
      "prefix localApiTargetUrl: 'http://127.0.0.1:8787', suffix",
    ),
    undefined,
  );
  assert.equal(
    parseAlchemyLocalTargetLine(
      "  localApiTargetUrl: 'https://api.example.com:443',",
    ),
    undefined,
  );
});

test("parses target output split across chunks", () => {
  const targets: Array<string> = [];
  const observe = createAlchemyOutputObserver((target) => {
    targets.push(`${target.serviceName}:${target.port}`);
  });

  observe("  localAppTargetUrl: 'http://loc");
  observe("alhost:1338',\n  localApiTargetUrl: 'http://localhost:8787',\n");

  assert.deepEqual(targets, ["app:1338", "api:8787"]);
});
