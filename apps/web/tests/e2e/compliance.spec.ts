import { test, expect } from "@playwright/test";

test.describe("Compliance Page", () => {
  test("renders page heading and back link", async ({ page }) => {
    await page.goto("/evaluations/test-run/compliance");
    await page.waitForTimeout(2000);
    // Page shows "Compliance Report" in error state or "EU AI Act Compliance" in success
    const heading = page.getByRole("heading").first();
    await expect(heading).toBeVisible();
    await expect(page.getByText("Back to evaluation")).toBeVisible();
  });

  test("shows error state when API unavailable", async ({ page }) => {
    // Abort API requests to trigger error state
    await page.route("**/api/v1/**", (route) => route.abort());
    await page.goto("/evaluations/test-run/compliance");
    // Catch block sets "Unable to connect to API..."
    await expect(page.getByText("Unable to connect to API")).toBeVisible({ timeout: 10000 });
  });

  test("renders navigation bar", async ({ page }) => {
    await page.goto("/evaluations/test-run/compliance");
    await expect(page.locator("nav")).toBeVisible();
  });
});
