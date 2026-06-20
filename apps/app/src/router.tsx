import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

/** Create a fresh TanStack Router instance for each Start request. */
export function getRouter() {
  return createRouter({
    routeTree,
    defaultPreload: "intent",
    scrollRestoration: true,
  });
}
