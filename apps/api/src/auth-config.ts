const wildcardPattern = /[*?[\]{}()]/u;

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
