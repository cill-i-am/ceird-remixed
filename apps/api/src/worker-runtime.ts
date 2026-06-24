import type * as Redacted from "effect/Redacted";
import type { AuthConfig } from "./auth.ts";
import {
  runWithBackgroundTaskContext,
  waitForRequestBackgroundTasks,
} from "./background-tasks.ts";
import {
  applyCors,
  preflightCorsResponse,
  type CorsPolicy,
} from "./cors.ts";
import {
  isAuthRoutePath,
  makeAuthFetch,
  type AuthHandler,
} from "./http.ts";
import { classifyApiRequest } from "./request-routing.ts";

export type WorkerRuntimeConfig = {
  readonly authSecret: Redacted.Redacted<string>;
  readonly trustedOrigins: ReadonlyArray<string>;
  readonly allowedHosts: ReadonlyArray<string>;
  readonly corsPolicy: CorsPolicy;
  readonly protocol: "http" | "https";
  readonly useSecureCookies: boolean;
};

export type HttpApiRuntime = {
  readonly fetch: (request: Request) => Promise<Response>;
  readonly dispose: () => Promise<void>;
};

export type WorkerFetchOptions = {
  readonly waitUntil: (promise: Promise<unknown>) => void;
};

export type CleanupWarningFields = Readonly<Record<string, string>>;

export type WorkerRuntimeDeps<TDb, TAuth extends AuthHandler> = {
  readonly getConnectionString: () => Promise<Redacted.Redacted<string>>;
  readonly makeDb: (connectionString: Redacted.Redacted<string>) => TDb;
  readonly closeDb: (db: TDb) => Promise<void>;
  readonly createAuth: (db: TDb, config: AuthConfig) => TAuth;
  readonly makeHttpApiFetch: (options: {
    readonly auth: TAuth;
    readonly db: TDb;
    readonly corsPolicy: CorsPolicy;
  }) => HttpApiRuntime;
  readonly backgroundTaskHandler: (promise: Promise<unknown>) => void;
  readonly cleanupTimeoutMillis?: number;
  readonly warn?: (
    message: string,
    fields: CleanupWarningFields,
  ) => void;
};

export function makeWorkerFetch<TDb, TAuth extends AuthHandler>(options: {
  readonly config: WorkerRuntimeConfig;
  readonly deps: WorkerRuntimeDeps<TDb, TAuth>;
}) {
  return async (
    request: Request,
    fetchOptions: WorkerFetchOptions,
  ): Promise<Response> => {
    const publicResponse = handleRequestWithoutScopedRuntime(
      request,
      options.config.corsPolicy,
    );

    if (publicResponse !== undefined) {
      return publicResponse;
    }

    return handleRequestWithScopedRuntime({
      request,
      fetchOptions,
      config: options.config,
      deps: options.deps,
    });
  };
}

async function handleRequestWithScopedRuntime<TDb, TAuth extends AuthHandler>(
  options: {
    readonly request: Request;
    readonly fetchOptions: WorkerFetchOptions;
    readonly config: WorkerRuntimeConfig;
    readonly deps: WorkerRuntimeDeps<TDb, TAuth>;
  },
) {
  const backgroundTasks: Array<Promise<unknown>> = [];
  const connectionString = await options.deps.getConnectionString();
  const db = options.deps.makeDb(connectionString);
  let api: HttpApiRuntime | undefined;

  try {
    const auth = options.deps.createAuth(db, {
      secret: options.config.authSecret,
      trustedOrigins: options.config.trustedOrigins,
      allowedHosts: options.config.allowedHosts,
      protocol: options.config.protocol,
      useSecureCookies: options.config.useSecureCookies,
      backgroundTaskHandler: options.deps.backgroundTaskHandler,
    });
    const pathname = new URL(options.request.url).pathname;
    api = isAuthRoutePath(pathname)
      ? undefined
      : options.deps.makeHttpApiFetch({
          auth,
          db,
          corsPolicy: options.config.corsPolicy,
        });
    const fetch = api?.fetch ??
      makeAuthFetch({ auth, corsPolicy: options.config.corsPolicy });

    return await runWithBackgroundTaskContext(
      {
        waitUntil: (promise) => {
          backgroundTasks.push(promise);
          options.fetchOptions.waitUntil(promise);
        },
      },
      () => fetch(options.request),
    );
  } finally {
    options.fetchOptions.waitUntil(
      disposeScopedRequestRuntime({
        db,
        closeDb: options.deps.closeDb,
        backgroundTasks,
        ...(api === undefined ? {} : { api }),
        ...(options.deps.cleanupTimeoutMillis === undefined
          ? {}
          : { cleanupTimeoutMillis: options.deps.cleanupTimeoutMillis }),
        warn: options.deps.warn ?? defaultCleanupWarn,
      }),
    );
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

export async function disposeScopedRequestRuntime<TDb>(options: {
  readonly api?: HttpApiRuntime;
  readonly db: TDb;
  readonly closeDb: (db: TDb) => Promise<void>;
  readonly backgroundTasks: ReadonlyArray<Promise<unknown>>;
  readonly cleanupTimeoutMillis?: number;
  readonly warn: (
    message: string,
    fields: CleanupWarningFields,
  ) => void;
}) {
  const cleanupTimeoutMillis = options.cleanupTimeoutMillis ?? 1_000;
  await waitForRequestBackgroundTasks(
    options.backgroundTasks,
    cleanupTimeoutMillis,
  );

  if (options.api !== undefined) {
    await waitForCleanupStep({
      operation: "http-api-dispose",
      promise: options.api.dispose(),
      timeoutMillis: cleanupTimeoutMillis,
      warn: options.warn,
    });
  }

  await waitForCleanupStep({
    operation: "db-close",
    promise: options.closeDb(options.db),
    timeoutMillis: cleanupTimeoutMillis,
    warn: options.warn,
  });
}

function waitForCleanupStep(options: {
  readonly operation: string;
  readonly promise: Promise<void>;
  readonly timeoutMillis: number;
  readonly warn: (
    message: string,
    fields: CleanupWarningFields,
  ) => void;
}) {
  const observed = options.promise.then(
    () => "completed" as const,
    (cause) => {
      options.warn("API request cleanup step failed.", {
        error: cause instanceof Error ? cause.name : "UnknownError",
        operation: options.operation,
      });

      return "completed" as const;
    },
  );

  return Promise.race([
    observed,
    new Promise<"timed-out">((resolve) =>
      setTimeout(() => resolve("timed-out"), options.timeoutMillis)
    ),
  ]).then((result) => {
    if (result === "timed-out") {
      options.warn("API request cleanup step timed out.", {
        operation: options.operation,
      });
    }
  });
}

function defaultCleanupWarn(
  message: string,
  fields: CleanupWarningFields,
) {
  console.warn(message, fields);
}
