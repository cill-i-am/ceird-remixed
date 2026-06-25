import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { makeStageAuthConfig } from "../apps/api/src/auth-config.ts";

const smokeUserPassword = "Smoke-test-password-12345!";
const maxBodyPreviewLength = 700;
const requestTimeoutMillis = 15_000;

export type SmokeEnvironment = {
  readonly API_URL?: string;
  readonly APP_URL?: string;
  readonly STAGE?: string;
};

export type SmokeConfig = {
  readonly apiOrigin: URL;
  readonly appOrigin: URL;
  readonly stage: string;
};

type JsonRecord = Readonly<Record<string, unknown>>;

export function resolveSmokeConfig(
  environment: SmokeEnvironment = process.env,
): SmokeConfig {
  const stage = readOptionalEnvironmentValue(environment.STAGE);
  const stageConfig = stage === undefined
    ? undefined
    : makeStageAuthConfig(stage);
  const appOrigin = readOptionalEnvironmentValue(environment.APP_URL) ??
    stageConfig?.appOrigin;
  const apiOrigin = readOptionalEnvironmentValue(environment.API_URL) ??
    stageConfig?.apiOrigin;

  if (appOrigin === undefined || apiOrigin === undefined) {
    throw new Error(
      "Set STAGE, or set both APP_URL and API_URL, before running deployed smoke tests.",
    );
  }

  return {
    apiOrigin: parseSmokeOrigin(apiOrigin, "API_URL"),
    appOrigin: parseSmokeOrigin(appOrigin, "APP_URL"),
    stage: stage ?? "custom",
  };
}

export function parseSmokeOrigin(value: string, label: string): URL {
  const url = new URL(value);

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(`${label} must be an http or https origin.`);
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

export function redactSensitiveText(value: string): string {
  return value
    .replace(/"token"\s*:\s*"[^"]*"/gu, '"token":"[redacted]"')
    .replace(
      /better-auth\.[^=;\s"]+=([^;\s"]+)/gu,
      "better-auth.[redacted]=[redacted]",
    );
}

export async function runDeployedSmokeTest(
  config: SmokeConfig = resolveSmokeConfig(),
): Promise<void> {
  const appOrigin = config.appOrigin.origin;
  const apiOrigin = config.apiOrigin.origin;
  const smokeEmail = makeSmokeEmail();

  console.info(
    `Running deployed smoke tests for stage "${config.stage}" against ${appOrigin} and ${apiOrigin}`,
  );

  await runSmokeStep("app responds", async () => {
    const response = await smokeFetch(appOrigin, { method: "HEAD" });
    await expectStatus(response, [200, 204, 301, 302, 307, 308]);
  });

  await runSmokeStep("api health responds", async () => {
    const response = await smokeFetch(makeApiUrl(config, "/health"));
    await expectStatus(response, [200]);
    const body = await readJsonRecord(response);

    expectField(body, "status", "healthy");
  });

  await runSmokeStep("better-auth ok route responds", async () => {
    const response = await smokeFetch(makeApiUrl(config, "/api/auth/ok"), {
      headers: {
        origin: appOrigin,
      },
    });
    await expectStatus(response, [200]);
    const body = await readJsonRecord(response);

    expectField(body, "status", "ok");
  });

  await runSmokeStep("unauthenticated /me is rejected", async () => {
    const response = await smokeFetch(makeApiUrl(config, "/me"), {
      headers: {
        origin: appOrigin,
      },
    });

    await expectStatus(response, [401]);
  });

  await runSmokeStep("cors preflight allows app origin", async () => {
    const response = await smokeFetch(makeApiUrl(config, "/me"), {
      headers: {
        "access-control-request-headers": "content-type",
        "access-control-request-method": "GET",
        origin: appOrigin,
      },
      method: "OPTIONS",
    });

    await expectStatus(response, [204]);
    const allowedOrigin = response.headers.get("access-control-allow-origin");

    if (allowedOrigin !== appOrigin) {
      throw new Error(
        `Expected access-control-allow-origin ${appOrigin}, received ${String(allowedOrigin)}.`,
      );
    }
  });

  await runSmokeStep("email sign-up works", async () => {
    const response = await smokeFetch(
      makeApiUrl(config, "/api/auth/sign-up/email"),
      {
        body: JSON.stringify({
          email: smokeEmail,
          name: "Smoke Test",
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
    async () => {
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
    },
  );

  await runSmokeStep("authenticated /me returns the smoke user", async () => {
    const response = await smokeFetch(makeApiUrl(config, "/me"), {
      headers: {
        cookie: authCookieHeader,
        origin: appOrigin,
      },
    });

    await expectStatus(response, [200]);
    const body = await readJsonRecord(response);
    expectField(body, "email", smokeEmail);
  });

  await runSmokeStep("authenticated db health works", async () => {
    const response = await smokeFetch(makeApiUrl(config, "/db/health"), {
      headers: {
        cookie: authCookieHeader,
        origin: appOrigin,
      },
    });

    await expectStatus(response, [200]);
    const body = await readJsonRecord(response);

    expectField(body, "ok", true);
  });
}

function smokeFetch(input: RequestInfo | URL, init?: RequestInit) {
  return fetch(input, {
    ...init,
    signal: init?.signal ?? AbortSignal.timeout(requestTimeoutMillis),
  });
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

async function readJsonRecord(response: Response): Promise<JsonRecord> {
  const text = await response.text();
  const value: unknown = JSON.parse(text);

  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Expected a JSON object, received ${redactBodyPreview(text)}.`);
  }

  return Object.fromEntries(Object.entries(value));
}

async function readSafeBodyPreview(response: Response): Promise<string> {
  const text = await response.text();

  return text.length === 0 ? "" : ` Body: ${redactBodyPreview(text)}`;
}

function redactBodyPreview(value: string): string {
  return redactSensitiveText(value).slice(0, maxBodyPreviewLength);
}

function expectField(
  value: object,
  fieldName: string,
  expectedValue: unknown,
): void {
  const fieldValue = readRecordField(value, fieldName);

  if (fieldValue !== expectedValue) {
    throw new Error(
      `Expected field ${fieldName} to equal ${String(expectedValue)}, received ${String(fieldValue)}.`,
    );
  }
}

function readRecordField(value: object, fieldName: string): unknown {
  return Object.getOwnPropertyDescriptor(value, fieldName)?.value;
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
