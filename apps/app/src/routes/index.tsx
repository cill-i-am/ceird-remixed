import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
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
      <section className="w-full max-w-[720px]" aria-labelledby="page-title">
        <p className="mb-3 text-[0.78rem] font-bold tracking-normal text-[#19706b] uppercase">
          Cloudflare Workers + Alchemy
        </p>
        <h1
          id="page-title"
          className="max-w-[12ch] text-[clamp(3rem,8vw,6.75rem)] leading-[0.95] font-bold text-[#121722] max-[560px]:max-w-[10ch]"
        >
          Ceird is running on TanStack Start.
        </h1>
        <p className="mt-7 max-w-3xl text-[clamp(1.05rem,2vw,1.35rem)] text-[#3f4652]">
          A minimal rich web app shell, wired into the same trunk and PR-stage
          deployment graph as the Effect HTTP API.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <HealthBadge apiHealth={apiHealth} />
        </div>
      </section>
    </main>
  );
}
