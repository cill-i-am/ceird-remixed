import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as Schema from "effect/Schema";
import { makeStageAuthConfig } from "../apps/api/src/auth-config.ts";
import {
  DbHealthResponse,
  HealthResponse,
  MeResponse,
} from "../packages/api-contract/src/index.ts";

const smokeUserName = "Smoke Test";
const smokeUserPassword = "Smoke-test-password-12345!";
const maxBodyPreviewLength = 700;
const requestTimeoutMillis = 15_000;
const transientRetryAttempts = 4;
const transientRetryBaseDelayMillis = 500;

const AuthOkResponseSchema = Schema.Struct({
  status: Schema.Literal("ok"),
});

const DeleteUserResponseSchema = Schema.Struct({
  success: Schema.Literal(true),
  message: Schema.Literal("User deleted"),
});

const decodeAuthOkResponse = Schema.decodeUnknownSync(AuthOkResponseSchema);
const decodeDbHealthResponse = Schema.decodeUnknownSync(DbHealthResponse);
const decodeDeleteUserResponse = Schema.decodeUnknownSync(
  DeleteUserResponseSchema,
);
const decodeHealthResponse = Schema.decodeUnknownSync(HealthResponse);
const decodeMeResponse = Schema.decodeUnknownSync(MeResponse);

/** Environment variables accepted by the deployed smoke runner. */
export type SmokeEnvironment = {
  readonly API_URL?: string;
  readonly APP_URL?: string;
  readonly SMOKE_API_URL?: string;
  readonly SMOKE_APP_URL?: string;
  readonly STAGE?: string;
};

/** Parsed deployed smoke target configuration. */
export type SmokeConfig = {
  readonly apiOrigin: URL;
  readonly appOrigin: URL;
  readonly stage: string;
};

type ResponseDecoder<T> = (value: unknown) => T;

type SmokeUserState = {
  readonly smokeEmail: string;
  authCookieHeader: string | undefined;
  cleanupCandidate: boolean;
};

type SmokeFetchOptions = {
  readonly retryTransientFailures?: boolean;
};

/** Resolve smoke target origins from explicit overrides or the Alchemy stage. */
export function resolveSmokeConfig(
  environment: SmokeEnvironment = process.env,
): SmokeConfig {
  const stage = readOptionalEnvironmentValue(environment.STAGE);
  const stageConfig = stage === undefined
    ? undefined
    : makeStageAuthConfig(stage);
  const appOrigin = readOptionalEnvironmentValue(environment.SMOKE_APP_URL) ??
    readOptionalEnvironmentValue(environment.APP_URL) ??
    stageConfig?.appOrigin;
  const apiOrigin = readOptionalEnvironmentValue(environment.SMOKE_API_URL) ??
    readOptionalEnvironmentValue(environment.API_URL) ??
    stageConfig?.apiOrigin;

  if (appOrigin === undefined || apiOrigin === undefined) {
    throw new Error(
      "Set STAGE, or set both SMOKE_APP_URL and SMOKE_API_URL, before running deployed smoke tests.",
    );
  }

  return {
    apiOrigin: parseSmokeOrigin(apiOrigin, "API_URL"),
    appOrigin: parseSmokeOrigin(appOrigin, "APP_URL"),
    stage: stage ?? "custom",
  };
}

/** Parse and constrain a smoke target origin. */
export function parseSmokeOrigin(value: string, label: string): URL {
  const url = new URL(value);

  if (url.protocol !== "https:" && !isLocalHttpOrigin(url)) {
    throw new Error(`${label} must use https except loopback local origins.`);
  }

  if (
    url.username.length > 0 ||
    url.password.length > 0 ||
    url.pathname !== "/" ||
    url.search.length > 0 ||
    url.hash.length > 0
  ) {
    throw new Error(`${label} must be an origin, not a full URL path.`);
  }

  return url;
}

/** Build a Cookie request header from Set-Cookie response headers. */
export function cookieHeaderFromSetCookie(
  setCookieHeaders: ReadonlyArray<string>,
): string | undefined {
  const cookiePairs = setCookieHeaders.flatMap((setCookieHeader) => {
    const cookiePair = parseCookiePair(setCookieHeader);

    return cookiePair === undefined ? [] : [cookiePair];
  });

  return cookiePairs.length === 0
    ? undefined
    : cookiePairs.map(([name, value]) => `${name}=${value}`).join("; ");
}

/** Redact sensitive auth material from error previews. */
export function redactSensitiveText(value: string): string {
  return value
    .replaceAll(smokeUserPassword, "[redacted-password]")
    .replace(/"token"\s*:\s*"[^"]*"/gu, '"token":"[redacted]"')
    .replace(
      /better-auth\.[^=;\s"]+=([^;\s"]+)/gu,
      "better-auth.[redacted]=[redacted]",
    );
}

/** Run the deployed app/API smoke test suite. */
export async function runDeployedSmokeTest(
  config: SmokeConfig = resolveSmokeConfig(),
): Promise<void> {
  const appOrigin = config.appOrigin.origin;
  const apiOrigin = config.apiOrigin.origin;
  const smokeUserState: SmokeUserState = {
    authCookieHeader: undefined,
    cleanupCandidate: false,
    smokeEmail: makeSmokeEmail(),
  };
  let smokeFailure: unknown;

  console.info(
    `Running deployed smoke tests for stage "${config.stage}" against ${appOrigin} and ${apiOrigin}`,
  );

  try {
    await runSmokeStep("app responds", async () => {
      const response = await smokeFetch(appOrigin, { method: "HEAD" }, {
        retryTransientFailures: true,
      });
      await expectStatus(response, [200, 204, 301, 302, 307, 308]);
    });

    await runSmokeStep("api health matches contract", async () => {
      const response = await smokeFetch(makeApiUrl(config, "/health"), undefined, {
        retryTransientFailures: true,
      });
      await expectStatus(response, [200]);
      await decodeJsonResponse(response, decodeHealthResponse, "health");
    });

    await runSmokeStep("better-auth ok route matches contract", async () => {
      const response = await smokeFetch(
        makeApiUrl(config, "/api/auth/ok"),
        {
          headers: {
            origin: appOrigin,
          },
        },
        { retryTransientFailures: true },
      );
      await expectStatus(response, [200]);
      await decodeJsonResponse(response, decodeAuthOkResponse, "auth ok");
    });

    await runSmokeStep("unauthenticated /me is rejected", async () => {
      const response = await smokeFetch(makeApiUrl(config, "/me"), {
        headers: {
          origin: appOrigin,
        },
      }, { retryTransientFailures: true });

      await expectStatus(response, [401]);
    });

    await runSmokeStep("cors preflight allows browser auth", async () => {
      const response = await smokeFetch(
        makeApiUrl(config, "/api/auth/sign-in/email"),
        {
          headers: {
            "access-control-request-headers": "content-type",
            "access-control-request-method": "POST",
            origin: appOrigin,
          },
          method: "OPTIONS",
        },
        { retryTransientFailures: true },
      );

      await expectStatus(response, [204]);
      expectCorsHeader(response, "access-control-allow-origin", appOrigin);
      expectCorsHeader(response, "access-control-allow-credentials", "true");
      expectHeaderListContains(response, "access-control-allow-methods", "POST");
      expectHeaderListContains(
        response,
        "access-control-allow-headers",
        "content-type",
      );
    });

    await runSmokeStep("email sign-up works", async () => {
      smokeUserState.cleanupCandidate = true;
      const response = await smokeFetch(
        makeApiUrl(config, "/api/auth/sign-up/email"),
        {
          body: JSON.stringify({
            email: smokeUserState.smokeEmail,
            name: smokeUserName,
            password: smokeUserPassword,
          }),
          headers: {
            "content-type": "application/json",
            origin: appOrigin,
          },
          method: "POST",
        },
      );

      await expectStatus(response, [200]);
    });

    const authCookieHeader = await runSmokeStep(
      "email sign-in returns session cookies",
      async () => signInSmokeUser(config, appOrigin, smokeUserState.smokeEmail),
    );
    smokeUserState.authCookieHeader = authCookieHeader;

    await runSmokeStep("authenticated /me matches contract", async () => {
      const response = await smokeFetch(makeApiUrl(config, "/me"), {
        headers: {
          cookie: authCookieHeader,
          origin: appOrigin,
        },
      }, { retryTransientFailures: true });

      await expectStatus(response, [200]);
      const body = await decodeJsonResponse(response, decodeMeResponse, "me");

      if (body.email !== smokeUserState.smokeEmail) {
        throw new Error(
          `Expected /me email ${smokeUserState.smokeEmail}, received ${body.email}.`,
        );
      }

      if (body.name !== smokeUserName) {
        throw new Error(
          `Expected /me name ${smokeUserName}, received ${body.name}.`,
        );
      }
    });

    await runSmokeStep("authenticated db health matches contract", async () => {
      const response = await smokeFetch(makeApiUrl(config, "/db/health"), {
        headers: {
          cookie: authCookieHeader,
          origin: appOrigin,
        },
      }, { retryTransientFailures: true });

      await expectStatus(response, [200]);
      await decodeJsonResponse(response, decodeDbHealthResponse, "db health");
    });
  } catch (error) {
    smokeFailure = error;
  }

  const cleanupFailure = await runCleanupAfterSmoke(
    config,
    appOrigin,
    smokeUserState,
  );

  if (smokeFailure !== undefined) {
    if (cleanupFailure !== undefined) {
      console.warn(
        `Smoke user cleanup also failed: ${errorMessage(cleanupFailure)}`,
      );
    }

    throw smokeFailure;
  }

  if (cleanupFailure !== undefined) {
    throw new Error(`smoke user cleanup: ${errorMessage(cleanupFailure)}`, {
      cause: cleanupFailure,
    });
  }
}

async function signInSmokeUser(
  config: SmokeConfig,
  appOrigin: string,
  smokeEmail: string,
): Promise<string> {
  const response = await smokeFetch(
    makeApiUrl(config, "/api/auth/sign-in/email"),
    {
      body: JSON.stringify({
        email: smokeEmail,
        password: smokeUserPassword,
      }),
      headers: {
        "content-type": "application/json",
        origin: appOrigin,
      },
      method: "POST",
    },
  );

  await expectStatus(response, [200]);

  const cookieHeader = cookieHeaderFromSetCookie(
    readSetCookieHeaders(response.headers),
  );

  if (cookieHeader === undefined) {
    throw new Error("Sign-in response did not include session cookies.");
  }

  return cookieHeader;
}

async function runCleanupAfterSmoke(
  config: SmokeConfig,
  appOrigin: string,
  state: SmokeUserState,
) {
  if (!state.cleanupCandidate) {
    return undefined;
  }

  try {
    const cookieHeader = state.authCookieHeader ??
      await signInSmokeUser(config, appOrigin, state.smokeEmail);
    const response = await smokeFetch(
      makeApiUrl(config, "/api/auth/delete-user"),
      {
        body: JSON.stringify({
          password: smokeUserPassword,
        }),
        headers: {
          "content-type": "application/json",
          cookie: cookieHeader,
          origin: appOrigin,
        },
        method: "POST",
      },
    );

    await expectStatus(response, [200]);
    await decodeJsonResponse(
      response,
      decodeDeleteUserResponse,
      "delete user",
    );
    console.info("[ok] smoke user cleanup deleted smoke account");

    return undefined;
  } catch (error) {
    return error;
  }
}

async function smokeFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
  options: SmokeFetchOptions = {},
): Promise<Response> {
  const attempts = options.retryTransientFailures === true
    ? transientRetryAttempts
    : 1;
  let lastFailure: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetchWithTimeout(input, init);

      if (
        attempt === attempts ||
        options.retryTransientFailures !== true ||
        !isRetryableStatus(response.status)
      ) {
        return response;
      }

      await discardResponseBody(response);
    } catch (error) {
      lastFailure = error;

      if (
        attempt === attempts ||
        options.retryTransientFailures !== true ||
        !isRetryableFetchError(error)
      ) {
        throw error;
      }
    }

    await sleep(retryDelayMillis(attempt));
  }

  throw new Error(`Retry loop exhausted: ${errorMessage(lastFailure)}`);
}

function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit) {
  return fetch(input, {
    ...init,
    signal: init?.signal ?? AbortSignal.timeout(requestTimeoutMillis),
  });
}

async function discardResponseBody(response: Response) {
  if (response.body === null) {
    return;
  }

  try {
    await response.body.cancel();
  } catch {
    // Discarding a retry response body is best effort only.
  }
}

async function runSmokeStep<T>(
  name: string,
  run: () => Promise<T>,
): Promise<T> {
  try {
    const result = await run();
    console.info(`[ok] ${name}`);

    return result;
  } catch (error) {
    throw new Error(`${name}: ${errorMessage(error)}`, { cause: error });
  }
}

async function expectStatus(
  response: Response,
  expectedStatuses: ReadonlyArray<number>,
): Promise<void> {
  if (expectedStatuses.includes(response.status)) {
    return;
  }

  const body = await readSafeBodyPreview(response);

  throw new Error(
    `Expected status ${expectedStatuses.join(" or ")}, received ${response.status}.${body}`,
  );
}

async function decodeJsonResponse<T>(
  response: Response,
  decode: ResponseDecoder<T>,
  label: string,
): Promise<T> {
  const text = await response.text();
  const value = parseJsonBody(text, label);

  try {
    return decode(value);
  } catch (error) {
    throw new Error(
      `${label} response did not match its contract. Body: ${redactBodyPreview(text)}`,
      { cause: error },
    );
  }
}

function parseJsonBody(text: string, label: string): unknown {
  try {
    const value: unknown = JSON.parse(text);

    return value;
  } catch (error) {
    throw new Error(
      `${label} response was not valid JSON. Body: ${redactBodyPreview(text)}`,
      { cause: error },
    );
  }
}

async function readSafeBodyPreview(response: Response): Promise<string> {
  const text = await response.text();

  return text.length === 0 ? "" : ` Body: ${redactBodyPreview(text)}`;
}

function redactBodyPreview(value: string): string {
  return redactSensitiveText(value).slice(0, maxBodyPreviewLength);
}

function expectCorsHeader(
  response: Response,
  headerName: string,
  expectedValue: string,
) {
  const actualValue = response.headers.get(headerName);

  if (actualValue !== expectedValue) {
    throw new Error(
      `Expected ${headerName} ${expectedValue}, received ${String(actualValue)}.`,
    );
  }
}

function expectHeaderListContains(
  response: Response,
  headerName: string,
  expectedValue: string,
) {
  const header = response.headers.get(headerName);

  if (header === null) {
    throw new Error(`Expected ${headerName} to be present.`);
  }

  const values = header
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value.length > 0);
  const expected = expectedValue.toLowerCase();

  if (!values.includes(expected)) {
    throw new Error(
      `Expected ${headerName} to include ${expectedValue}, received ${header}.`,
    );
  }
}

function readSetCookieHeaders(headers: Headers): ReadonlyArray<string> {
  const getSetCookie: unknown = Reflect.get(headers, "getSetCookie");

  if (typeof getSetCookie === "function") {
    const result: unknown = Reflect.apply(getSetCookie, headers, []);

    if (Array.isArray(result)) {
      return result.filter(isString);
    }
  }

  const setCookieHeader = headers.get("set-cookie");

  return setCookieHeader === null ? [] : [setCookieHeader];
}

function parseCookiePair(
  setCookieHeader: string,
): readonly [name: string, value: string] | undefined {
  const pair = setCookieHeader.split(";")[0]?.trim();

  if (pair === undefined || pair.length === 0) {
    return undefined;
  }

  const separatorIndex = pair.indexOf("=");

  if (separatorIndex <= 0) {
    return undefined;
  }

  return [pair.slice(0, separatorIndex), pair.slice(separatorIndex + 1)];
}

function isRetryableStatus(status: number) {
  return status === 404 ||
    status === 408 ||
    status === 425 ||
    status === 429 ||
    status >= 500;
}

function isRetryableFetchError(error: unknown) {
  return error instanceof Error;
}

function retryDelayMillis(attempt: number) {
  return Math.min(
    transientRetryBaseDelayMillis * 2 ** (attempt - 1),
    3_000,
  );
}

function sleep(milliseconds: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function makeApiUrl(config: SmokeConfig, pathname: string): URL {
  return new URL(pathname, config.apiOrigin);
}

function makeSmokeEmail() {
  return `smoke+${Date.now()}-${randomUUID()}@example.com`;
}

function readOptionalEnvironmentValue(value: string | undefined) {
  const trimmed = value?.trim();

  return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed;
}

function isLocalHttpOrigin(origin: URL) {
  return origin.protocol === "http:" &&
    (
      origin.hostname === "localhost" ||
      origin.hostname === "127.0.0.1" ||
      origin.hostname === "[::1]"
    );
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isEntrypoint() {
  const entrypoint = process.argv[1];

  return entrypoint !== undefined &&
    path.resolve(entrypoint) === fileURLToPath(import.meta.url);
}

if (isEntrypoint()) {
  runDeployedSmokeTest().catch((error: unknown) => {
    console.error(errorMessage(error));
    process.exitCode = 1;
  });
}
