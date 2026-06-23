import * as assert from "node:assert/strict";
import { test } from "node:test";
import {
  runAuthBackgroundTask,
  runWithBackgroundTaskContext,
} from "./background-tasks.ts";

test("auth background tasks use the active Worker waitUntil context", () => {
  const tasks: Array<Promise<unknown>> = [];
  const task = Promise.resolve("done");

  runWithBackgroundTaskContext(
    {
      waitUntil: (promise) => {
        tasks.push(promise);
      },
    },
    () => runAuthBackgroundTask(task),
  );

  assert.deepEqual(tasks, [task]);
});

test("auth background tasks are ignored without a Worker context", () => {
  assert.doesNotThrow(() => runAuthBackgroundTask(Promise.resolve("done")));
});
