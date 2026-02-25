import { test, expect } from "@playwright/test";

test.describe("Scorer Lab Page", () => {
  test("renders page title and badge", async ({ page }) => {
    await page.goto("/scorer-lab");
    await expect(page.getByRole("heading", { name: "Scorer Lab" })).toBeVisible();
    await expect(page.getByText("AI-Powered")).toBeVisible();
  });

  test("renders quick start examples", async ({ page }) => {
    await page.goto("/scorer-lab");
    await expect(page.getByText("Quick start:")).toBeVisible();
    // Should have example buttons
    const exampleButtons = page.locator("button").filter({ hasText: /length|JSON|competitor|PII/i });
    const count = await exampleButtons.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test("renders scorer builder form", async ({ page }) => {
    await page.goto("/scorer-lab");
    const main = page.getByRole("main");
    await expect(page.getByText("New Scorer")).toBeVisible();
    await expect(main.getByText("Scorer Name")).toBeVisible();
    await expect(main.locator("label", { hasText: "Mode" }).first()).toBeVisible();
    await expect(main.getByText("Threshold")).toBeVisible();
    await expect(main.getByText("Evaluation Criteria").first()).toBeVisible();
  });

  test("mode select has deterministic and LLM options", async ({ page }) => {
    await page.goto("/scorer-lab");
    const modeSelect = page.locator("select").first();
    const options = await modeSelect.locator("option").allTextContents();
    expect(options.some((o) => o.includes("Deterministic"))).toBeTruthy();
    expect(options.some((o) => o.includes("LLM"))).toBeTruthy();
  });

  test("has test data panel", async ({ page }) => {
    await page.goto("/scorer-lab");
    await expect(page.getByText("Test Data")).toBeVisible();
    await expect(page.getByText("Test Input (JSON)")).toBeVisible();
    await expect(page.getByText("Test Output (JSON)")).toBeVisible();
  });

  test("Generate button is disabled without name and criteria", async ({ page }) => {
    await page.goto("/scorer-lab");
    const btn = page.getByRole("button", { name: "Generate & Test Scorer" });
    await expect(btn).toBeDisabled();
  });

  test("shows empty state when no scorers", async ({ page }) => {
    await page.goto("/scorer-lab");
    await expect(page.getByText("No scorers yet")).toBeVisible();
  });
});
