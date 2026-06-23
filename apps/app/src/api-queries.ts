import { metaQueries } from "./queries/meta-queries";

/** Domain-scoped TanStack Query option factories for the typed API client. */
export const apiQueries = {
  meta: metaQueries,
} as const;
