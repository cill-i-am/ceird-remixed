import * as assert from "node:assert/strict";
import { test } from "node:test";
import {
  runAuthBackgroundTask,
  runWithBackgroundTaskContext,
  waitForRequestBackgroundTasks,
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

test("request cleanup does not wait indefinitely for stalled background tasks", async () => {
  const start = performance.now();

  await waitForRequestBackgroundTasks(
    [new Promise(() => undefined)],
    1,
  );

  assert.ok(performance.now() - start < 100);
});

test("request cleanup observes settled background tasks before closing resources", async () => {
  const events: Array<string> = [];

  await waitForRequestBackgroundTasks([
    Promise.resolve().then(() => {
      events.push("settled");
    }),
  ], 100);

  assert.deepEqual(events, ["settled"]);
});
