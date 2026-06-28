import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";

const wildcardPattern = /[*?{}()]/u;
const betterAuthSecretMinLength = 32;
const authCookieDomainPattern =
  /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/u;

export const BetterAuthSecretSchema = Schema.RedactedFromValue(
  Schema.String.check(Schema.isMinLength(betterAuthSecretMinLength)),
);

/**
 * Exact host used by Better Auth host checks and stage routing.
 */
export const AuthHostSchema = Schema.String.pipe(
  Schema.refine(isExactHost, {
    message: "Expected an exact host.",
  }),
  Schema.brand("AuthHost"),
);

/**
 * Parsed exact auth host.
 */
export type AuthHost = Schema.Schema.Type<typeof AuthHostSchema>;

/**
 * Parse an exact host for Better Auth and stage routing.
 */
export const parseAuthHost = Schema.decodeUnknownSync(AuthHostSchema);

/**
 * Exact HTTP(S) origin used by Better Auth trusted origins and CORS.
 */
export const AuthOriginSchema = Schema.String.pipe(
  Schema.refine(isExactOrigin, {
    message: "Expected an exact HTTP(S) origin.",
  }),
  Schema.brand("AuthOrigin"),
);

/**
 * Parsed exact auth origin.
 */
export type AuthOrigin = Schema.Schema.Type<typeof AuthOriginSchema>;

/**
 * Parse an exact HTTP(S) origin for Better Auth and CORS.
 */
export const parseAuthOrigin = Schema.decodeUnknownSync(AuthOriginSchema);

/**
 * Exact parent cookie domain shared by sibling app/API auth hosts.
 */
export const AuthCookieDomainSchema = Schema.String.check(
  Schema.isPattern(authCookieDomainPattern, {
    expected: "exact cookie domain",
    identifier: "AuthCookieDomain",
  }),
).pipe(Schema.brand("AuthCookieDomain"));

/**
 * Parsed Better Auth cookie domain.
 */
export type AuthCookieDomain = Schema.Schema.Type<
  typeof AuthCookieDomainSchema
>;

export type StageAuthConfig = {
  readonly apiHost: AuthHost;
  readonly apiOrigin: AuthOrigin;
  readonly appHost: AuthHost;
  readonly appOrigin: AuthOrigin;
  readonly sharedCookieDomain: AuthCookieDomain;
};

const productionApiHost = parseAuthHost("api.ceird.app");
const productionAppHost = parseAuthHost("app.ceird.app");
const productionAppOrigin = parseAuthOrigin(`https://${productionAppHost}`);
const ceirdCookieDomain = parseAuthCookieDomain("ceird.app", {
  apiHost: productionApiHost,
  appOrigin: productionAppOrigin,
});

export function makeStageAuthConfig(stage: string): StageAuthConfig {
  if (stage === "prod") {
    return {
      apiHost: productionApiHost,
      apiOrigin: parseAuthOrigin(`https://${productionApiHost}`),
      appHost: productionAppHost,
      appOrigin: productionAppOrigin,
      sharedCookieDomain: ceirdCookieDomain,
    };
  }

  const segment = makeStageHostSegment(stage);
  const apiHost = parseAuthHost(`api-${segment}.ceird.app`);
  const appHost = parseAuthHost(`app-${segment}.ceird.app`);

  return {
    apiHost,
    apiOrigin: parseAuthOrigin(`https://${apiHost}`),
    appHost,
    appOrigin: parseAuthOrigin(`https://${appHost}`),
    sharedCookieDomain: ceirdCookieDomain,
  };
}

/**
 * Return true for local Alchemy stages that may consume local auth env.
 */
export function isLocalAuthStage(stage: string): boolean {
  return stage !== "prod" && !/^pr-[0-9]+$/u.test(stage);
}

export function parseOriginList(
  input: string | undefined,
  options: { readonly allowLocalHttp?: boolean } = {},
): ReadonlyArray<AuthOrigin> {
  return splitConfigList(input).map((origin) => {
    if (wildcardPattern.test(origin)) {
      throw new Error(
        `CEIRD_AUTH_TRUSTED_ORIGINS must be exact origins, not wildcard patterns: ${origin}`,
      );
    }

    const parsed = new URL(origin);

    if (
      parsed.protocol !== "https:" &&
      !(options.allowLocalHttp === true && isLocalHttpOrigin(parsed))
    ) {
      throw new Error(
        `CEIRD_AUTH_TRUSTED_ORIGINS must use https except loopback local origins: ${origin}`,
      );
    }

    if (
      parsed.username.length > 0 ||
      parsed.password.length > 0 ||
      parsed.pathname !== "/" ||
      parsed.search.length > 0 ||
      parsed.hash.length > 0
    ) {
      throw new Error(
        `CEIRD_AUTH_TRUSTED_ORIGINS must contain origins only: ${origin}`,
      );
    }

    return parseAuthOrigin(parsed.origin);
  });
}

export function parseHostList(
  input: string | undefined,
  options: { readonly allowLocalHosts?: boolean } = {},
): ReadonlyArray<AuthHost> {
  return splitConfigList(input).map((host) => {
    if (wildcardPattern.test(host)) {
      throw new Error(
        `CEIRD_AUTH_ALLOWED_HOSTS must be exact hostnames, not wildcard patterns: ${host}`,
      );
    }

    const parsed = new URL(host.includes("://") ? host : `https://${host}`);
    if (
      parsed.protocol !== "https:" &&
      !(options.allowLocalHosts === true && isLocalHost(parsed.hostname))
    ) {
      throw new Error(
        `CEIRD_AUTH_ALLOWED_HOSTS must use https when a protocol is provided: ${host}`,
      );
    }
    if (
      options.allowLocalHosts !== true &&
      isLocalHost(parsed.hostname)
    ) {
      throw new Error(
        `CEIRD_AUTH_ALLOWED_HOSTS cannot contain local hosts in deployed config: ${host}`,
      );
    }

    if (
      parsed.username.length > 0 ||
      parsed.password.length > 0 ||
      parsed.pathname !== "/" ||
      parsed.search.length > 0 ||
      parsed.hash.length > 0 ||
      parsed.host.length === 0
    ) {
      throw new Error(
        `CEIRD_AUTH_ALLOWED_HOSTS must contain hostnames only: ${host}`,
      );
    }

    return parseAuthHost(parsed.host.toLowerCase());
  });
}

/**
 * Parse and verify that a cookie domain is the app/API shared parent.
 */
export function parseAuthCookieDomain(
  input: string,
  scope: {
    readonly apiHost: string;
    readonly appOrigin: string;
  },
): AuthCookieDomain {
  const trimmed = input.trim();

  if (wildcardPattern.test(trimmed)) {
    throw new Error(
      `CEIRD_AUTH_COOKIE_DOMAIN must be an exact domain, not a wildcard pattern: ${input}`,
    );
  }

  const domain = Schema.decodeUnknownSync(AuthCookieDomainSchema)(
    trimmed.toLowerCase(),
  );
  const apiHostname = parseConfiguredHost(scope.apiHost, "API host");
  const appHostname = parseConfiguredOriginHost(scope.appOrigin, "app origin");
  const expectedCookieDomain = makeSharedCookieDomain({
    apiHostname,
    appHostname,
  });

  if (domain !== expectedCookieDomain) {
    throw new Error(
      `CEIRD_AUTH_COOKIE_DOMAIN must equal the shared parent domain ${expectedCookieDomain} for API host ${apiHostname} and app origin host ${appHostname}: ${input}`,
    );
  }

  return domain;
}

/**
 * Parse local cookie-domain config for one exact local app/API host pair.
 */
export function parseLocalAuthCookieDomain(
  input: string | undefined,
  config: {
    readonly apiHosts: ReadonlyArray<string>;
    readonly appOrigins: ReadonlyArray<string>;
  },
): AuthCookieDomain | undefined {
  if (input === undefined) {
    return undefined;
  }

  const apiHost = exactlyOne(
    config.apiHosts,
    "CEIRD_AUTH_ALLOWED_HOSTS",
    "CEIRD_AUTH_COOKIE_DOMAIN",
  );
  const appOrigin = exactlyOne(
    config.appOrigins,
    "CEIRD_AUTH_TRUSTED_ORIGINS",
    "CEIRD_AUTH_COOKIE_DOMAIN",
  );

  return parseAuthCookieDomain(input, { apiHost, appOrigin });
}

export function parseBetterAuthSecret(
  input: string,
): Redacted.Redacted<string> {
  return Schema.decodeUnknownSync(BetterAuthSecretSchema)(input);
}

function splitConfigList(input: string | undefined): ReadonlyArray<string> {
  if (input === undefined) {
    return [];
  }

  return input
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

function exactlyOne(
  values: ReadonlyArray<string>,
  valueName: string,
  requiringName: string,
) {
  if (values.length !== 1) {
    throw new Error(
      `${requiringName} requires exactly one ${valueName} entry in local stages.`,
    );
  }

  const value = values[0];

  if (value === undefined) {
    throw new Error(
      `${requiringName} requires exactly one ${valueName} entry in local stages.`,
    );
  }

  return value;
}

function isLocalHttpOrigin(origin: URL) {
  return origin.protocol === "http:" &&
    isLocalHost(origin.hostname);
}

function isLocalHost(hostname: string) {
  return hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]";
}

function parseConfiguredHost(input: string, label: string) {
  const parsed = new URL(input.includes("://") ? input : `https://${input}`);

  if (
    parsed.username.length > 0 ||
    parsed.password.length > 0 ||
    parsed.pathname !== "/" ||
    parsed.search.length > 0 ||
    parsed.hash.length > 0 ||
    parsed.hostname.length === 0
  ) {
    throw new Error(`Invalid ${label} for auth cookie domain: ${input}`);
  }

  return parsed.hostname.toLowerCase();
}

function parseConfiguredOriginHost(input: string, label: string) {
  const parsed = new URL(input);

  if (
    parsed.username.length > 0 ||
    parsed.password.length > 0 ||
    parsed.pathname !== "/" ||
    parsed.search.length > 0 ||
    parsed.hash.length > 0 ||
    parsed.hostname.length === 0
  ) {
    throw new Error(`Invalid ${label} for auth cookie domain: ${input}`);
  }

  return parsed.hostname.toLowerCase();
}

function makeSharedCookieDomain({
  apiHostname,
  appHostname,
}: {
  readonly apiHostname: string;
  readonly appHostname: string;
}): AuthCookieDomain {
  const apiParentDomain = parentDomain(apiHostname, "API host");
  const appParentDomain = parentDomain(appHostname, "app origin host");

  if (apiParentDomain !== appParentDomain) {
    throw new Error(
      `CEIRD_AUTH_COOKIE_DOMAIN requires sibling API and app hosts, got ${apiHostname} and ${appHostname}.`,
    );
  }

  return Schema.decodeUnknownSync(AuthCookieDomainSchema)(apiParentDomain);
}

function parentDomain(hostname: string, label: string) {
  const separatorIndex = hostname.indexOf(".");

  if (separatorIndex < 1 || separatorIndex === hostname.length - 1) {
    throw new Error(
      `CEIRD_AUTH_COOKIE_DOMAIN requires ${label} to have a parent domain: ${hostname}`,
    );
  }

  return hostname.slice(separatorIndex + 1);
}

function isExactOrigin(value: string): value is string {
  try {
    const parsed = new URL(value);

    return (
      (parsed.protocol === "https:" || parsed.protocol === "http:") &&
      parsed.origin === value &&
      parsed.username.length === 0 &&
      parsed.password.length === 0 &&
      parsed.pathname === "/" &&
      parsed.search.length === 0 &&
      parsed.hash.length === 0
    );
  } catch {
    return false;
  }
}

function isExactHost(value: string): value is string {
  if (value.includes("://") || wildcardPattern.test(value)) {
    return false;
  }

  try {
    const parsed = new URL(`https://${value}`);

    return (
      parsed.host === value &&
      parsed.username.length === 0 &&
      parsed.password.length === 0 &&
      parsed.pathname === "/" &&
      parsed.search.length === 0 &&
      parsed.hash.length === 0
    );
  } catch {
    return false;
  }
}

function makeStageHostSegment(stage: string) {
  const segment = stage
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "")
    .slice(0, 48)
    .replace(/-+$/, "");

  return segment.length === 0 ? "local" : segment;
}
