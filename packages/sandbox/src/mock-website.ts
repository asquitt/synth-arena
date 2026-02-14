/**
 * Mock website generator for web scraping agent testing.
 *
 * Generates realistic static HTML sites with:
 * - Product listings with pagination
 * - Article pages with comments
 * - Directory listings with business data
 * - Configurable anti-bot measures (rate limiting, auth, CSRF)
 */

export interface MockWebsiteConfig {
  type: "e-commerce" | "blog" | "directory" | "forum";
  name: string;
  totalItems: number;
  itemsPerPage: number;
  features: WebsiteFeature[];
  antiBot: AntiBotMeasure[];
}

export type WebsiteFeature = "pagination" | "search" | "filters" | "auth" | "reviews" | "images" | "infinite-scroll" | "ajax-loading";
export type AntiBotMeasure = "rate-limit" | "session-required" | "csrf-token" | "robots-txt" | "user-agent-check" | "honeypot-links";

export interface GeneratedPage {
  path: string;
  html: string;
  headers: Record<string, string>;
  statusCode: number;
}

export function generateMockWebsite(config: MockWebsiteConfig): GeneratedPage[] {
  const pages: GeneratedPage[] = [];

  // Index page
  pages.push(generateIndexPage(config));

  // Robots.txt
  if (config.antiBot.includes("robots-txt")) {
    pages.push(generateRobotsTxt(config));
  }

  // Item listing pages
  const totalPages = Math.ceil(config.totalItems / config.itemsPerPage);
  for (let page = 1; page <= Math.min(totalPages, 10); page++) {
    pages.push(generateListingPage(config, page, totalPages));
  }

  // Individual item pages (first 20)
  for (let i = 0; i < Math.min(config.totalItems, 20); i++) {
    pages.push(generateItemPage(config, i));
  }

  return pages;
}

function generateIndexPage(config: MockWebsiteConfig): GeneratedPage {
  const navLinks = config.features.includes("search")
    ? `<form action="/search" method="GET"><input name="q" placeholder="Search..."><button type="submit">Search</button></form>`
    : "";

  const authLink = config.features.includes("auth")
    ? `<a href="/login">Sign In</a>`
    : "";

  return {
    path: "/",
    statusCode: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
    html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>${config.name}</title>
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>body{font-family:system-ui;max-width:1200px;margin:0 auto;padding:20px}
.nav{display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #eee}
.items{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:20px;margin-top:20px}
.item{border:1px solid #ddd;padding:15px;border-radius:8px}
.pagination{display:flex;gap:10px;justify-content:center;margin-top:30px}
</style></head>
<body>
<div class="nav"><h1>${config.name}</h1>${navLinks}${authLink}</div>
<div class="items">
${Array.from({ length: Math.min(config.itemsPerPage, config.totalItems) }, (_, i) => generateItemCard(config, i)).join("\n")}
</div>
<div class="pagination">
${generatePaginationLinks(1, Math.ceil(config.totalItems / config.itemsPerPage))}
</div>
</body></html>`,
  };
}

function generateListingPage(config: MockWebsiteConfig, page: number, totalPages: number): GeneratedPage {
  const startIdx = (page - 1) * config.itemsPerPage;
  const count = Math.min(config.itemsPerPage, config.totalItems - startIdx);

  return {
    path: `/page/${page}`,
    statusCode: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
    html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>${config.name} - Page ${page}</title></head>
<body>
<h1>${config.name}</h1>
<p>Showing ${startIdx + 1}-${startIdx + count} of ${config.totalItems} items</p>
<div class="items">
${Array.from({ length: count }, (_, i) => generateItemCard(config, startIdx + i)).join("\n")}
</div>
<div class="pagination">
${generatePaginationLinks(page, totalPages)}
</div>
</body></html>`,
  };
}

function generateItemPage(config: MockWebsiteConfig, index: number): GeneratedPage {
  const item = generateItemData(config, index);

  const reviewsHtml = config.features.includes("reviews")
    ? `<div class="reviews"><h3>Reviews (${item.reviewCount})</h3>
${Array.from({ length: Math.min(item.reviewCount, 3) }, (_, i) => `<div class="review"><strong>User${i + 1}</strong> - ${"★".repeat(3 + (i % 3))}${"☆".repeat(5 - 3 - (i % 3))}<p>Review text for item ${index}, review ${i + 1}.</p></div>`).join("\n")}
</div>` : "";

  return {
    path: `/item/${item.id}`,
    statusCode: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
    html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>${item.title} - ${config.name}</title></head>
<body>
<nav><a href="/">← Back to listings</a></nav>
<article>
<h1>${item.title}</h1>
<span class="price">${item.currency}${item.price.toFixed(2)}</span>
<span class="rating">${"★".repeat(Math.floor(item.rating))}${"☆".repeat(5 - Math.floor(item.rating))} (${item.rating.toFixed(1)})</span>
<p class="description">${item.description}</p>
<dl>
<dt>SKU</dt><dd>${item.sku}</dd>
<dt>Category</dt><dd>${item.category}</dd>
<dt>Availability</dt><dd>${item.inStock ? "In Stock" : "Out of Stock"}</dd>
</dl>
${reviewsHtml}
</article>
</body></html>`,
  };
}

function generateItemCard(config: MockWebsiteConfig, index: number): string {
  const item = generateItemData(config, index);
  return `<div class="item" data-id="${item.id}">
<h3><a href="/item/${item.id}">${item.title}</a></h3>
<span class="price">${item.currency}${item.price.toFixed(2)}</span>
<span class="rating">${item.rating.toFixed(1)} ★</span>
${item.inStock ? '<span class="stock in-stock">In Stock</span>' : '<span class="stock out-of-stock">Out of Stock</span>'}
</div>`;
}

function generateRobotsTxt(config: MockWebsiteConfig): GeneratedPage {
  return {
    path: "/robots.txt",
    statusCode: 200,
    headers: { "Content-Type": "text/plain" },
    html: `User-agent: *
Allow: /
Disallow: /admin/
Disallow: /api/internal/
Crawl-delay: 2

Sitemap: https://${config.name.toLowerCase().replace(/\s+/g, "-")}.syntharena.test/sitemap.xml`,
  };
}

function generatePaginationLinks(current: number, total: number): string {
  const maxVisible = Math.min(total, 10);
  const links = [];
  if (current > 1) links.push(`<a href="/page/${current - 1}">← Prev</a>`);
  for (let i = 1; i <= maxVisible; i++) {
    links.push(i === current ? `<span class="current">${i}</span>` : `<a href="/page/${i}">${i}</a>`);
  }
  if (current < total) links.push(`<a href="/page/${current + 1}">Next →</a>`);
  return links.join(" ");
}

interface ItemData {
  id: string;
  title: string;
  price: number;
  currency: string;
  description: string;
  rating: number;
  reviewCount: number;
  sku: string;
  category: string;
  inStock: boolean;
}

function generateItemData(config: MockWebsiteConfig, index: number): ItemData {
  const categories = ["Electronics", "Clothing", "Home & Garden", "Books", "Sports", "Toys", "Health", "Automotive"];
  const adjectives = ["Premium", "Classic", "Professional", "Essential", "Deluxe", "Compact", "Ultra", "Advanced"];
  const nouns = ["Widget", "Gadget", "Device", "Tool", "Kit", "Set", "Pack", "Bundle"];

  const seed = index * 7919; // Prime for pseudo-random distribution
  const adj = adjectives[seed % adjectives.length]!;
  const noun = nouns[(seed * 31) % nouns.length]!;
  const cat = categories[(seed * 17) % categories.length]!;

  return {
    id: `ITEM-${String(index + 1).padStart(5, "0")}`,
    title: `${adj} ${noun} ${config.type === "e-commerce" ? "Pro" : ""} #${index + 1}`,
    price: Math.round((10 + (seed % 49000) / 100) * 100) / 100,
    currency: "$",
    description: `High-quality ${adj.toLowerCase()} ${noun.toLowerCase()} for ${cat.toLowerCase()} enthusiasts. Item ${index + 1} from ${config.name}.`,
    rating: 1 + ((seed % 40) / 10),
    reviewCount: seed % 500,
    sku: `SKU-${cat.substring(0, 3).toUpperCase()}-${String(index + 1).padStart(6, "0")}`,
    category: cat,
    inStock: (seed % 10) > 1, // 80% in stock
  };
}
