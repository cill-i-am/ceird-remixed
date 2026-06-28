/// <reference types="node" />

import assert from "node:assert/strict";
import test from "node:test";
import {
  makeLocalDevEnv,
  makeDefaultLocalAlchemyStage,
  makeLocalDevTopology,
  parseLocalServiceOrigin,
} from "./topology.ts";

test("builds stable service origins from branch-like stage input", () => {
  const topology = makeLocalDevTopology("codex/portless-local-dev");

  assert.equal(topology.stage, "codex-portless-local-dev");
  assert.equal(
    topology.app.origin.href,
    "https://app.codex-portless-local-dev.ceird.localhost/",
  );
  assert.equal(
    topology.api.origin.href,
    "https://api.codex-portless-local-dev.ceird.localhost/",
  );
  assert.equal(
    topology.authCookieDomain,
    "codex-portless-local-dev.ceird.localhost",
  );
  assert.equal(
    topology.authAllowedHosts,
    "api.codex-portless-local-dev.ceird.localhost",
  );
  assert.equal(
    topology.authTrustedOrigins,
    "https://app.codex-portless-local-dev.ceird.localhost",
  );
});

test("keeps local stage names separate from DNS-safe host segments", () => {
  const topology = makeLocalDevTopology("dev_cillian");

  assert.equal(topology.stage, "dev_cillian");
  assert.equal(
    topology.app.origin.href,
    "https://app.dev-cillian.ceird.localhost/",
  );
});

test("includes the proxy port when portless is not running on 443", () => {
  const topology = makeLocalDevTopology("dev_cillian", { proxyPort: 1355 });

  assert.equal(
    topology.app.origin.href,
    "https://app.dev-cillian.ceird.localhost:1355/",
  );
  assert.equal(
    topology.authTrustedOrigins,
    "https://app.dev-cillian.ceird.localhost:1355",
  );
  assert.equal(
    topology.authAllowedHosts,
    "api.dev-cillian.ceird.localhost:1355",
  );
  assert.equal(topology.authCookieDomain, "dev-cillian.ceird.localhost");
});

test("local dev env populates the Worker auth config names", () => {
  const topology = makeLocalDevTopology("dev_cillian", { proxyPort: 1355 });
  const env = makeLocalDevEnv(topology, {});

  assert.equal(env.CEIRD_AUTH_COOKIE_DOMAIN, "dev-cillian.ceird.localhost");
  assert.equal(
    env.CEIRD_AUTH_TRUSTED_ORIGINS,
    "https://app.dev-cillian.ceird.localhost:1355",
  );
  assert.equal(
    env.CEIRD_AUTH_ALLOWED_HOSTS,
    "api.dev-cillian.ceird.localhost:1355",
  );
  assert.equal(
    env.BETTER_AUTH_SECRET,
    "local-dev-secret-at-least-thirty-two-characters",
  );
});

test("derives default stages with a worktree discriminator", () => {
  assert.match(
    makeDefaultLocalAlchemyStage({
      branch: "codex/portless-local-dev",
      user: "cillian",
      worktreeName: "ceird-remixed 2",
    }),
    /^codex-portless-local-dev_cillian_ceird-remixed-2_[0-9a-f]{8}$/,
  );
});

test("keeps main-branch default stages user scoped", () => {
  assert.match(
    makeDefaultLocalAlchemyStage({
      branch: "main",
      user: "cillian",
      worktreeName: "ceird-remixed 2",
    }),
    /^dev_cillian_ceird-remixed-2_[0-9a-f]{8}$/,
  );
});

test("keeps long default stages collision resistant after truncation", () => {
  const longBranch = "codex/" + "very-long-branch-name-".repeat(8);
  const firstStage = makeDefaultLocalAlchemyStage({
    branch: longBranch,
    user: "cillian",
    worktreeName: "ceird-remixed 2",
  });
  const secondStage = makeDefaultLocalAlchemyStage({
    branch: longBranch,
    user: "other-user",
    worktreeName: "ceird-remixed 2",
  });

  assert.notEqual(firstStage, secondStage);
  assert.ok(firstStage.length <= 80);
  assert.ok(secondStage.length <= 80);
  assert.match(firstStage, /_[0-9a-f]{8}$/);
  assert.match(secondStage, /_[0-9a-f]{8}$/);
});

test("rejects non-portless local service origins", () => {
  assert.throws(() => parseLocalServiceOrigin("https://api.example.com/"));
  assert.throws(() =>
    parseLocalServiceOrigin("http://api.dev.ceird.localhost/"),
  );
  assert.throws(() =>
    parseLocalServiceOrigin("https://api.dev.ceird.localhost/path"),
  );
});
