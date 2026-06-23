import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Neon from "alchemy/Neon";
import * as Effect from "effect/Effect";

const migrationsDir = "./packages/db/migrations";

/** Neon Postgres project and branch for the API database. */
export const ApiDatabase = Effect.gen(function* () {
  const stage = yield* Alchemy.Stage;

  const project =
    stage === "prod"
      ? yield* Neon.Project("ApiDatabaseProject", {
          name: "ceird",
          region: "aws-eu-west-2",
          pgVersion: 17,
        })
      : yield* Neon.Project("ApiDatabaseProject", {
          region: "aws-eu-west-2",
          pgVersion: 17,
        });

  const branch = yield* Neon.Branch("ApiDatabaseBranch", {
    project,
    protected: stage === "prod",
    migrationsDir,
  });

  // Future cost optimization: use one shared non-prod Neon project and create
  // per-dev/PR branches once an owning stage has been bootstrapped.
  return { project, branch };
});

/** Cloudflare Hyperdrive configuration fronting the API Neon branch. */
export const ApiHyperdrive = Effect.gen(function* () {
  const { branch } = yield* ApiDatabase;

  return yield* Cloudflare.Hyperdrive("ApiHyperdrive", {
    origin: branch.origin,
  });
});
