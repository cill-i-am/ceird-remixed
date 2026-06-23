import { Badge } from "@ceird/ui/components/badge";
import type { ApiHealthStatus } from "./queries/meta-queries";

/** Renders the current API health state. */
export function HealthBadge({
  apiHealth,
}: Readonly<{ apiHealth: ApiHealthStatus }>) {
  const variant = apiHealth._tag === "Healthy" ? "default" : "destructive";
  const apiHealthLabel =
    apiHealth._tag === "Healthy" ? `API ${apiHealth.status}` : "API unhealthy";

  return (
    <Badge
      variant={variant}
      className="h-auto min-h-11 gap-2.5 rounded-lg px-[18px] py-2 text-sm font-bold"
      aria-live="polite"
    >
      <span
        className="h-2.5 w-2.5 flex-none rounded-full bg-current"
        aria-hidden="true"
      />
      <span>{apiHealthLabel}</span>
    </Badge>
  );
}
