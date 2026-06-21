import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as GitHub from "alchemy/GitHub";
import * as Output from "alchemy/Output";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import ApiWorker from "./apps/api/src/worker.ts";

const repositoryOwner = "cill-i-am";
const repositoryName = "ceird-remixed";

export default Alchemy.Stack(
  "ceird-remixed",
  {
    providers: Layer.mergeAll(Cloudflare.providers(), GitHub.providers()),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const api = yield* ApiWorker;
    const apiUrl = api.url.as<string>();
    const app = yield* Cloudflare.Vite("App", {
      rootDir: "apps/app",
      url: true,
      compatibility: {
        flags: ["nodejs_compat"],
      },
      env: {
        API_WORKER: api,
        API_URL: apiUrl,
      },
    });
    const appUrl = app.url.as<string>();
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

    return {
      apiUrl,
      appUrl,
    };
  }),
);
