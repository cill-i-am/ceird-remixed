import "@tanstack/react-start/server-only";
import { env } from "cloudflare:workers";
import * as Effect from "effect/Effect";
import {
  encodePublicConfig,
  parseApiBaseUrl,
  pickPublicConfig,
  publicConfigRefreshInterval,
  type PublicConfigEncoded,
} from "./public-config-schema";

/**
 * Runtime bindings required to derive the browser-safe public app config.
 */
export interface PublicConfigRuntimeEnv {
  readonly API_URL: string;
}

/**
 * Parse runtime bindings into the encoded public config sent to the browser.
 */
export function loadPublicConfigFromEnv({
  API_URL,
}: PublicConfigRuntimeEnv): PublicConfigEncoded {
  return encodePublicConfig(
    pickPublicConfig({
      apiBaseUrl: parseApiBaseUrl(API_URL),
    }),
  );
}

const loadPublicConfigFromSource = Effect.sync(() =>
  loadPublicConfigFromEnv(env),
);

let cachedPublicConfigEffect:
  | Effect.Effect<PublicConfigEncoded>
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

/**
 * Load the browser-safe public config from the current Cloudflare runtime.
 */
export const loadPublicConfigFromRuntime = Effect.suspend(() => {
  return getCachedPublicConfigEffect();
});
