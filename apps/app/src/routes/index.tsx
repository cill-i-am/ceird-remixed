import { createFileRoute, useHydrated } from "@tanstack/react-router";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import {
  apiHealthQueryOptions,
  checkingApiHealthStatus,
} from "../api-client";
import { HealthBadge } from "../health-badge";
import { parsePublicConfig, publicConfigQueryOptions } from "../public-config";

export const Route = createFileRoute("/")({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(publicConfigQueryOptions);
  },
  component: Home,
});

function Home() {
  const hydrated = useHydrated();
  const { data: publicConfig } = useSuspenseQuery(publicConfigQueryOptions);
  const { apiBaseUrl } = parsePublicConfig(publicConfig);
  const { data: apiHealth = checkingApiHealthStatus } = useQuery(
    apiHealthQueryOptions({ apiBaseUrl, enabled: hydrated }),
  );

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
