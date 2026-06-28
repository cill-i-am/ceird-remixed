import { Skeleton } from "@ceird/ui";

export function AuthenticatedShellLoading() {
  return (
    <main className="grid min-h-screen place-items-center p-[clamp(24px,6vw,72px)]">
      <section
        className="flex w-full max-w-sm flex-col gap-3"
        aria-label="Loading workspace"
      >
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </section>
    </main>
  );
}
