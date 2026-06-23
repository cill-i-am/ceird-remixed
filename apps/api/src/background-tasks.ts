import { AsyncLocalStorage } from "node:async_hooks";

export type BackgroundTaskContext = {
  readonly waitUntil: (promise: Promise<unknown>) => void;
};

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
