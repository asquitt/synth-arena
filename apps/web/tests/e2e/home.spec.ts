import { test, expect } from "@playwright/test";

test.describe("Home Page", () => {
  test("renders hero section with title and CTAs", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1")).toContainText("Test your AI agents");
    await expect(page.locator("h1")).toContainText("touch production");
    await expect(page.getByRole("link", { name: "Start Evaluation" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Arena Mode" })).toBeVisible();
  });

  test("renders navigation with all links", async ({ page }) => {
    await page.goto("/");
    const nav = page.locator("nav");
    await expect(nav).toBeVisible();
    await expect(nav.getByRole("link", { name: "SynthArena" })).toBeVisible();
    for (const label of ["Evaluations", "Traces", "Red Team", "Scorer Lab", "Scenarios", "Domains", "Cost"]) {
      await expect(nav.getByRole("link", { name: label, exact: true })).toBeVisible();
    }
    await expect(nav.getByRole("link", { name: "Arena", exact: true })).toBeVisible();
  });

  test("renders stats cards", async ({ page }) => {
    await page.goto("/");
    const main = page.getByRole("main");
    await expect(main.getByText("Domains", { exact: true }).first()).toBeVisible();
    await expect(main.getByText("18+")).toBeVisible();
    await expect(main.getByText("pass@k", { exact: true }).first()).toBeVisible();
  });

  test("renders feature cards", async ({ page }) => {
    await page.goto("/");
    for (const title of ["Scenario Generation", "Sandboxed Execution", "State-Diff Engine", "Replay & Regression", "Red Team Suite", "Cost Modeling"]) {
      await expect(page.getByRole("heading", { name: title })).toBeVisible();
    }
  });

  test("renders CLI example section", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "CLI-First Experience" })).toBeVisible();
    await expect(page.getByText("synth-arena run")).toBeVisible();
    await expect(page.getByText("synth-arena arena")).toBeVisible();
  });

  test("Start Evaluation link navigates to evaluations page", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Start Evaluation" }).click();
    await expect(page).toHaveURL("/evaluations");
  });

  test("Arena Mode link navigates to arena page", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Arena Mode" }).click();
    await expect(page).toHaveURL("/arena");
  });
});
