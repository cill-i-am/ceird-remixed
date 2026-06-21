import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { routeTree } from "./routeTree.gen";

/** Create a fresh TanStack Router instance for each Start request. */
export function getRouter() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        gcTime: 5 * 60 * 1000,
        staleTime: 30 * 1000,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    defaultPreload: "intent",
    scrollRestoration: true,
  });

  setupRouterSsrQueryIntegration({
    router,
    queryClient,
  });

  return router;
}
