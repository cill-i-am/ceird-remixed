import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as GitHub from "alchemy/GitHub";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";

const repositoryOwner = "cill-i-am";
const repositoryName = "ceird-remixed";

export default Alchemy.Stack(
  "ceird-remixed-github",
  {
    providers: Layer.mergeAll(Cloudflare.providers(), GitHub.providers()),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const { accountId } = yield* yield* Cloudflare.CloudflareEnvironment;

    const token = yield* Cloudflare.AccountApiToken("ci-cloudflare-token", {
      accountId,
      name: "ceird-remixed-ci",
      policies: [
        {
          effect: "allow",
          permissionGroups: [
            "Workers Scripts Write",
            "Workers Routes Read",
            "Workers Routes Write",
            "Hyperdrive Read",
            "Hyperdrive Write",
            "Account Settings Write",
            "Secrets Store Write",
            "Workers Tail Read",
          ],
          resources: {
            [`com.cloudflare.api.account.${accountId}`]: "*",
          },
        },
      ],
    });

    yield* GitHub.Secret("cloudflare-api-token", {
      owner: repositoryOwner,
      repository: repositoryName,
      name: "CLOUDFLARE_API_TOKEN",
      value: token.value,
    });

    yield* GitHub.Secret("cloudflare-account-id", {
      owner: repositoryOwner,
      repository: repositoryName,
      name: "CLOUDFLARE_ACCOUNT_ID",
      value: Redacted.make(accountId),
    });

    return {
      repository: `${repositoryOwner}/${repositoryName}`,
    };
  }),
);
