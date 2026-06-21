import * as Schema from "effect/Schema";

const ApiBaseUrlSchema = Schema.URLFromString.pipe(
  Schema.brand("ApiBaseUrl"),
);

/**
 * Parsed base URL for the Cloudflare Worker API that backs this app.
 */
export type ApiBaseUrl = Schema.Schema.Type<typeof ApiBaseUrlSchema>;

const parseApiBaseUrl = Schema.decodeUnknownSync(ApiBaseUrlSchema);

/**
 * Public configuration parsed from Vite-provided environment values.
 */
export const apiBaseUrl: ApiBaseUrl = parseApiBaseUrl(
  import.meta.env.VITE_API_URL,
);
