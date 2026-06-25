import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Drizzle from "alchemy/Drizzle";
import * as Neon from "alchemy/Neon";
import * as Effect from "effect/Effect";

const migrationsDir = "./packages/db/migrations";
const schemaPath = "./packages/db/src/schema.ts";

/** Neon Postgres project and branch for the API database. */
export const ApiDatabase = Effect.gen(function* () {
  const stage = yield* Alchemy.Stage;
  const schema = yield* Drizzle.Schema("ApiDatabaseSchema", {
    schema: schemaPath,
    out: migrationsDir,
    dialect: "postgres",
  });

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
    // TODO: Enable prod branch protection once the Neon plan supports it.
    protected: false,
    migrationsDir: schema.out,
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
    caching: {
      disabled: true,
    },
  });
});
