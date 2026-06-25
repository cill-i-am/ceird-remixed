import { createAuthClient } from "better-auth/react";
import type { AuthBaseUrl } from "./public-config-schema";

export type AppAuthClient = ReturnType<typeof createAuthClient>;

const defaultAuthClients = new Map<string, AppAuthClient>();

function createAppAuthClient(authBaseUrl: AuthBaseUrl) {
  return createAuthClient({
    baseURL: authBaseUrl.href,
    fetchOptions: {
      credentials: "include",
    },
  });
}

/** Get the cached Better Auth React client for the runtime auth origin. */
export function getAuthClient(authBaseUrl: AuthBaseUrl): AppAuthClient {
  const baseUrlKey = authBaseUrl.href;
  const cachedClient = defaultAuthClients.get(baseUrlKey);
  if (cachedClient !== undefined) {
    return cachedClient;
  }

  const client = createAppAuthClient(authBaseUrl);
  defaultAuthClients.set(baseUrlKey, client);
  return client;
}
