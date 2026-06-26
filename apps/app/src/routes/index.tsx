import { useSuspenseQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Button } from "@ceird/ui";
import { apiQueries } from "../api-queries";
import { HealthBadge } from "../health-badge";
import { parsePublicConfig, publicConfigQueryOptions } from "../public-config";

export const Route = createFileRoute("/")({
  loader: async ({ context }) => {
    const { apiBaseUrl } = parsePublicConfig(
      await context.queryClient.ensureQueryData(publicConfigQueryOptions),
    );

    await context.queryClient.ensureQueryData(
      apiQueries.meta.health({ apiBaseUrl }),
    );
  },
  component: Home,
});

function Home() {
  const { data: publicConfig } = useSuspenseQuery(publicConfigQueryOptions);
  const { apiBaseUrl } = parsePublicConfig(publicConfig);
  const { data: apiHealth } = useSuspenseQuery(
    apiQueries.meta.health({ apiBaseUrl }),
  );

  return (
    <main className="grid min-h-screen place-items-center p-[clamp(24px,6vw,72px)]">
      <section
        className="grid w-full max-w-[960px] gap-8"
        aria-labelledby="page-title"
      >
        <p className="mb-3 text-[0.78rem] font-bold tracking-normal text-muted-foreground uppercase">
          Cloudflare Workers + Alchemy
        </p>
        <h1
          id="page-title"
          className="max-w-[12ch] text-[clamp(3rem,8vw,6.75rem)] leading-[0.95] font-bold text-foreground max-[560px]:max-w-[10ch]"
        >
          Ceird is running on TanStack Start.
        </h1>
        <p className="mt-7 max-w-3xl text-[clamp(1.05rem,2vw,1.35rem)] text-muted-foreground">
          A minimal rich web app shell, wired into the same trunk and PR-stage
          deployment graph as the Effect HTTP API.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <HealthBadge apiHealth={apiHealth} />
          <Button render={<Link to="/sign-in" />} nativeButton={false}>
            Sign in
          </Button>
          <Button
            render={<Link to="/sign-up" />}
            nativeButton={false}
            variant="outline"
          >
            Create account
          </Button>
        </div>
      </section>
    </main>
  );
}
