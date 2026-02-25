import { test, expect } from "@playwright/test";

test.describe("Scenarios Page", () => {
  test("renders page title and description", async ({ page }) => {
    await page.goto("/scenarios");
    await expect(
      page.getByRole("heading", { name: "Scenarios", exact: true })
    ).toBeVisible();
    await expect(page.getByText("Generate and validate domain-specific test scenarios")).toBeVisible();
  });

  test("has Import Production Traces link", async ({ page }) => {
    await page.goto("/scenarios");
    await expect(page.getByRole("link", { name: /Import Production Traces/ })).toBeVisible();
  });

  test("renders generator form", async ({ page }) => {
    await page.goto("/scenarios");
    const main = page.getByRole("main");
    await expect(page.getByText("Generate Scenarios")).toBeVisible();
    // Label is not associated via for/id, use label locator
    await expect(main.locator("label", { hasText: "Count" })).toBeVisible();
    await expect(main.locator("label", { hasText: "Complexity" }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Generate" })).toBeVisible();
  });

  test("complexity select has all options", async ({ page }) => {
    await page.goto("/scenarios");
    const complexitySelect = page.locator("select").nth(1);
    const options = await complexitySelect.locator("option").allTextContents();
    expect(options).toContain("Mixed");
    expect(options).toContain("Low");
    expect(options).toContain("High");
    expect(options).toContain("Adversarial");
  });

  test("shows empty state initially", async ({ page }) => {
    await page.goto("/scenarios");
    await expect(page.getByText("No scenarios generated yet")).toBeVisible();
  });

  test("Generate creates demo scenarios when API unavailable", async ({ page }) => {
    await page.goto("/scenarios");
    await page.getByRole("button", { name: "Generate" }).click();
    // Wait for API fetch to fail and demo data to load
    await expect(page.getByText("scenarios generated")).toBeVisible({ timeout: 10000 });
  });

  test("Import link navigates to import page", async ({ page }) => {
    await page.goto("/scenarios");
    await page.getByRole("link", { name: /Import Production Traces/ }).click();
    await expect(page).toHaveURL("/scenarios/import");
  });
});
