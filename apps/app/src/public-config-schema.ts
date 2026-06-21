import * as Schema from "effect/Schema";

const publicConfigRefreshIntervalMs = 5 * 60 * 1000;

export const ApiBaseUrlSchema = Schema.URLFromString.pipe(
  Schema.brand("ApiBaseUrl"),
);

/**
 * API base URL for the Cloudflare Worker API that backs this app.
 */
export type ApiBaseUrl = Schema.Schema.Type<typeof ApiBaseUrlSchema>;

export const parseApiBaseUrl = Schema.decodeUnknownSync(ApiBaseUrlSchema);

/**
 * How long the app server and browser should cache runtime public config.
 */
export const publicConfigRefreshInterval = publicConfigRefreshIntervalMs;

export const ServerConfigSchema = Schema.Struct({
  apiBaseUrl: ApiBaseUrlSchema,
});

export type ServerConfig = Schema.Schema.Type<typeof ServerConfigSchema>;

export const PublicConfigSchema = ServerConfigSchema.mapFields(
  ({ apiBaseUrl }) => ({ apiBaseUrl }),
);

export type PublicConfig = Schema.Schema.Type<typeof PublicConfigSchema>;
export type PublicConfigEncoded = Schema.Codec.Encoded<
  typeof PublicConfigSchema
>;

export const parsePublicConfig = Schema.decodeUnknownSync(PublicConfigSchema);
export const encodePublicConfig = Schema.encodeSync(PublicConfigSchema);

export function pickPublicConfig({
  apiBaseUrl,
}: ServerConfig): PublicConfig {
  return { apiBaseUrl };
}
