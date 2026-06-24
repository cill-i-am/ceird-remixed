import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import { WorkerExecutionContext } from "alchemy/Cloudflare/Workers";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type * as Redacted from "effect/Redacted";
import * as HttpEffect from "effect/unstable/http/HttpEffect";
import {
  BetterAuthSecretSchema,
  makeStageAuthConfig,
  parseHostList,
  parseOriginList,
} from "./auth-config.ts";
import { createAuth } from "./auth.ts";
import {
  runAuthBackgroundTask,
  runWithBackgroundTaskContext,
  waitForRequestBackgroundTasks,
} from "./background-tasks.ts";
import {
  applyCors,
  makeCorsPolicy,
  preflightCorsResponse,
  type CorsPolicy,
} from "./cors.ts";
import { closeApiDb, makeApiDb, makeDbHealthLiveFromDb } from "./db.ts";
import { ApiHyperdrive } from "./db-infra.ts";
import { makeHttpApiFetch } from "./http.ts";
import { classifyApiRequest } from "./request-routing.ts";

export default class ApiWorker extends Cloudflare.Worker<ApiWorker>()(
  "Api",
  {
    main: import.meta.filename,
    url: true,
    compatibility: {
      flags: ["nodejs_compat"],
    },
    observability: {
      enabled: true,
      logs: {
        enabled: true,
        invocationLogs: true,
      },
    },
  },
  Effect.gen(function* () {
    const hyperdrive = yield* Cloudflare.Hyperdrive.bind(ApiHyperdrive);
    const stage = yield* Alchemy.Stage;
    const alchemyContext = yield* Alchemy.AlchemyContext;
    const stageAuthConfig = makeStageAuthConfig(stage);
    const authSecret = yield* Config.schema(
      BetterAuthSecretSchema,
      "BETTER_AUTH_SECRET",
    );
    const configuredTrustedOrigins = yield* Config.string(
      "CEIRD_AUTH_TRUSTED_ORIGINS",
    ).pipe(Config.option);
    const configuredAllowedHosts = yield* Config.string(
      "CEIRD_AUTH_ALLOWED_HOSTS",
    ).pipe(Config.option);
    const trustedOrigins = unique([
      stageAuthConfig.appOrigin,
      ...parseOriginList(Option.getOrUndefined(configuredTrustedOrigins), {
        allowLocalHttp: alchemyContext.dev,
      }),
    ]);
    const allowedHosts = unique(
      [
        stageAuthConfig.apiHost,
        ...parseHostList(Option.getOrUndefined(configuredAllowedHosts)),
      ].map((host) => host.toLowerCase()),
    );
    const corsPolicy = makeCorsPolicy({
      credentialedOrigins: trustedOrigins,
    });

    return {
      fetch: Effect.gen(function* () {
        const executionContext = yield* WorkerExecutionContext;
        const connectionString = yield* hyperdrive.connectionString;

        return yield* HttpEffect.fromWebHandler((request) => {
          const publicResponse = handleRequestWithoutScopedRuntime(
            request,
            corsPolicy,
          );

          if (publicResponse !== undefined) {
            return Promise.resolve(publicResponse);
          }

          return handleRequestWithScopedRuntime({
            request,
            connectionString,
            authSecret,
            trustedOrigins,
            allowedHosts,
            corsPolicy,
            waitUntil: (promise) => executionContext.waitUntil(promise),
          });
        });
      }),
    };
  }).pipe(Effect.provide(Cloudflare.HyperdriveBindingLive)),
) {}

function unique(values: ReadonlyArray<string>): ReadonlyArray<string> {
  return [...new Set(values)];
}

async function handleRequestWithScopedRuntime(options: {
  readonly request: Request;
  readonly connectionString: Redacted.Redacted<string>;
  readonly authSecret: Redacted.Redacted<string>;
  readonly trustedOrigins: ReadonlyArray<string>;
  readonly allowedHosts: ReadonlyArray<string>;
  readonly corsPolicy: CorsPolicy;
  readonly waitUntil: (promise: Promise<unknown>) => void;
}) {
  const backgroundTasks: Array<Promise<unknown>> = [];
  const db = makeApiDb(options.connectionString);
  const auth = createAuth(db, {
    secret: options.authSecret,
    trustedOrigins: options.trustedOrigins,
    allowedHosts: options.allowedHosts,
    protocol: "https",
    useSecureCookies: true,
    backgroundTaskHandler: runAuthBackgroundTask,
  });
  const api = makeHttpApiFetch({
    auth,
    dbHealthLive: makeDbHealthLiveFromDb(db),
    corsPolicy: options.corsPolicy,
  });

  try {
    return await runWithBackgroundTaskContext(
      {
        waitUntil: (promise) => {
          backgroundTasks.push(promise);
          options.waitUntil(promise);
        },
      },
      () => api.fetch(options.request),
    );
  } finally {
    options.waitUntil(disposeScopedRequestRuntime({ api, db, backgroundTasks }));
  }
}

function handleRequestWithoutScopedRuntime(
  request: Request,
  corsPolicy: CorsPolicy,
) {
  const route = classifyApiRequest(request);

  switch (route._tag) {
    case "preflight":
      return preflightCorsResponse(request, corsPolicy);
    case "public":
      return applyCors(request, makePublicResponse(route.path), corsPolicy);
    case "scoped":
      return undefined;
  }
}

function makePublicResponse(path: "/" | "/health" | "/hello") {
  if (path === "/health") {
    return Response.json({
      ok: true,
      service: "ceird-api",
      status: "healthy",
    });
  }

  return Response.json({
    ok: true,
    message: "Hello from an Effect HttpApi on Cloudflare Workers.",
    stage: "dummy",
  });
}

async function disposeScopedRequestRuntime(options: {
  readonly api: { readonly dispose: () => Promise<void> };
  readonly db: Parameters<typeof closeApiDb>[0];
  readonly backgroundTasks: ReadonlyArray<Promise<unknown>>;
}) {
  await waitForRequestBackgroundTasks(options.backgroundTasks);

  try {
    await options.api.dispose();
  } catch (cause) {
    console.warn("API request router disposal failed.", {
      error: cause instanceof Error ? cause.name : "UnknownError",
    });
  } finally {
    try {
      await closeApiDb(options.db);
    } catch (cause) {
      console.warn("API request database pool close failed.", {
        error: cause instanceof Error ? cause.name : "UnknownError",
      });
    }
  }
}
