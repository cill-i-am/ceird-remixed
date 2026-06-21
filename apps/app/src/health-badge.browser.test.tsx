import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { HealthBadge } from "./health-badge";

test("renders a healthy API state", async () => {
  const screen = await render(
    <HealthBadge
      apiHealth={{
        _tag: "Healthy",
        service: "ceird-api",
        status: "healthy",
      }}
    />,
  );

  await expect.element(screen.getByText("API healthy")).toBeVisible();
});

test("renders an unhealthy API state", async () => {
  const screen = await render(
    <HealthBadge
      apiHealth={{
        _tag: "Unhealthy",
        message: "API health check failed.",
      }}
    />,
  );

  await expect.element(screen.getByText("API unhealthy")).toBeVisible();
});

test("renders a checking API state", async () => {
  const screen = await render(
    <HealthBadge
      apiHealth={{
        _tag: "Checking",
        message: "API health check pending.",
      }}
    />,
  );

  await expect.element(screen.getByText("API checking")).toBeVisible();
});
