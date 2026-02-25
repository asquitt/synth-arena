import { test, expect } from "@playwright/test";

test.describe("Regression Comparison Page", () => {
  test("renders page heading and back link", async ({ page }) => {
    await page.goto("/evaluations/test-run/compare");
    await expect(page.getByRole("heading", { name: "Regression Comparison" })).toBeVisible();
    await expect(page.getByText("Back to Evaluation")).toBeVisible();
  });

  test("renders current evaluation ID as disabled input", async ({ page }) => {
    await page.goto("/evaluations/test-run/compare");
    await expect(page.getByText("Current Evaluation")).toBeVisible();
    const disabledInput = page.locator("input[disabled]");
    await expect(disabledInput).toBeVisible();
  });

  test("renders baseline input and compare button", async ({ page }) => {
    await page.goto("/evaluations/test-run/compare");
    await expect(page.getByText("Baseline Evaluation ID")).toBeVisible();
    await expect(page.getByRole("button", { name: "Compare" })).toBeVisible();
  });

  test("shows error when comparing without baseline ID", async ({ page }) => {
    await page.goto("/evaluations/test-run/compare");
    await page.getByRole("button", { name: "Compare" }).click();
    await page.waitForTimeout(1000);
    await expect(page.getByText("Baseline evaluation ID is required")).toBeVisible();
  });
});
