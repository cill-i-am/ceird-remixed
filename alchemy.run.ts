import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as GitHub from "alchemy/GitHub";
import * as Neon from "alchemy/Neon";
import * as Output from "alchemy/Output";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import ApiWorker from "./apps/api/src/worker.ts";
import { LocalServiceOriginSchema } from "./scripts/local-dev/topology.ts";

const repositoryOwner = "cill-i-am";
const repositoryName = "ceird-remixed";
const productionApiHostname = "remixed-api.ceird.app";
const productionApiUrl = `https://${productionApiHostname}`;

export default Alchemy.Stack(
  "ceird-remixed",
  {
    providers: Layer.mergeAll(
      Cloudflare.providers(),
      GitHub.providers(),
      Neon.providers(),
    ),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const stage = yield* Alchemy.Stage;
    const api = yield* ApiWorker;
    const alchemyContext = yield* Alchemy.AlchemyContext;
    const localOriginConfig = Config.all({
      api: Config.schema(
        LocalServiceOriginSchema,
        "CEIRD_LOCAL_API_ORIGIN",
      ),
      app: Config.schema(
        LocalServiceOriginSchema,
        "CEIRD_LOCAL_APP_ORIGIN",
      ),
    });
    const localOrigins = alchemyContext.dev
      ? yield* Config.option(localOriginConfig)
      : undefined;
    const hasLocalOrigins =
      localOrigins !== undefined && Option.isSome(localOrigins);
    const apiUrl =
      hasLocalOrigins
        ? localOrigins.value.api.href
        : stage === "prod"
          ? productionApiUrl
          : api.url.as<string>();

    if (stage === "prod") {
      const zone = yield* Cloudflare.Zone("CeirdZone", {
        name: "ceird.app",
      }).pipe(Alchemy.AdoptPolicy.adopt(true));

      yield* Cloudflare.WorkerRoute("ApiRoute", {
        zoneId: zone.zoneId,
        pattern: `${productionApiHostname}/*`,
        script: api.workerName,
      }).pipe(Alchemy.AdoptPolicy.adopt(true));
    }

    const app = yield* Cloudflare.Vite("App", {
      rootDir: "apps/app",
      url: true,
      compatibility: {
        flags: ["nodejs_compat"],
      },
      env: {
        API_URL: apiUrl,
        API_WORKER: api,
      },
    });
    const appUrl =
      hasLocalOrigins
        ? localOrigins.value.app.href
        : app.url.as<string>();
    const pullRequest = yield* Config.string("PULL_REQUEST").pipe(
      Config.withDefault(""),
    );
    const commitSha = yield* Config.string("GITHUB_SHA").pipe(
      Config.withDefault("local"),
    );
    const pullRequestNumber = Number.parseInt(
      pullRequest,
      10,
    );

    if (Number.isSafeInteger(pullRequestNumber)) {
      yield* GitHub.Comment("preview-comment", {
        owner: repositoryOwner,
        repository: repositoryName,
        issueNumber: pullRequestNumber,
        body: Output.interpolate`
          ## Preview deployed

          App: ${appUrl}
          API: ${apiUrl}
          Commit: ${commitSha}
        `,
      });
    }

    return alchemyContext.dev
      ? {
          apiUrl,
          appUrl,
          localApiTargetUrl: api.url.as<string>(),
          localAppTargetUrl: app.url.as<string>(),
        }
      : {
          apiUrl,
          appUrl,
        };
  }),
);
