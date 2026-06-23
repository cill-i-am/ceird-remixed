import * as Schema from "effect/Schema";
import * as HttpApi from "effect/unstable/httpapi/HttpApi";
import * as HttpApiEndpoint from "effect/unstable/httpapi/HttpApiEndpoint";
import * as HttpApiError from "effect/unstable/httpapi/HttpApiError";
import * as HttpApiGroup from "effect/unstable/httpapi/HttpApiGroup";

/** Successful response from the API health endpoint. */
export class HealthResponse extends Schema.Class<HealthResponse>(
  "HealthResponse",
)({
  ok: Schema.Literal(true),
  service: Schema.Literal("ceird-api"),
  status: Schema.Literal("healthy"),
}) {}

/** Successful response from the API hello endpoints. */
export class HelloResponse extends Schema.Class<HelloResponse>("HelloResponse")({
  ok: Schema.Literal(true),
  message: Schema.String,
  stage: Schema.Literal("dummy"),
}) {}

/** Successful response from the API database health endpoint. */
export class DbHealthResponse extends Schema.Class<DbHealthResponse>(
  "DbHealthResponse",
)({
  ok: Schema.Literal(true),
  service: Schema.Literal("ceird-api"),
  database: Schema.Struct({
    provider: Schema.Literal("neon-postgres"),
    transport: Schema.Literal("cloudflare-hyperdrive"),
  }),
}) {}

export const UserIdSchema = Schema.String.pipe(Schema.brand("UserId"));
export type UserId = typeof UserIdSchema.Type;

/** Authenticated first-party principal view. */
export class MeResponse extends Schema.Class<MeResponse>("MeResponse")({
  id: UserIdSchema,
  email: Schema.String,
  name: Schema.String,
}) {}

/** Public HTTP contract for the Ceird API. */
export const Api = HttpApi.make("CeirdApi").add(
  HttpApiGroup.make("Meta").add(
    HttpApiEndpoint.get("health", "/health", {
      success: HealthResponse,
    }),
    HttpApiEndpoint.get("dbHealth", "/db/health", {
      success: DbHealthResponse,
      error: HttpApiError.ServiceUnavailable,
    }),
    HttpApiEndpoint.get("root", "/", {
      success: HelloResponse,
    }),
    HttpApiEndpoint.get("hello", "/hello", {
      success: HelloResponse,
    }),
    HttpApiEndpoint.get("me", "/me", {
      success: MeResponse,
      error: [
        HttpApiError.Unauthorized,
        HttpApiError.InternalServerError,
      ],
    }),
  ),
);
