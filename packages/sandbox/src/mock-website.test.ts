import { describe, it, expect } from "vitest";
import { generateMockWebsite, type MockWebsiteConfig } from "./mock-website.js";

function makeConfig(overrides?: Partial<MockWebsiteConfig>): MockWebsiteConfig {
  return {
    type: "e-commerce",
    name: "Test Store",
    totalItems: 30,
    itemsPerPage: 10,
    features: ["pagination", "search"],
    antiBot: [],
    ...overrides,
  };
}

describe("generateMockWebsite", () => {
  it("generates index page", () => {
    const pages = generateMockWebsite(makeConfig());
    const index = pages.find((p) => p.path === "/");

    expect(index).toBeDefined();
    expect(index!.statusCode).toBe(200);
    expect(index!.html).toContain("Test Store");
    expect(index!.headers["Content-Type"]).toContain("text/html");
  });

  it("generates listing pages based on totalItems/itemsPerPage", () => {
    const pages = generateMockWebsite(makeConfig({ totalItems: 25, itemsPerPage: 10 }));
    const listings = pages.filter((p) => p.path.startsWith("/page/"));

    expect(listings.length).toBe(3); // 25 items / 10 per page = 3 pages
  });

  it("caps listing pages at 10", () => {
    const pages = generateMockWebsite(makeConfig({ totalItems: 500, itemsPerPage: 10 }));
    const listings = pages.filter((p) => p.path.startsWith("/page/"));

    expect(listings.length).toBe(10);
  });

  it("generates individual item pages (max 20)", () => {
    const pages = generateMockWebsite(makeConfig({ totalItems: 50 }));
    const items = pages.filter((p) => p.path.startsWith("/item/"));

    expect(items.length).toBe(20); // Capped at 20
  });

  it("generates correct number of item pages for small catalogs", () => {
    const pages = generateMockWebsite(makeConfig({ totalItems: 5 }));
    const items = pages.filter((p) => p.path.startsWith("/item/"));

    expect(items.length).toBe(5);
  });

  it("includes search form when search feature enabled", () => {
    const pages = generateMockWebsite(makeConfig({ features: ["search"] }));
    const index = pages.find((p) => p.path === "/")!;

    expect(index.html).toContain("<form");
    expect(index.html).toContain('name="q"');
  });

  it("excludes search form when search feature disabled", () => {
    const pages = generateMockWebsite(makeConfig({ features: [] }));
    const index = pages.find((p) => p.path === "/")!;

    expect(index.html).not.toContain('name="q"');
  });

  it("includes auth link when auth feature enabled", () => {
    const pages = generateMockWebsite(makeConfig({ features: ["auth"] }));
    const index = pages.find((p) => p.path === "/")!;

    expect(index.html).toContain("/login");
    expect(index.html).toContain("Sign In");
  });

  it("generates robots.txt when anti-bot robots-txt enabled", () => {
    const pages = generateMockWebsite(makeConfig({ antiBot: ["robots-txt"] }));
    const robots = pages.find((p) => p.path === "/robots.txt");

    expect(robots).toBeDefined();
    expect(robots!.headers["Content-Type"]).toBe("text/plain");
    expect(robots!.html).toContain("User-agent: *");
    expect(robots!.html).toContain("Disallow: /admin/");
    expect(robots!.html).toContain("Crawl-delay:");
  });

  it("excludes robots.txt when not configured", () => {
    const pages = generateMockWebsite(makeConfig({ antiBot: [] }));
    const robots = pages.find((p) => p.path === "/robots.txt");

    expect(robots).toBeUndefined();
  });

  it("item pages contain product details", () => {
    const pages = generateMockWebsite(makeConfig());
    const itemPage = pages.find((p) => p.path.startsWith("/item/"))!;

    expect(itemPage.html).toContain("SKU");
    expect(itemPage.html).toContain("Category");
    expect(itemPage.html).toContain("$"); // Price
    expect(itemPage.html).toContain("★"); // Rating stars
  });

  it("item pages include reviews section when feature enabled", () => {
    const pages = generateMockWebsite(makeConfig({ features: ["reviews"] }));
    const itemPage = pages.find((p) => p.path.startsWith("/item/"))!;

    expect(itemPage.html).toContain("Reviews");
    expect(itemPage.html).toContain("class=\"reviews\"");
  });

  it("item pages exclude reviews section when feature disabled", () => {
    const pages = generateMockWebsite(makeConfig({ features: [] }));
    const itemPage = pages.find((p) => p.path.startsWith("/item/"))!;

    expect(itemPage.html).not.toContain("class=\"reviews\"");
  });

  it("listing pages show correct item range", () => {
    const pages = generateMockWebsite(makeConfig({ totalItems: 25, itemsPerPage: 10 }));
    const page2 = pages.find((p) => p.path === "/page/2")!;

    expect(page2.html).toContain("11-20 of 25");
  });

  it("generates pagination links", () => {
    const pages = generateMockWebsite(makeConfig({ totalItems: 25, itemsPerPage: 10 }));
    const page1 = pages.find((p) => p.path === "/page/1")!;

    expect(page1.html).toContain("/page/2");
    expect(page1.html).toContain("Next →");
  });

  it("all pages return 200 status", () => {
    const pages = generateMockWebsite(makeConfig());

    for (const page of pages) {
      expect(page.statusCode).toBe(200);
    }
  });
});
