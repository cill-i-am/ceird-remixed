const wildcardPattern = /[*?[\]{}()]/u;
const productionAppOrigin = "https://app.ceird.app";
const productionApiHost = "api.ceird.app";

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

export function parseOriginList(input: string | undefined): ReadonlyArray<string> {
  return splitConfigList(input).map((origin) => {
    if (wildcardPattern.test(origin)) {
      throw new Error(
        `CEIRD_AUTH_TRUSTED_ORIGINS must be exact origins, not wildcard patterns: ${origin}`,
      );
    }

    const parsed = new URL(origin);

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

function splitConfigList(input: string | undefined): ReadonlyArray<string> {
  if (input === undefined) {
    return [];
  }

  return input
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
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
