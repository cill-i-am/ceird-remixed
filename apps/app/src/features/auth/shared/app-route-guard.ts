import { redirect } from "@tanstack/react-router";
import {
  deriveAuthBaseUrl,
  type ApiBaseUrl,
} from "../../../public-config-schema";
import type { Session } from "../../../queries/auth-queries";

/** Serializable route context for authenticated app routes. */
export type AuthenticatedAppRouteContext = {
  readonly apiBaseUrl: string;
  readonly authBaseUrl: string;
};

/** Build authenticated app route context or redirect anonymous users. */
export function makeAuthenticatedAppRouteContext({
  apiBaseUrl,
  session,
}: Readonly<{
  apiBaseUrl: ApiBaseUrl;
  session: Session;
}>): AuthenticatedAppRouteContext {
  if (session._tag === "Anonymous") {
    throw redirect({ replace: true, to: "/sign-in" });
  }

  return {
    apiBaseUrl: apiBaseUrl.href,
    authBaseUrl: deriveAuthBaseUrl(apiBaseUrl).href,
  };
}
