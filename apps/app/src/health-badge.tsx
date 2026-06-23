import type { ApiHealthStatus } from "./queries/meta-queries";

/** Renders the current API health state. */
export function HealthBadge({
  apiHealth,
}: Readonly<{ apiHealth: ApiHealthStatus }>) {
  const healthTone =
    apiHealth._tag === "Healthy"
      ? "border-[#19706b] text-[#145b57]"
      : "border-[#b42c2c] text-[#8d2020]";
  const apiHealthLabel =
    apiHealth._tag === "Healthy" ? `API ${apiHealth.status}` : "API unhealthy";

  return (
    <div
      className={`inline-flex min-h-11 items-center justify-center gap-2.5 rounded-lg border bg-white px-[18px] font-bold ${healthTone}`}
      aria-live="polite"
    >
      <span
        className="h-2.5 w-2.5 flex-none rounded-full bg-current"
        aria-hidden="true"
      />
      <span>{apiHealthLabel}</span>
    </div>
  );
}
