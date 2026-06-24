import { AsyncLocalStorage } from "node:async_hooks";

export type BackgroundTaskContext = {
  readonly waitUntil: (promise: Promise<unknown>) => void;
};

const requestCleanupBackgroundTaskWaitMillis = 1_000;
const backgroundTaskStorage = new AsyncLocalStorage<BackgroundTaskContext>();

export function runWithBackgroundTaskContext<T>(
  context: BackgroundTaskContext,
  run: () => T,
): T {
  return backgroundTaskStorage.run(context, run);
}

export function runAuthBackgroundTask(promise: Promise<unknown>) {
  backgroundTaskStorage.getStore()?.waitUntil(promise);
}

export async function waitForRequestBackgroundTasks(
  tasks: ReadonlyArray<Promise<unknown>>,
  timeoutMillis = requestCleanupBackgroundTaskWaitMillis,
) {
  if (tasks.length === 0) {
    return;
  }

  await Promise.race([
    Promise.allSettled(tasks),
    new Promise((resolve) => setTimeout(resolve, timeoutMillis)),
  ]);
}
