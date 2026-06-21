import type { ApiHealthStatus } from "./api-client";

/** Renders the current API health state. */
export function HealthBadge({
  apiHealth,
}: Readonly<{ apiHealth: ApiHealthStatus }>) {
  const apiHealthLabel =
    apiHealth._tag === "Healthy"
      ? `API ${apiHealth.status}`
      : apiHealth._tag === "Checking"
        ? "API checking"
        : "API unhealthy";
  const apiHealthClassName = `health-badge ${apiHealth._tag.toLowerCase()}`;

  return (
    <div className={apiHealthClassName} aria-live="polite">
      <span className="health-dot" aria-hidden="true" />
      <span>{apiHealthLabel}</span>
    </div>
  );
}
