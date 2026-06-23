import type { QueryClient } from "@tanstack/react-query";
import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRouteWithContext,
} from "@tanstack/react-router";
import type { ReactNode } from "react";
import stylesheet from "../styles.css?url";

export const Route = createRootRouteWithContext<{
  readonly queryClient: QueryClient;
}>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      { title: "Ceird" },
      {
        name: "description",
        content: "A barebones TanStack Start app deployed with Alchemy.",
      },
    ],
    links: [{ rel: "stylesheet", href: stylesheet }],
  }),
  component: RootComponent,
});

function RootComponent() {
  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  );
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body className="m-0 min-h-screen min-w-[320px] bg-[#f7f5ef] font-sans leading-normal text-[#18202b]">
        {children}
        <Scripts />
      </body>
    </html>
  );
}
