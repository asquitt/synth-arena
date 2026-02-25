import { test, expect } from "@playwright/test";

test.describe("Domains Page", () => {
  test("renders page title and description", async ({ page }) => {
    await page.goto("/domains");
    await expect(page.getByRole("heading", { name: "Domain Templates" })).toBeVisible();
    await expect(page.getByText("Pre-built evaluation templates")).toBeVisible();
  });

  test("renders all 5 domain cards", async ({ page }) => {
    await page.goto("/domains");
    await page.waitForTimeout(2000);
    const main = page.getByRole("main");
    for (const domain of ["web-scraping", "government", "healthcare", "legal", "energy"]) {
      await expect(main.getByText(domain).first()).toBeVisible();
    }
  });

  test("each domain card has version badge", async ({ page }) => {
    await page.goto("/domains");
    await page.waitForTimeout(2000);
    const versionBadges = page.locator("text=v0.1.0");
    const count = await versionBadges.count();
    expect(count).toBeGreaterThanOrEqual(5);
  });

  test("each domain card has Evaluate and Generate links", async ({ page }) => {
    await page.goto("/domains");
    await page.waitForTimeout(2000);
    const evaluateLinks = page.getByRole("link", { name: "Evaluate" });
    const generateLinks = page.getByRole("link", { name: "Generate Scenarios" });
    expect(await evaluateLinks.count()).toBeGreaterThanOrEqual(5);
    expect(await generateLinks.count()).toBeGreaterThanOrEqual(5);
  });

  test("domain cards show generator and constraint counts", async ({ page }) => {
    await page.goto("/domains");
    await page.waitForTimeout(2000);
    // All cards should show generator counts
    const generatorTexts = page.locator("text=generators");
    const constraintTexts = page.locator("text=constraints");
    expect(await generatorTexts.count()).toBeGreaterThanOrEqual(5);
    expect(await constraintTexts.count()).toBeGreaterThanOrEqual(5);
  });

  test("domain cards show default scorers", async ({ page }) => {
    await page.goto("/domains");
    await page.waitForTimeout(2000);
    await expect(page.getByText("task_completion").first()).toBeVisible();
    await expect(page.getByText("safety_check").first()).toBeVisible();
  });
});
