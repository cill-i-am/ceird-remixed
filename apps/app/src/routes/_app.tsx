import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { handleAuthMutationSuccess } from "../features/auth/shared/auth-success";
import { betterAuthErrorMessage } from "../features/auth/shared/better-auth-error";
import { apiQueries } from "../api-queries";
import {
  deriveAuthBaseUrl,
  parsePublicConfig,
  publicConfigQueryOptions,
} from "../public-config";
import { parseApiBaseUrl, parseAuthBaseUrl } from "../public-config-schema";

export const Route = createFileRoute("/_app")({
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
  component: AppLayout,
});

function AppLayout() {
  const {
    apiBaseUrl: encodedApiBaseUrl,
    authBaseUrl: encodedAuthBaseUrl,
  } = Route.useRouteContext();
  const apiBaseUrl = parseApiBaseUrl(encodedApiBaseUrl);
  const authBaseUrl = parseAuthBaseUrl(encodedAuthBaseUrl);
  const queryClient = useQueryClient();
  const navigate = useNavigate({ from: Route.fullPath });
  const sessionQuery = useQuery(apiQueries.auth.session({ apiBaseUrl }));
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

  if (sessionQuery.isPending) {
    return <AuthenticatedShellLoading />;
  }

  if (sessionQuery.data?._tag !== "Authenticated") {
    return <Navigate replace to="/sign-in" />;
  }

  return (
    <AuthenticatedShell
      isSigningOut={signOutMutation.isPending}
      onSignOut={() => {
        signOutMutation.mutate();
      }}
      session={sessionQuery.data}
    >
      <Outlet />
    </AuthenticatedShell>
  );
}
