import { Api, HealthResponse, HelloResponse } from "@ceird/api-contract";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Etag from "effect/unstable/http/Etag";
import * as HttpPlatform from "effect/unstable/http/HttpPlatform";
import * as HttpRouter from "effect/unstable/http/HttpRouter";
import * as HttpServerRequest from "effect/unstable/http/HttpServerRequest";
import * as HttpApiBuilder from "effect/unstable/httpapi/HttpApiBuilder";
import * as HttpApiError from "effect/unstable/httpapi/HttpApiError";
import { Auth, makeAuthLive, type AuthInstance } from "./auth.ts";
import {
  applyCors,
  makeCorsPolicy,
  preflightCorsResponse,
  type CorsPolicy,
} from "./cors.ts";
import { DbHealth } from "./db-health.ts";

export type AuthHandler = Pick<AuthInstance, "handler">;

const helloResponse = HelloResponse.make({
  ok: true,
  message: "Hello from an Effect HttpApi on Cloudflare Workers.",
  stage: "dummy",
});

const handlers = HttpApiBuilder.group(Api, "Meta", (group) =>
  Effect.gen(function* () {
    const dbHealth = yield* DbHealth;
    const auth = yield* Auth;

    return group
      .handle("health", () =>
        Effect.succeed(
          HealthResponse.make({
            ok: true,
            service: "ceird-api",
            status: "healthy",
          }),
        ),
      )
      .handle("dbHealth", () =>
        dbHealth.check().pipe(
          Effect.tapError((error) =>
            Effect.logWarning(
              "Database health check failed.",
              "operation:",
              error.operation,
            ),
          ),
          Effect.catchTag(
            "DbHealthCheckFailed",
            () => Effect.fail(new HttpApiError.ServiceUnavailable({})),
          ),
        ),
      )
      .handle("root", () => Effect.succeed(helloResponse))
      .handle("hello", () => Effect.succeed(helloResponse))
      .handle("me", () =>
        Effect.gen(function* () {
          const request = yield* HttpServerRequest.HttpServerRequest;
          const principal = yield* auth
            .requirePrincipal(new Headers(request.headers))
            .pipe(
              Effect.catchTag(
                "Unauthenticated",
                () => Effect.fail(new HttpApiError.Unauthorized({})),
              ),
              Effect.catchTag("AuthSessionLookupFailed", (error) =>
                Effect.logWarning(
                  "Authenticated principal lookup failed.",
                  "error:",
                  error._tag,
                ).pipe(
                  Effect.andThen(() =>
                    Effect.fail(new HttpApiError.InternalServerError({})),
                  ),
                ),
              ),
              Effect.catchTag("AuthSessionParseFailed", (error) =>
                Effect.logWarning(
                  "Authenticated principal parse failed.",
                  "error:",
                  error._tag,
                ).pipe(
                  Effect.andThen(() =>
                    Effect.fail(new HttpApiError.InternalServerError({})),
                  ),
                ),
              ),
            );

          return principal.toView();
        }),
      );
  }),
);

export function makeHttpApiLayer(options: {
  readonly authLive: Layer.Layer<Auth>;
  readonly dbHealthLive: Layer.Layer<DbHealth>;
}) {
  const fileSystemLive = FileSystem.layerNoop({});
  const httpPlatformLive = HttpPlatform.layer.pipe(
    Layer.provide(fileSystemLive),
  );
  const platformLive = Layer.mergeAll(
    fileSystemLive,
    Path.layer,
    Etag.layer,
    httpPlatformLive,
  );
  const apiLive = HttpApiBuilder.layer(Api).pipe(
    Layer.provide(handlers),
    Layer.provide(options.authLive),
    Layer.provide(options.dbHealthLive),
    Layer.provide(platformLive),
  );

  return Layer.mergeAll(apiLive, platformLive);
}

export function makeHttpApiFetch(options: {
  readonly auth: AuthInstance;
  readonly authLive?: Layer.Layer<Auth>;
  readonly dbHealthLive: Layer.Layer<DbHealth>;
  readonly corsPolicy?: CorsPolicy;
}) {
  const { handler, dispose } = HttpRouter.toWebHandler(
    makeHttpApiLayer({
      authLive: options.authLive ?? makeAuthLive(options.auth),
      dbHealthLive: options.dbHealthLive,
    }),
    { disableLogger: true },
  );

  return {
    fetch: makeApiFetch({
      auth: options.auth,
      apiFetch: (request) => handler(request),
      ...(options.corsPolicy === undefined
        ? {}
        : { corsPolicy: options.corsPolicy }),
    }),
    dispose,
  };
}

export function makeApiFetch(options: {
  readonly auth: AuthHandler;
  readonly apiFetch: (request: Request) => Promise<Response>;
  readonly corsPolicy?: CorsPolicy;
}) {
  const corsPolicy = options.corsPolicy ?? makeCorsPolicy();

  return async (request: Request) => {
    const requestWithHost = ensureHostHeader(request);

    if (request.method === "OPTIONS") {
      return preflightCorsResponse(requestWithHost, corsPolicy);
    }

    const url = new URL(requestWithHost.url);
    const response = isAuthRoutePath(url.pathname)
      ? await handleAuthRequest(options.auth, requestWithHost, url)
      : await options.apiFetch(requestWithHost);

    return applyCors(requestWithHost, response, corsPolicy);
  };
}

export function makeAuthFetch(options: {
  readonly auth: AuthHandler;
  readonly corsPolicy?: CorsPolicy;
}) {
  const corsPolicy = options.corsPolicy ?? makeCorsPolicy();

  return async (request: Request) => {
    const requestWithHost = ensureHostHeader(request);

    if (request.method === "OPTIONS") {
      return preflightCorsResponse(requestWithHost, corsPolicy);
    }

    const url = new URL(requestWithHost.url);
    const response = await handleAuthRequest(options.auth, requestWithHost, url);

    return applyCors(requestWithHost, response, corsPolicy);
  };
}

export function isAuthRoutePath(pathname: string) {
  return pathname === "/api/auth" || pathname.startsWith("/api/auth/");
}

async function handleAuthRequest(
  auth: AuthHandler,
  request: Request,
  url: URL,
) {
  const response = await auth.handler(request).catch((cause: unknown) =>
    makeAuthHandlerFailureResponse(cause)
  );

  if (url.pathname !== "/api/auth/ok" || response.status !== 200) {
    return response;
  }

  return Response.json(
    { status: "ok" },
    {
      status: response.status,
      headers: response.headers,
    },
  );
}

function makeAuthHandlerFailureResponse(cause: unknown) {
  if (isKnownBadAuthRequest(cause)) {
    return Response.json(
      { error: "invalid_auth_request" },
      { status: 400 },
    );
  }

  console.warn("Better Auth handler failed.", {
    error: cause instanceof Error ? cause.name : "UnknownError",
  });

  return Response.json(
    { error: "auth_handler_failed" },
    { status: 500 },
  );
}

function isKnownBadAuthRequest(cause: unknown) {
  if (!(cause instanceof Error)) {
    return false;
  }

  return cause.name === "BetterAuthError" &&
    /allowed hosts|trusted origins|origin/i.test(cause.message);
}

function ensureHostHeader(request: Request) {
  if (request.headers.has("host")) {
    return request;
  }

  const headers = new Headers(request.headers);
  headers.set("host", new URL(request.url).host);

  return new Request(request, { headers });
}
