import { test, expect } from "@playwright/test";

test.describe("Evaluations Page", () => {
  test("renders page title and description", async ({ page }) => {
    await page.goto("/evaluations");
    await expect(
      page.getByRole("heading", { name: "Evaluations", exact: true })
    ).toBeVisible();
    await expect(page.getByText("Run and compare agent evaluations")).toBeVisible();
  });

  test("renders new evaluation form", async ({ page }) => {
    await page.goto("/evaluations");
    const main = page.getByRole("main");
    await expect(page.getByText("New Evaluation")).toBeVisible();
    await expect(main.locator("label", { hasText: "Scenarios" })).toBeVisible();
    await expect(main.locator("label", { hasText: "Trials" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Start Evaluation" })).toBeVisible();
  });

  test("renders domain select with all 5 domains", async ({ page }) => {
    await page.goto("/evaluations");
    const select = page.locator("select").first();
    await expect(select).toBeVisible();
    const options = await select.locator("option").allTextContents();
    // DomainSelect uses labels not raw values
    expect(options).toContain("Web Scraping");
    expect(options).toContain("Government");
    expect(options).toContain("Healthcare");
    expect(options).toContain("Legal");
    expect(options).toContain("Energy");
  });

  test("has streaming checkbox", async ({ page }) => {
    await page.goto("/evaluations");
    const main = page.getByRole("main");
    await expect(main.locator("label", { hasText: "Stream" })).toBeVisible();
  });

  test("shows empty state when no evaluations exist", async ({ page }) => {
    await page.goto("/evaluations");
    await expect(page.getByText("No evaluations yet")).toBeVisible();
  });

  test("Start Evaluation button shows demo data on API failure", async ({ page }) => {
    // Abort API requests to trigger catch-block demo data
    await page.route("**/api/v1/evaluations/**", (route) => route.abort());
    await page.route("**/api/v1/evaluations", (route) => {
      if (route.request().method() === "GET") return route.abort();
      return route.abort();
    });
    await page.goto("/evaluations");
    await page.getByRole("button", { name: "Start Evaluation" }).click();
    // Should show demo data error banner
    await expect(page.getByText("showing demo data")).toBeVisible({ timeout: 10000 });
  });
});
