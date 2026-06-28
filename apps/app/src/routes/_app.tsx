import {
  type QueryClient,
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import {
  Navigate,
  Outlet,
  createFileRoute,
  useNavigate,
} from "@tanstack/react-router";
import { toast } from "@ceird/ui";
import { getAuthClient } from "../auth-client";
import {
  AuthenticatedShell,
  AuthenticatedShellLoading,
} from "../features/authenticated-shell/authenticated-shell";
import { makeAuthenticatedAppRouteContext } from "../features/auth/shared/app-route-guard";
import { handleAuthMutationSuccess } from "../features/auth/shared/auth-success";
import { betterAuthErrorMessage } from "../features/auth/shared/better-auth-error";
import { apiQueries } from "../api-queries";
import type { Session } from "../queries/auth-queries";
import { parsePublicConfig, publicConfigQueryOptions } from "../public-config";
import {
  parseApiBaseUrl,
  parseAuthBaseUrl,
  type ApiBaseUrl,
} from "../public-config-schema";

export const Route = createFileRoute("/_app")({
  beforeLoad: ({ context }) =>
    loadAuthenticatedAppRouteContext({
      queryClient: context.queryClient,
    }),
  pendingComponent: AuthenticatedShellLoading,
  component: AppLayout,
});

type AppRouteSessionLoader = (
  queryClient: QueryClient,
  apiBaseUrl: ApiBaseUrl,
) => Promise<Session>;

type LoadAuthenticatedAppRouteContextOptions = {
  readonly loadSession?: AppRouteSessionLoader;
  readonly queryClient: QueryClient;
};

/** Preload public config and session state for authenticated app routes. */
export async function loadAuthenticatedAppRouteContext({
  loadSession = loadSessionFromApiQuery,
  queryClient,
}: LoadAuthenticatedAppRouteContextOptions) {
  const publicConfig = await queryClient.ensureQueryData(
    publicConfigQueryOptions,
  );
  const { apiBaseUrl } = parsePublicConfig(publicConfig);
  const session = await loadSession(queryClient, apiBaseUrl);

  return makeAuthenticatedAppRouteContext({ apiBaseUrl, session });
}

function AppLayout() {
  const {
    apiBaseUrl: encodedApiBaseUrl,
    authBaseUrl: encodedAuthBaseUrl,
  } = Route.useRouteContext();
  const apiBaseUrl = parseApiBaseUrl(encodedApiBaseUrl);
  const authBaseUrl = parseAuthBaseUrl(encodedAuthBaseUrl);
  const queryClient = useQueryClient();
  const navigate = useNavigate({ from: Route.fullPath });
  const { data: session } = useSuspenseQuery(
    apiQueries.auth.session({ apiBaseUrl }),
  );
  const signOutMutation = useMutation({
    mutationFn: async () => {
      const response = await getAuthClient(authBaseUrl).signOut();

      if (response.error !== null) {
        throw new Error(
          betterAuthErrorMessage(response.error, "Sign out failed."),
        );
      }

      return response.data;
    },
    onSuccess: async () => {
      await handleAuthMutationSuccess({
        apiBaseUrl,
        navigate,
        queryClient,
        to: "/sign-in",
      });
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  if (session._tag !== "Authenticated") {
    return <Navigate replace to="/sign-in" />;
  }

  return (
    <AuthenticatedShell
      isSigningOut={signOutMutation.isPending}
      onSignOut={() => {
        signOutMutation.mutate();
      }}
      session={session}
    >
      <Outlet />
    </AuthenticatedShell>
  );
}

function loadSessionFromApiQuery(
  queryClient: QueryClient,
  apiBaseUrl: ApiBaseUrl,
) {
  return queryClient.ensureQueryData(apiQueries.auth.session({ apiBaseUrl }));
}
