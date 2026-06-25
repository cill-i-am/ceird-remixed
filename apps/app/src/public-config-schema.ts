import * as Schema from "effect/Schema";

const publicConfigRefreshIntervalMs = 5 * 60 * 1000;

const localLoopbackHostnames = new Set(["127.0.0.1", "[::1]", "localhost"]);

function isHttpsOrLocalLoopback(url: URL): url is URL {
  return url.protocol === "https:" ||
    (url.protocol === "http:" && localLoopbackHostnames.has(url.hostname));
}

function isOriginOnly(url: URL): url is URL {
  return (
    url.username === "" &&
    url.password === "" &&
    url.pathname === "/" &&
    url.search === "" &&
    url.hash === ""
  );
}

function isHttpsOrLocalOrigin(url: URL): url is URL {
  return isHttpsOrLocalLoopback(url) && isOriginOnly(url);
}

export const ApiBaseUrlSchema = Schema.URLFromString.pipe(
  Schema.refine(isHttpsOrLocalOrigin, {
    message:
      "Expected an HTTPS API origin, except for local loopback HTTP origins.",
  }),
  Schema.brand("ApiBaseUrl"),
);

export const AuthBaseUrlSchema = Schema.URLFromString.pipe(
  Schema.refine(isHttpsOrLocalOrigin, {
    message:
      "Expected an HTTPS auth origin, except for local loopback HTTP origins.",
  }),
  Schema.brand("AuthBaseUrl"),
);

/**
 * API base URL for the Cloudflare Worker API that backs this app.
 */
export type ApiBaseUrl = Schema.Schema.Type<typeof ApiBaseUrlSchema>;

/**
 * Better Auth base URL served by the API worker.
 */
export type AuthBaseUrl = Schema.Schema.Type<typeof AuthBaseUrlSchema>;

export const parseApiBaseUrl = Schema.decodeUnknownSync(ApiBaseUrlSchema);
export const parseAuthBaseUrl = Schema.decodeUnknownSync(AuthBaseUrlSchema);

export function deriveAuthBaseUrl(apiBaseUrl: ApiBaseUrl): AuthBaseUrl {
  return parseAuthBaseUrl(apiBaseUrl.origin);
}

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

export const parsePublicConfig = (input: unknown): PublicConfig =>
  Schema.decodeUnknownSync(PublicConfigSchema)(input);
export const encodePublicConfig = Schema.encodeSync(PublicConfigSchema);

export function pickPublicConfig({
  apiBaseUrl,
}: ServerConfig): PublicConfig {
  return { apiBaseUrl };
}
