import { test, expect } from "@playwright/test";

test.describe("State-Diff Page", () => {
  test("renders page heading and back link", async ({ page }) => {
    await page.goto("/evaluations/test-run/state-diff");
    await expect(page.getByRole("heading", { name: "State-Diff Analysis" })).toBeVisible();
    await expect(page.getByText("Back to Evaluation")).toBeVisible();
  });

  test("renders before/after state textareas with defaults", async ({ page }) => {
    await page.goto("/evaluations/test-run/state-diff");
    await expect(page.getByText("Before State (JSON)")).toBeVisible();
    await expect(page.getByText("After State (JSON)")).toBeVisible();
    // Pre-filled with demo data
    const textareas = page.locator("textarea");
    await expect(textareas.first()).not.toBeEmpty();
  });

  test("renders expected keys input and scenario ID", async ({ page }) => {
    await page.goto("/evaluations/test-run/state-diff");
    await expect(page.getByText("Expected Keys")).toBeVisible();
    await expect(page.getByText("Scenario ID")).toBeVisible();
  });

  test("has Compute Diff button", async ({ page }) => {
    await page.goto("/evaluations/test-run/state-diff");
    await expect(page.getByRole("button", { name: "Compute Diff" })).toBeVisible();
  });

  test("Compute Diff shows error when API unavailable", async ({ page }) => {
    await page.goto("/evaluations/test-run/state-diff");
    await page.getByRole("button", { name: "Compute Diff" }).click();
    // Wait for fetch to fail - error message shown in red banner
    // Error could be "fetch failed", "Failed to fetch", or "Failed to compute diff"
    const errorBanner = page.locator(".text-red-400");
    await expect(errorBanner).toBeVisible({ timeout: 10000 });
  });
});
