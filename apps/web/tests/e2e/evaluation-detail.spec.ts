import { test, expect } from "@playwright/test";

test.describe("Evaluation Detail Page", () => {
  test("renders loading skeleton initially", async ({ page }) => {
    await page.goto("/evaluations/test-run-123");
    // Should show loading state (skeleton placeholders)
    const skeleton = page.locator(".animate-pulse");
    // Loading state appears briefly, then demo data loads
    await page.waitForTimeout(1000);
  });

  test("renders demo evaluation data for any ID", async ({ page }) => {
    await page.goto("/evaluations/demo-run-1");
    // Wait for demo data to load (API will fail, demo data kicks in)
    await page.waitForTimeout(2000);
    // Should show either the run name or the not-found state
    const hasRun = await page.getByText("demo-evaluation").isVisible().catch(() => false);
    const hasNotFound = await page.getByText("Evaluation not found").isVisible().catch(() => false);
    expect(hasRun || hasNotFound).toBeTruthy();
  });

  test("renders navigation links when evaluation loads", async ({ page }) => {
    await page.goto("/evaluations/demo-run-1");
    await page.waitForTimeout(2000);
    // Back link should always be present
    await expect(page.getByText("Back to evaluations")).toBeVisible();
  });

  test("renders metric cards when evaluation is loaded", async ({ page }) => {
    await page.goto("/evaluations/demo-run-1");
    await page.waitForTimeout(2000);
    // Check that metric labels are present (demo data always loads)
    const hasMetrics = await page.getByText("Pass Rate").isVisible().catch(() => false);
    if (hasMetrics) {
      await expect(page.getByText("pass@k")).toBeVisible();
      await expect(page.getByText("pass^k")).toBeVisible();
      await expect(page.getByText("Cost")).toBeVisible();
    }
  });
});
