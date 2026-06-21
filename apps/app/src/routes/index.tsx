import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { apiHealthQueryOptions } from "../api-client";
import { HealthBadge } from "../health-badge";

export const Route = createFileRoute("/")({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(apiHealthQueryOptions);
  },
  component: Home,
});

function Home() {
  const { data: apiHealth } = useSuspenseQuery(apiHealthQueryOptions);

  return (
    <main className="page">
      <section className="intro" aria-labelledby="page-title">
        <p className="eyebrow">Cloudflare Workers + Alchemy</p>
        <h1 id="page-title">Ceird is running on TanStack Start.</h1>
        <p className="lede">
          A minimal rich web app shell, wired into the same trunk and PR-stage
          deployment graph as the Effect HTTP API.
        </p>
        <div className="actions">
          <HealthBadge apiHealth={apiHealth} />
        </div>
      </section>
    </main>
  );
}
