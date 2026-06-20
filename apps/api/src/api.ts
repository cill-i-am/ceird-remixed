import * as Schema from "effect/Schema";
import * as HttpApi from "effect/unstable/httpapi/HttpApi";
import * as HttpApiEndpoint from "effect/unstable/httpapi/HttpApiEndpoint";
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

/** Public HTTP contract for the API app. */
export const Api = HttpApi.make("CeirdApi").add(
  HttpApiGroup.make("Meta").add(
    HttpApiEndpoint.get("health", "/health", {
      success: HealthResponse,
    }),
    HttpApiEndpoint.get("root", "/", {
      success: HelloResponse,
    }),
    HttpApiEndpoint.get("hello", "/hello", {
      success: HelloResponse,
    }),
  ),
);
