import { test, expect } from "@playwright/test";

test.describe("Arena Page", () => {
  test("renders page title and description", async ({ page }) => {
    await page.goto("/arena");
    await expect(page.getByRole("heading", { name: "Arena Mode" })).toBeVisible();
    await expect(page.getByText("Head-to-head agent comparison")).toBeVisible();
  });

  test("renders new arena battle form", async ({ page }) => {
    await page.goto("/arena");
    await expect(page.getByText("New Arena Battle")).toBeVisible();
    await expect(page.getByText("Agents (comma-separated)")).toBeVisible();
    await expect(page.getByRole("button", { name: "Start Battle" })).toBeVisible();
  });

  test("has pre-filled agent names input", async ({ page }) => {
    await page.goto("/arena");
    const agentInput = page.locator('input[type="text"]');
    await expect(agentInput).toHaveValue("agent-v1,agent-v2");
  });

  test("shows empty state initially", async ({ page }) => {
    await page.goto("/arena");
    await expect(page.getByText("No arena battles yet")).toBeVisible();
  });

  test("Start Battle generates demo leaderboard", async ({ page }) => {
    await page.goto("/arena");
    await page.getByRole("button", { name: "Start Battle" }).click();
    await page.waitForTimeout(1000);
    // Should show leaderboard with agent names
    await expect(page.getByText("agent-v1")).toBeVisible();
    await expect(page.getByText("agent-v2")).toBeVisible();
    // Should show table headers - scope to table to avoid nav collisions
    const table = page.locator("table");
    await expect(table.locator("th", { hasText: "Rank" })).toBeVisible();
    await expect(table.locator("th", { hasText: "Elo" })).toBeVisible();
    await expect(table.locator("th", { hasText: "W/L/D" })).toBeVisible();
  });

  test("multiple battles accumulate", async ({ page }) => {
    await page.goto("/arena");
    await page.getByRole("button", { name: "Start Battle" }).click();
    await page.waitForTimeout(500);
    await page.getByRole("button", { name: "Start Battle" }).click();
    await page.waitForTimeout(500);
    // Should have at least 2 arena results visible
    const matchupTexts = await page.locator("text=matchups").count();
    expect(matchupTexts).toBeGreaterThanOrEqual(2);
  });
});
