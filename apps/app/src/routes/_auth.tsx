import { Outlet, createFileRoute } from "@tanstack/react-router";
import {
  deriveAuthBaseUrl,
  parsePublicConfig,
  publicConfigQueryOptions,
} from "../public-config";

export const Route = createFileRoute("/_auth")({
  beforeLoad: async ({ context }) => {
    const publicConfig = await context.queryClient.ensureQueryData(
      publicConfigQueryOptions,
    );
    const { apiBaseUrl } = parsePublicConfig(publicConfig);

    return {
      apiBaseUrl: apiBaseUrl.href,
      authBaseUrl: deriveAuthBaseUrl(apiBaseUrl).href,
    };
  },
  component: AuthLayout,
});

function AuthLayout() {
  return (
    <main className="grid min-h-screen place-items-center p-[clamp(24px,6vw,72px)]">
      <section className="w-full max-w-sm">
        <Outlet />
      </section>
    </main>
  );
}
