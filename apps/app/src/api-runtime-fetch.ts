import { createIsomorphicFn } from "@tanstack/start-fn-stubs";

const getRuntimeApiFetchServer = createIsomorphicFn().server(async () => {
  const { runtimeApiFetchServer } = await import("./api-runtime-fetch.server");

  return runtimeApiFetchServer;
});

export const runtimeApiFetch: typeof fetch = async (input, init) => {
  if (typeof window !== "undefined") {
    return fetch(input, init);
  }

  const fetchImplementation = await getRuntimeApiFetchServer();
  if (fetchImplementation === undefined) {
    throw new Error("Server API fetch implementation is unavailable.");
  }

  return fetchImplementation(input, init);
};
