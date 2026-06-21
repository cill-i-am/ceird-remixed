import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import * as Config from "effect/Config";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import {
  ApiBaseUrlSchema,
  encodePublicConfig,
  parsePublicConfig,
  pickPublicConfig,
  publicConfigRefreshInterval,
  type PublicConfigEncoded,
  type ServerConfig,
} from "./public-config-schema";

export { parsePublicConfig } from "./public-config-schema";

class RuntimeConfig extends Context.Service<
  RuntimeConfig,
  {
    readonly loadServerConfig: Effect.Effect<ServerConfig, Config.ConfigError>;
    readonly loadPublicConfig: Effect.Effect<
      PublicConfigEncoded,
      Config.ConfigError
    >;
  }
>()("ceird/RuntimeConfig") {}

const loadServerConfig = Config.all({
  apiBaseUrl: Config.schema(ApiBaseUrlSchema, "API_URL"),
});

const loadPublicConfigFromSource = Effect.gen(function* () {
  const serverConfig = yield* loadServerConfig;
  return encodePublicConfig(pickPublicConfig(serverConfig));
});

let cachedPublicConfigEffect:
  | Effect.Effect<PublicConfigEncoded, Config.ConfigError>
  | undefined;

function getCachedPublicConfigEffect() {
  cachedPublicConfigEffect ??= Effect.runSync(
    Effect.cachedWithTTL(
      loadPublicConfigFromSource,
      publicConfigRefreshInterval,
    ),
  );

  return cachedPublicConfigEffect;
}

const loadCachedPublicConfig = Effect.suspend(() => {
  return getCachedPublicConfigEffect();
});

const RuntimeConfigLive = Layer.succeed(RuntimeConfig)({
  loadPublicConfig: loadCachedPublicConfig,
  loadServerConfig,
});

const loadPublicConfig = Effect.gen(function* () {
  const runtimeConfig = yield* RuntimeConfig;
  return yield* runtimeConfig.loadPublicConfig;
}).pipe(Effect.provide(RuntimeConfigLive));

export const getPublicConfig = createServerFn({ method: "GET" }).handler(() =>
  Effect.runPromise(loadPublicConfig),
);

export const publicConfigQueryOptions = queryOptions({
  queryKey: ["public-config"] as const,
  refetchInterval: publicConfigRefreshInterval,
  staleTime: publicConfigRefreshInterval,
  queryFn: async () =>
    encodePublicConfig(parsePublicConfig(await getPublicConfig())),
});
