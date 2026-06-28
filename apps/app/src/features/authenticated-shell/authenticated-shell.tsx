import type { ReactNode } from "react";
import {
  Separator,
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
  TooltipProvider,
} from "@ceird/ui";
import type { AuthenticatedSession } from "../../queries/auth-queries";
import { CeirdSidebar } from "./ceird-sidebar";
export { AuthenticatedShellLoading } from "./authenticated-shell-loading";

export type AuthenticatedShellProps = {
  readonly children: ReactNode;
  readonly isSigningOut: boolean;
  readonly onSignOut: () => void;
  readonly session: AuthenticatedSession;
};

export function AuthenticatedShell({
  children,
  isSigningOut,
  onSignOut,
  session,
}: AuthenticatedShellProps) {
  return (
    <TooltipProvider>
      <SidebarProvider>
        <CeirdSidebar
          isSigningOut={isSigningOut}
          onSignOut={onSignOut}
          session={session}
        />
        <SidebarInset>
          <header className="flex h-16 shrink-0 items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator
              orientation="vertical"
              className="mr-2 data-vertical:h-4 data-vertical:self-auto"
            />
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-medium">Ceird</span>
              <span className="truncate text-xs text-muted-foreground">
                Workspace
              </span>
            </div>
          </header>
          <div className="flex flex-1 flex-col px-4 pb-4">{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
