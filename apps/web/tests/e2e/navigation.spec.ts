import { test, expect } from "@playwright/test";

test.describe("Navigation", () => {
  test("nav logo links to home", async ({ page }) => {
    await page.goto("/evaluations");
    await page.locator("nav").getByRole("link", { name: "SynthArena" }).click();
    await expect(page).toHaveURL("/");
  });

  test("all nav links are functional", async ({ page }) => {
    const routes: Record<string, string> = {
      Evaluations: "/evaluations",
      Traces: "/traces",
      "Red Team": "/red-team",
      "Scorer Lab": "/scorer-lab",
      Scenarios: "/scenarios",
      Domains: "/domains",
      Cost: "/cost",
    };

    for (const [label, path] of Object.entries(routes)) {
      await page.goto("/");
      await page.locator("nav").getByRole("link", { name: label, exact: true }).click();
      await expect(page).toHaveURL(path);
    }

    // Arena needs exact match to avoid matching "SynthArena"
    await page.goto("/");
    await page.locator("nav").getByRole("link", { name: "Arena", exact: true }).click();
    await expect(page).toHaveURL("/arena");
  });

  test("active nav link is highlighted", async ({ page }) => {
    await page.goto("/evaluations");
    const evalLink = page.locator("nav").getByRole("link", { name: "Evaluations" });
    // Active link should have text-white class
    await expect(evalLink).toHaveClass(/text-white/);
  });

  test("page titles render on all routes", async ({ page }) => {
    const routes: Record<string, string> = {
      "/evaluations": "Evaluations",
      "/arena": "Arena Mode",
      "/traces": "Trace Explorer",
      "/red-team": "Red Team",
      "/scorer-lab": "Scorer Lab",
      "/scenarios": "Scenarios",
      "/domains": "Domain Templates",
      "/cost": "Cost Estimator",
    };

    for (const [path, title] of Object.entries(routes)) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toContainText(title);
    }
  });
});
