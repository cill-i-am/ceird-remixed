import { createHash } from "node:crypto";
import * as Schema from "effect/Schema";

const localHostBaseName = "ceird";
const localTld = "localhost";
const localAlchemyStageMaxLength = 80;
const localAlchemyStageHashLength = 8;
const stagePattern = new RegExp("^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$");
const hostSegmentPattern = new RegExp("^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$");
const serviceAliasPattern = new RegExp(
  "^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$",
);
const localServiceOriginExpected = `https://*.${localHostBaseName}.${localTld}/`;

function isLocalServiceOrigin(url: URL) {
  return (
    url.protocol === "https:" &&
    url.username.length === 0 &&
    url.password.length === 0 &&
    url.hostname.endsWith(`.${localHostBaseName}.${localTld}`) &&
    url.pathname === "/" &&
    url.search.length === 0 &&
    url.hash.length === 0
  );
}

/** Alchemy stage name used for a local developer stack. */
export const LocalAlchemyStageSchema = Schema.String.check(
  Schema.isPattern(stagePattern, {
    expected: "local Alchemy stage",
    identifier: "LocalAlchemyStage",
  }),
).pipe(Schema.brand("LocalAlchemyStage"));

/** DNS-safe hostname segment derived from a local stage or service name. */
export const LocalHostSegmentSchema = Schema.String.check(
  Schema.isPattern(hostSegmentPattern, {
    expected: "local hostname segment",
    identifier: "LocalHostSegment",
  }),
).pipe(Schema.brand("LocalHostSegment"));

/** Dot-separated portless alias without the `.localhost` suffix. */
export const LocalServiceAliasSchema = Schema.String.check(
  Schema.isPattern(serviceAliasPattern, {
    expected: "local service alias",
    identifier: "LocalServiceAlias",
  }),
).pipe(Schema.brand("LocalServiceAlias"));

/** Public local service origin routed by portless. */
export const LocalServiceOriginSchema = Schema.URLFromString.check(
  Schema.makeFilter(isLocalServiceOrigin, {
    expected: localServiceOriginExpected,
    identifier: "LocalServiceOrigin",
  }),
).pipe(
  Schema.brand("LocalServiceOrigin"),
);

/** Numeric port parsed from an Alchemy local target URL. */
export const LocalTargetPortSchema = Schema.Int.check(
  Schema.isGreaterThanOrEqualTo(1),
).check(Schema.isLessThanOrEqualTo(65_535)).pipe(
  Schema.brand("LocalTargetPort"),
);

/** Stack output key used by the local dev CLI to discover an Alchemy target URL. */
export const AlchemyLocalTargetOutputKeySchema = Schema.Literals([
  "localAppTargetUrl",
  "localApiTargetUrl",
]);

/** Supported local HTTP service names for the current monorepo. */
export type LocalHttpServiceName = "app" | "api";

/** Parsed Alchemy stage name for local development. */
export type LocalAlchemyStage = Schema.Schema.Type<
  typeof LocalAlchemyStageSchema
>;

/** DNS-safe hostname segment. */
export type LocalHostSegment = Schema.Schema.Type<
  typeof LocalHostSegmentSchema
>;

/** Dot-separated portless alias without the `.localhost` suffix. */
export type LocalServiceAlias = Schema.Schema.Type<
  typeof LocalServiceAliasSchema
>;

/** Parsed local service origin URL. */
export type LocalServiceOrigin = Schema.Schema.Type<
  typeof LocalServiceOriginSchema
>;

/** Parsed local target port. */
export type LocalTargetPort = Schema.Schema.Type<
  typeof LocalTargetPortSchema
>;

/** Parsed stack output key for an Alchemy local target URL. */
export type AlchemyLocalTargetOutputKey = Schema.Schema.Type<
  typeof AlchemyLocalTargetOutputKeySchema
>;

/** Portless alias metadata for a local HTTP service. */
export type LocalHttpService = {
  readonly name: LocalHttpServiceName;
  readonly alias: LocalServiceAlias;
  readonly origin: LocalServiceOrigin;
  readonly originEnvVar: string;
  readonly targetOutputKey: AlchemyLocalTargetOutputKey;
};

/** Complete local development topology for this monorepo instance. */
export type LocalDevTopology = {
  readonly stage: LocalAlchemyStage;
  readonly stageHostSegment: LocalHostSegment;
  readonly proxyPort: LocalTargetPort | undefined;
  readonly authCookieDomain: string;
  readonly trustedOrigins: string;
  readonly app: LocalHttpService;
  readonly api: LocalHttpService;
};

/** Options for building a local development topology. */
export type LocalDevTopologyOptions = {
  readonly proxyPort?: LocalTargetPort | number;
};

/** Inputs used to derive a collision-resistant local stage. */
export type DefaultLocalStageInput = {
  readonly branch: string;
  readonly user: string;
  readonly worktreeName: string;
};

export const parseLocalAlchemyStage = Schema.decodeUnknownSync(
  LocalAlchemyStageSchema,
);
export const parseLocalHostSegment = Schema.decodeUnknownSync(
  LocalHostSegmentSchema,
);
export const parseLocalServiceAlias = Schema.decodeUnknownSync(
  LocalServiceAliasSchema,
);
export const parseLocalServiceOrigin = Schema.decodeUnknownSync(
  LocalServiceOriginSchema,
);
export const parseLocalTargetPort = Schema.decodeUnknownSync(
  LocalTargetPortSchema,
);
export const parseAlchemyLocalTargetOutputKey = Schema.decodeUnknownSync(
  AlchemyLocalTargetOutputKeySchema,
);

/** Convert arbitrary branch/worktree text into a local Alchemy stage. */
export function normalizeLocalAlchemyStage(input: string): LocalAlchemyStage {
  const normalized = normalizeStageText(input, localAlchemyStageMaxLength);

  return parseLocalAlchemyStage(
    normalized.length === 0 ? "dev_local" : normalized,
  );
}

function normalizeStageText(input: string, maxLength: number) {
  const normalized = input
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/^[^A-Za-z0-9]+/, "")
    .replace(/[^A-Za-z0-9]+$/, "")
    .slice(0, maxLength)
    .replace(/[^A-Za-z0-9]+$/, "");

  return normalized;
}

function makeStageHash(input: string) {
  return createHash("sha256")
    .update(input)
    .digest("hex")
    .slice(0, localAlchemyStageHashLength);
}

function makeHashedLocalAlchemyStage(
  readableInput: string,
  hashInput: string,
): LocalAlchemyStage {
  const hash = makeStageHash(hashInput);
  const maxPrefixLength =
    localAlchemyStageMaxLength - hash.length - "_".length;
  const readablePrefix = normalizeStageText(readableInput, maxPrefixLength);
  const prefix = readablePrefix.length === 0 ? "dev_local" : readablePrefix;

  return parseLocalAlchemyStage(`${prefix}_${hash}`);
}

/** Derive the default local stage from git/user/worktree identity. */
export function makeDefaultLocalAlchemyStage({
  branch,
  user,
  worktreeName,
}: DefaultLocalStageInput): LocalAlchemyStage {
  const userSegment = user.trim().length === 0 ? "local" : user;
  const worktreeSegment = worktreeName.trim();
  const stageSegments =
    branch === "main" || branch === "master" || branch.trim().length === 0
      ? ["dev", userSegment, worktreeSegment]
      : [branch, userSegment, worktreeSegment];
  const hashInput = JSON.stringify({ branch, user: userSegment, worktreeName });

  return makeHashedLocalAlchemyStage(
    joinStageSegments(stageSegments),
    hashInput,
  );
}

function joinStageSegments(segments: ReadonlyArray<string>) {
  return segments
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0)
    .join("_");
}

/** Convert arbitrary stage/service text into a DNS-safe local hostname segment. */
export function normalizeLocalHostSegment(input: string): LocalHostSegment {
  const normalized = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "")
    .slice(0, 63)
    .replace(/-+$/, "");

  return parseLocalHostSegment(normalized.length === 0 ? "local" : normalized);
}

/** Create the stable portless alias for one local HTTP service. */
export function makeLocalServiceAlias(
  serviceName: LocalHttpServiceName,
  stageHostSegment: LocalHostSegment,
): LocalServiceAlias {
  return parseLocalServiceAlias(
    `${serviceName}.${stageHostSegment}.${localHostBaseName}`,
  );
}

/** Create the stable portless origin for one local HTTP service. */
export function makeLocalServiceOrigin(
  alias: LocalServiceAlias,
  options: LocalDevTopologyOptions = {},
): LocalServiceOrigin {
  const proxyPort =
    options.proxyPort === undefined
      ? undefined
      : parseLocalTargetPort(options.proxyPort);
  const portSuffix =
    proxyPort === undefined || proxyPort === 443 ? "" : `:${proxyPort}`;

  return parseLocalServiceOrigin(`https://${alias}.${localTld}${portSuffix}`);
}

/** Build the local dev topology shared by the CLI and Alchemy stack. */
export function makeLocalDevTopology(
  stageInput: string,
  options: LocalDevTopologyOptions = {},
): LocalDevTopology {
  const stage = normalizeLocalAlchemyStage(stageInput);
  const stageHostSegment = normalizeLocalHostSegment(stage);
  const appAlias = makeLocalServiceAlias("app", stageHostSegment);
  const apiAlias = makeLocalServiceAlias("api", stageHostSegment);
  const proxyPort =
    options.proxyPort === undefined
      ? undefined
      : parseLocalTargetPort(options.proxyPort);
  const originOptions =
    proxyPort === undefined ? {} : { proxyPort };
  const appOrigin = makeLocalServiceOrigin(appAlias, originOptions);
  const apiOrigin = makeLocalServiceOrigin(apiAlias, originOptions);

  return {
    stage,
    stageHostSegment,
    proxyPort,
    authCookieDomain: `${stageHostSegment}.${localHostBaseName}.${localTld}`,
    trustedOrigins: [appOrigin.origin, apiOrigin.origin].join(","),
    app: {
      name: "app",
      alias: appAlias,
      origin: appOrigin,
      originEnvVar: "CEIRD_LOCAL_APP_ORIGIN",
      targetOutputKey: parseAlchemyLocalTargetOutputKey("localAppTargetUrl"),
    },
    api: {
      name: "api",
      alias: apiAlias,
      origin: apiOrigin,
      originEnvVar: "CEIRD_LOCAL_API_ORIGIN",
      targetOutputKey: parseAlchemyLocalTargetOutputKey("localApiTargetUrl"),
    },
  };
}
