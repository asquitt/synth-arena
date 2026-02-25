import { test, expect } from "@playwright/test";

test.describe("Cost Estimator Page", () => {
  test("renders page title and description", async ({ page }) => {
    await page.goto("/cost");
    await expect(page.getByRole("heading", { name: "Cost Estimator" })).toBeVisible();
    await expect(page.getByText("Estimate token spend")).toBeVisible();
  });

  test("renders all form fields", async ({ page }) => {
    await page.goto("/cost");
    const main = page.getByRole("main");
    await expect(main.locator("label", { hasText: "Model" }).first()).toBeVisible();
    await expect(main.locator("label", { hasText: "Scenarios" }).first()).toBeVisible();
    await expect(main.locator("label", { hasText: "Trials" }).first()).toBeVisible();
    await expect(main.locator("label", { hasText: "Calls/Scenario" }).first()).toBeVisible();
    await expect(main.locator("label", { hasText: "Cache Rate" }).first()).toBeVisible();
  });

  test("model select contains multiple providers", async ({ page }) => {
    await page.goto("/cost");
    const modelSelect = page.locator("select").first();
    const options = await modelSelect.locator("option").allTextContents();
    expect(options.some((o) => o.includes("Claude"))).toBeTruthy();
    expect(options.some((o) => o.includes("GPT"))).toBeTruthy();
    expect(options.some((o) => o.includes("Gemini"))).toBeTruthy();
  });

  test("has Estimate Cost button", async ({ page }) => {
    await page.goto("/cost");
    await expect(page.getByRole("button", { name: "Estimate Cost" })).toBeVisible();
  });

  test("Estimate Cost generates local fallback results", async ({ page }) => {
    // Abort API requests to trigger catch-block fallback
    await page.route("**/api/v1/cost/**", (route) => route.abort());
    await page.goto("/cost");
    await page.getByRole("button", { name: "Estimate Cost" }).click();
    await expect(page.getByText("Total Estimated Cost")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Model Comparison")).toBeVisible();
  });

  test("cost estimate shows breakdown with input/output tokens", async ({ page }) => {
    await page.route("**/api/v1/cost/**", (route) => route.abort());
    await page.goto("/cost");
    await page.getByRole("button", { name: "Estimate Cost" }).click();
    await expect(page.getByText("Total Estimated Cost")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Input tokens").first()).toBeVisible();
    await expect(page.getByText("Output tokens").first()).toBeVisible();
    await expect(page.getByText("Per scenario")).toBeVisible();
  });

  test("model comparison ranks cheapest first", async ({ page }) => {
    await page.route("**/api/v1/cost/**", (route) => route.abort());
    await page.goto("/cost");
    await page.getByRole("button", { name: "Estimate Cost" }).click();
    await expect(page.getByText("Model Comparison")).toBeVisible({ timeout: 10000 });
    // Cheapest model gets "* " prefix in the comparison list
    await expect(page.getByText("* Gemini 2.0 Flash")).toBeVisible();
  });
});
