import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import * as Effect from "effect/Effect";
import {
  encodePublicConfig,
  parsePublicConfig,
  publicConfigRefreshInterval,
} from "./public-config-schema";

export {
  deriveAuthBaseUrl,
  parsePublicConfig,
} from "./public-config-schema";

/**
 * Server function that returns the browser-safe runtime public config.
 */
export const getPublicConfig = createServerFn({ method: "GET" }).handler(
  async () => {
    const { loadPublicConfigFromRuntime } = await import(
      "./public-config.server"
    );

    return Effect.runPromise(loadPublicConfigFromRuntime);
  },
);

/**
 * TanStack Query options for loading runtime public config in routes/components.
 */
export const publicConfigQueryOptions = queryOptions({
  queryKey: ["public-config"] as const,
  refetchInterval: publicConfigRefreshInterval,
  staleTime: publicConfigRefreshInterval,
  queryFn: async () =>
    encodePublicConfig(parsePublicConfig(await getPublicConfig())),
});
