import type { QueryClient } from "@tanstack/react-query";
import type { ApiBaseUrl } from "../../../public-config-schema";
import { refreshAuthSession } from "../../../queries/auth-queries";
import type { FileRouteTypes } from "../../../routeTree.gen";

type RefreshSession = (
  queryClient: QueryClient,
  apiBaseUrl: ApiBaseUrl,
) => Promise<unknown>;

type AuthSuccessDestination = Extract<
  FileRouteTypes["to"],
  "/dashboard" | "/sign-in"
>;

type NavigateAfterAuthSuccess = (
  options: Readonly<{ to: AuthSuccessDestination }>,
) => Promise<unknown> | unknown;

export type AuthMutationSuccessOptions = {
  readonly apiBaseUrl: ApiBaseUrl;
  readonly navigate: NavigateAfterAuthSuccess;
  readonly queryClient: QueryClient;
  readonly refreshSession?: RefreshSession;
  readonly to: AuthSuccessDestination;
};

export async function handleAuthMutationSuccess({
  apiBaseUrl,
  navigate,
  queryClient,
  refreshSession = refreshAuthSession,
  to,
}: AuthMutationSuccessOptions) {
  try {
    await refreshSession(queryClient, apiBaseUrl);
  } catch {
    // Better Auth already succeeded. Keep navigation moving; the session query
    // remains invalidated/refetched through its own query state for follow-up UI.
  }

  await navigate({ to });
}
