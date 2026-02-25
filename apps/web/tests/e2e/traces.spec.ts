import { test, expect } from "@playwright/test";

test.describe("Traces Page", () => {
  test("renders page title and description", async ({ page }) => {
    await page.goto("/traces");
    await expect(page.getByRole("heading", { name: "Trace Explorer" })).toBeVisible();
    await expect(page.getByText("Inspect agent execution traces")).toBeVisible();
  });

  test("renders search controls", async ({ page }) => {
    await page.goto("/traces");
    const select = page.locator("select");
    await expect(select).toBeVisible();
    const options = await select.locator("option").allTextContents();
    expect(options).toContain("By Run ID");
    expect(options).toContain("By Trace ID");
  });

  test("renders search input and button", async ({ page }) => {
    await page.goto("/traces");
    await expect(page.locator('input[type="text"]')).toBeVisible();
    await expect(page.getByRole("button", { name: "Search" })).toBeVisible();
  });

  test("shows empty state initially", async ({ page }) => {
    await page.goto("/traces");
    await expect(page.getByText("Enter a Run ID or Trace ID")).toBeVisible();
  });

  test("search shows demo data when API is unavailable", async ({ page }) => {
    await page.goto("/traces");
    await page.locator('input[type="text"]').fill("test-run-123");
    await page.getByRole("button", { name: "Search" }).click();
    await page.waitForTimeout(3000);
    // Should show demo data fallback or error
    const hasSpans = await page.getByText("Total Spans").isVisible().catch(() => false);
    const hasError = await page.locator("text=Showing demo data").isVisible().catch(() => false);
    expect(hasSpans || hasError).toBeTruthy();
  });
});
