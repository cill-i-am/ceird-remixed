import { authQueries } from "./queries/auth-queries";
import { metaQueries } from "./queries/meta-queries";

/** Domain-scoped TanStack Query option factories for the typed API client. */
export const apiQueries = {
  auth: authQueries,
  meta: metaQueries,
} as const;
