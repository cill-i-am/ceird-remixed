/// <reference types="node" />

import assert from "node:assert/strict";
import test from "node:test";
import {
  commandIsAlchemyDevStage,
  parseLocalProcessLine,
} from "./processes.ts";
import { parseLocalAlchemyStage } from "./topology.ts";

test("parses local process rows from ps output", () => {
  assert.deepEqual(
    parseLocalProcessLine(
      "  12345     222  12345 pnpm exec alchemy dev alchemy.run.ts --stage dev",
    ),
    {
      command: "pnpm exec alchemy dev alchemy.run.ts --stage dev",
      parentPid: 222,
      pid: 12345,
      processGroupId: 12345,
    },
  );
  assert.equal(parseLocalProcessLine("not process output"), undefined);
});

test("matches alchemy dev commands for the exact local stage", () => {
  const stage = parseLocalAlchemyStage("dev_cillian");

  assert.equal(
    commandIsAlchemyDevStage(
      "pnpm exec alchemy dev alchemy.run.ts --stage dev_cillian",
      stage,
    ),
    true,
  );
  assert.equal(
    commandIsAlchemyDevStage(
      "node /repo/node_modules/.pnpm/alchemy@2.0.0/node_modules/alchemy/bin.js dev alchemy.run.ts --stage=dev_cillian",
      stage,
    ),
    true,
  );
});

test("does not match stages that share a prefix", () => {
  const stage = parseLocalAlchemyStage("dev");

  assert.equal(
    commandIsAlchemyDevStage(
      "pnpm exec alchemy dev alchemy.run.ts --stage dev_cillian",
      stage,
    ),
    false,
  );
  assert.equal(
    commandIsAlchemyDevStage(
      "pnpm exec alchemy dev alchemy.run.ts --stage=dev2",
      stage,
    ),
    false,
  );
});

test("does not match non-dev alchemy stack commands", () => {
  const stage = parseLocalAlchemyStage("dev");

  assert.equal(
    commandIsAlchemyDevStage(
      "pnpm exec alchemy deploy alchemy.run.ts --stage dev",
      stage,
    ),
    false,
  );
  assert.equal(
    commandIsAlchemyDevStage(
      "pnpm exec alchemy plan alchemy.run.ts --stage=dev",
      stage,
    ),
    false,
  );
});
