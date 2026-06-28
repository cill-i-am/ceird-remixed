import type { ReactNode } from "react";
import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { MeResponse } from "@ceird/api-contract";
import * as Schema from "effect/Schema";
import {
  AuthenticatedShell,
  AuthenticatedShellLoading,
} from "./authenticated-shell";
import type { Session } from "../../queries/auth-queries";

const authenticatedSession = {
  _tag: "Authenticated",
  user: Schema.decodeUnknownSync(MeResponse)({
    id: "user_123",
    email: "ada@example.com",
    emailVerified: true,
    name: "Ada Lovelace",
  }),
} satisfies Session;

type AuthenticatedSession = Extract<
  Session,
  { readonly _tag: "Authenticated" }
>;

test("renders the authenticated shell with the current user", async () => {
  const screen = await renderWithRouter(
    <ShellForTest
      isSigningOut={false}
      onSignOut={() => undefined}
      session={authenticatedSession}
    />,
  );

  await expect.element(screen.getByText("Ceird")).toBeVisible();
  await screen.getByRole("button").click();
  await expect.element(screen.getByText("Dashboard")).toBeVisible();
  await expect.element(screen.getByText("Ada Lovelace")).toBeVisible();
  await expect.element(screen.getByText("ada@example.com")).toBeVisible();
  await expect.element(screen.getByText("Workspace home")).toBeVisible();
});

test("calls the sign-out callback from the current-user menu", async () => {
  const signOutCalls: Array<"sign-out"> = [];
  const screen = await renderWithRouter(
    <ShellForTest
      isSigningOut={false}
      onSignOut={() => {
        signOutCalls.push("sign-out");
      }}
      session={authenticatedSession}
    />,
  );

  await screen.getByRole("button").click();
  await screen.getByText("ada@example.com").click();
  await screen.getByRole("menuitem", { name: "Sign out" }).click();

  expect(signOutCalls).toEqual(["sign-out"]);
});

test("renders a session loading state before auth is known", async () => {
  const screen = await renderWithRouter(<AuthenticatedShellLoading />);

  await expect.element(screen.getByLabelText("Loading workspace")).toBeVisible();
  await expect
    .element(screen.getByText("Workspace home"))
    .not.toBeInTheDocument();
});

function ShellForTest({
  isSigningOut,
  onSignOut,
  session,
}: Readonly<{
  isSigningOut: boolean;
  onSignOut: () => void;
  session: AuthenticatedSession;
}>) {
  return (
    <AuthenticatedShell
      isSigningOut={isSigningOut}
      onSignOut={onSignOut}
      session={session}
    >
      <p>Workspace home</p>
    </AuthenticatedShell>
  );
}

async function renderWithRouter(children: ReactNode) {
  const rootRoute = createRootRoute({
    component: () => children,
  });
  const dashboardRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/dashboard",
    component: () => null,
  });
  const signInRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/sign-in",
    component: () => null,
  });
  const routeTree = rootRoute.addChildren([dashboardRoute, signInRoute]);
  const router = createRouter({
    history: createMemoryHistory({ initialEntries: ["/dashboard"] }),
    routeTree,
  });

  return render(<RouterProvider router={router} />);
}
