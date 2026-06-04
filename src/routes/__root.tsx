import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { useAuthStore } from "@/stores/auth";
import { LoginScreen } from "@/components/LoginScreen";
import { UpdatePrompt } from "@/components/UpdatePrompt";

export interface RouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootComponent,
});

function RootComponent() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  return (
    <>
      {/* Self-hosted Android update check runs on launch, before/after auth. */}
      <UpdatePrompt />
      {isAuthenticated ? (
        <AppShell>
          <Outlet />
        </AppShell>
      ) : (
        <LoginScreen />
      )}
    </>
  );
}
