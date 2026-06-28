import { Link } from "@tanstack/react-router";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@ceird/ui";
import { HomeIcon, PanelsTopLeftIcon } from "lucide-react";
import type { AuthenticatedSession } from "../../queries/auth-queries";
import { CurrentUserFooter } from "./current-user-footer";

export type CeirdSidebarProps = {
  readonly isSigningOut: boolean;
  readonly onSignOut: () => void;
  readonly session: AuthenticatedSession;
};

export function CeirdSidebar({
  isSigningOut,
  onSignOut,
  session,
}: CeirdSidebarProps) {
  return (
    <Sidebar variant="inset">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              render={<Link to="/dashboard" />}
              tooltip="Ceird"
            >
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <PanelsTopLeftIcon />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">Ceird</span>
                <span className="truncate text-xs">Workspace</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Home</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive
                  render={<Link to="/dashboard" />}
                  tooltip="Dashboard"
                >
                  <HomeIcon />
                  <span>Dashboard</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <CurrentUserFooter
          isSigningOut={isSigningOut}
          onSignOut={onSignOut}
          session={session}
        />
      </SidebarFooter>
    </Sidebar>
  );
}
