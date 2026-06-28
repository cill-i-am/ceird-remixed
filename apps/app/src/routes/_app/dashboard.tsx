import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/dashboard")({
  component: DashboardPage,
});

function DashboardPage() {
  return (
    <main className="flex flex-1 flex-col gap-3 py-6">
      <p className="text-sm font-medium text-muted-foreground">Ceird</p>
      <h1 className="text-3xl font-bold">Dashboard</h1>
      <p className="max-w-2xl text-sm text-muted-foreground">
        Your authenticated workspace is ready.
      </p>
    </main>
  );
}
