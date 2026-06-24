import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";

const wildcardPattern = /[*?{}()]/u;
const betterAuthSecretMinLength = 32;
const productionAppOrigin = "https://app.ceird.app";
const productionApiHost = "api.ceird.app";

export const BetterAuthSecretSchema = Schema.RedactedFromValue(
  Schema.String.check(Schema.isMinLength(betterAuthSecretMinLength)),
);

export type StageAuthConfig = {
  readonly apiHost: string;
  readonly apiOrigin: string;
  readonly appHost: string;
  readonly appOrigin: string;
};

export function makeStageAuthConfig(stage: string): StageAuthConfig {
  if (stage === "prod") {
    return {
      apiHost: productionApiHost,
      apiOrigin: `https://${productionApiHost}`,
      appHost: "app.ceird.app",
      appOrigin: productionAppOrigin,
    };
  }

  const segment = makeStageHostSegment(stage);

  return {
    apiHost: `api-${segment}.ceird.app`,
    apiOrigin: `https://api-${segment}.ceird.app`,
    appHost: `app-${segment}.ceird.app`,
    appOrigin: `https://app-${segment}.ceird.app`,
  };
}

export function parseOriginList(
  input: string | undefined,
  options: { readonly allowLocalHttp?: boolean } = {},
): ReadonlyArray<string> {
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

    return parsed.origin;
  });
}

export function parseHostList(input: string | undefined): ReadonlyArray<string> {
  return splitConfigList(input).map((host) => {
    if (wildcardPattern.test(host)) {
      throw new Error(
        `CEIRD_AUTH_ALLOWED_HOSTS must be exact hostnames, not wildcard patterns: ${host}`,
      );
    }

    const parsed = new URL(host.includes("://") ? host : `https://${host}`);

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

    return parsed.host.toLowerCase();
  });
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

function isLocalHttpOrigin(origin: URL) {
  return origin.protocol === "http:" &&
    (origin.hostname === "localhost" ||
      origin.hostname === "127.0.0.1" ||
      origin.hostname === "[::1]");
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
