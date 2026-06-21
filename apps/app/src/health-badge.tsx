import type { ApiHealthStatus } from "./api-client";

/** Renders the current API health state. */
export function HealthBadge({
  apiHealth,
}: Readonly<{ apiHealth: ApiHealthStatus }>) {
  const apiHealthLabel =
    apiHealth._tag === "Healthy" ? `API ${apiHealth.status}` : "API unhealthy";

  return (
    <div
      className={`health-badge ${apiHealth._tag === "Healthy" ? "healthy" : "unhealthy"}`}
      aria-live="polite"
    >
      <span className="health-dot" aria-hidden="true" />
      <span>{apiHealthLabel}</span>
    </div>
  );
}
