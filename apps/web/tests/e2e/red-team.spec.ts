import { test, expect } from "@playwright/test";

test.describe("Red Team Page", () => {
  test("renders page title and description", async ({ page }) => {
    await page.goto("/red-team");
    await expect(page.getByRole("heading", { name: "Red Team / Adversarial Testing" })).toBeVisible();
    await expect(page.getByText("EU AI Act Article 55")).toBeVisible();
  });

  test("renders config form with all fields", async ({ page }) => {
    await page.goto("/red-team");
    const main = page.getByRole("main");
    await expect(main.locator("label", { hasText: "Evaluation Run ID" }).first()).toBeVisible();
    await expect(main.locator("label", { hasText: "Intensity" }).first()).toBeVisible();
    await expect(main.locator("label", { hasText: "Scenario Count" }).first()).toBeVisible();
  });

  test("renders attack category buttons", async ({ page }) => {
    await page.goto("/red-team");
    await expect(page.getByText("Attack Categories").first()).toBeVisible();
    // Should have category toggle buttons
    const categoryButtons = page.locator("button").filter({ hasText: /injection|leakage|misuse|hallucination|evasion|overreliance|bias/i });
    const count = await categoryButtons.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test("has run button", async ({ page }) => {
    await page.goto("/red-team");
    await expect(page.getByRole("button", { name: "Run Red Team Evaluation" })).toBeVisible();
  });

  test("shows error when run ID is empty", async ({ page }) => {
    await page.goto("/red-team");
    await page.getByRole("button", { name: "Run Red Team Evaluation" }).click();
    await page.waitForTimeout(1000);
    await expect(page.getByText("Evaluation ID is required")).toBeVisible();
  });

  test("intensity select has three options", async ({ page }) => {
    await page.goto("/red-team");
    const select = page.locator("select").first();
    const options = await select.locator("option").allTextContents();
    expect(options).toContain("Low");
    expect(options).toContain("Medium");
    expect(options).toContain("High");
  });
});
