import { test, expect } from "@playwright/test";

test.describe("Trace Import Page", () => {
  test("renders page title and description", async ({ page }) => {
    await page.goto("/scenarios/import");
    await expect(page.getByRole("heading", { name: "Import Production Traces" })).toBeVisible();
    await expect(page.getByText("Convert OpenTelemetry-compatible")).toBeVisible();
  });

  test("has back to scenarios link", async ({ page }) => {
    await page.goto("/scenarios/import");
    await expect(page.getByRole("link", { name: /Back to Scenarios/ })).toBeVisible();
  });

  test("renders traces JSON textarea with sample data", async ({ page }) => {
    await page.goto("/scenarios/import");
    await expect(page.getByText("Production Traces (JSON array)")).toBeVisible();
    const textarea = page.locator("textarea");
    const value = await textarea.inputValue();
    expect(value).toContain("trace-001");
  });

  test("renders filter controls", async ({ page }) => {
    await page.goto("/scenarios/import");
    const main = page.getByRole("main");
    await expect(main.locator("label", { hasText: "Domain" }).first()).toBeVisible();
    await expect(main.getByText("Filter by Outcome")).toBeVisible();
    await expect(main.getByText("Max Scenarios")).toBeVisible();
    await expect(main.getByText("Embed original traces")).toBeVisible();
  });

  test("has Import Traces button", async ({ page }) => {
    await page.goto("/scenarios/import");
    await expect(page.getByRole("button", { name: "Import Traces" })).toBeVisible();
  });

  test("outcome filter has all options", async ({ page }) => {
    await page.goto("/scenarios/import");
    const outcomeSelect = page.locator("select").nth(1);
    const options = await outcomeSelect.locator("option").allTextContents();
    expect(options).toContain("All");
    expect(options).toContain("Success Only");
    expect(options).toContain("Failures Only");
  });
});
