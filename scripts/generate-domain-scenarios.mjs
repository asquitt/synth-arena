#!/usr/bin/env node
/**
 * Generate rich scenario datasets for all 5 domains.
 * 210 scenarios per domain, 1,050 total.
 * Run: node scripts/generate-domain-scenarios.mjs
 */

import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { createHash } from "crypto";

const DOMAINS_DIR = join(import.meta.dirname, "..", "domains");
const NOW = "2026-02-24T00:00:00Z";
const VERSION = "manual-v1";

function uid(prefix, n) {
  return `${prefix}-${String(n).padStart(3, "0")}`;
}

function pick(arr, rng) {
  return arr[Math.floor(rng() * arr.length)];
}

function seededRng(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

function complexity(i, total) {
  const pct = i / total;
  if (pct < 0.24) return "low";
  if (pct < 0.57) return "medium";
  if (pct < 0.81) return "high";
  return "adversarial";
}

// ─── Web Scraping ──────────────────────────────────────────────
function generateWebScraping() {
  const rng = seededRng(42);
  const scenarios = [];
  const sites = ["techmart.test", "fashionhub.test", "craftbazaar.test", "localbiz.test", "technews.test"];
  const ecomFields = ["title", "price", "currency", "rating", "reviewCount", "sku", "availability", "images", "variants"];
  const articleFields = ["title", "author", "publishDate", "body", "tags", "comments", "readTime"];
  const listingFields = ["businessName", "address", "phone", "website", "hours", "rating", "coordinates", "categories"];

  const ecomTasks = [
    { name: "Extract product listings", desc: "Scrape all product titles and prices from a paginated catalog page", type: "product-listing", fields: ["title", "price", "currency"] },
    { name: "Handle infinite scroll", desc: "Extract products from a page using infinite scroll pagination", type: "infinite-scroll", fields: ["title", "price"] },
    { name: "Extract with filters", desc: "Apply category and price filters then extract matching products", type: "filtered-search", fields: ["title", "price", "category"] },
    { name: "Compare prices", desc: "Extract prices from multiple seller pages for the same product", type: "price-comparison", fields: ["seller", "price", "shipping"] },
    { name: "Detect out-of-stock", desc: "Identify which products on a listing page are out of stock", type: "stock-check", fields: ["title", "availability"] },
    { name: "Sale price extraction", desc: "Extract both original and discounted prices for sale items", type: "sale-prices", fields: ["title", "originalPrice", "salePrice", "discount"] },
    { name: "Multi-currency prices", desc: "Extract prices displayed in multiple currencies and normalize to USD", type: "multi-currency", fields: ["title", "price", "currency", "usdEquivalent"] },
    { name: "Product variant scraping", desc: "Extract all size/color variants with their specific prices and availability", type: "variants", fields: ["title", "variant", "price", "availability"] },
    { name: "Review extraction", desc: "Scrape product reviews including rating, text, author, and date", type: "reviews", fields: ["rating", "text", "author", "date"] },
    { name: "Search results scraping", desc: "Execute a search query and extract all result items with metadata", type: "search-results", fields: ["title", "price", "relevanceRank"] },
    { name: "Category tree extraction", desc: "Navigate and extract the full category hierarchy from the site", type: "category-tree", fields: ["category", "subcategories", "productCount"] },
    { name: "Dynamic pricing detection", desc: "Detect price changes by scraping the same product at different times", type: "dynamic-pricing", fields: ["title", "price", "timestamp"] },
  ];

  const contentTasks = [
    { name: "Article body extraction", desc: "Extract the main article content excluding ads and navigation", type: "article-body", fields: ["title", "body", "wordCount"] },
    { name: "Author and date parsing", desc: "Extract author name and publication date from various format patterns", type: "author-date", fields: ["author", "publishDate", "format"] },
    { name: "Comment thread scraping", desc: "Extract nested comment threads with replies and vote counts", type: "comments", fields: ["author", "text", "votes", "replies"] },
    { name: "Multi-page article", desc: "Follow next-page links to assemble a complete multi-page article", type: "multi-page", fields: ["title", "body", "pageCount"] },
    { name: "Embedded media detection", desc: "Identify and extract URLs of embedded images, videos, and iframes", type: "embedded-media", fields: ["type", "url", "caption"] },
    { name: "Table data extraction", desc: "Extract structured data from HTML tables including headers", type: "table-data", fields: ["headers", "rows", "columnCount"] },
    { name: "Recipe structured data", desc: "Extract recipe details including ingredients, steps, and nutrition", type: "recipe", fields: ["title", "ingredients", "steps", "prepTime", "nutrition"] },
    { name: "Paywall detection", desc: "Detect paywalled content and extract what is freely available", type: "paywall", fields: ["isPaywalled", "freeContent", "truncationPoint"] },
    { name: "Tag and category extraction", desc: "Extract article tags, categories, and related article links", type: "tags", fields: ["tags", "categories", "relatedLinks"] },
    { name: "Date format normalization", desc: "Parse publication dates in relative, absolute, and locale formats", type: "date-parsing", fields: ["rawDate", "isoDate", "format"] },
  ];

  const directoryTasks = [
    { name: "Business info extraction", desc: "Extract business name, address, phone, and hours from a listing page", type: "business-info", fields: listingFields },
    { name: "Map coordinate parsing", desc: "Extract latitude/longitude coordinates from embedded maps", type: "coordinates", fields: ["name", "lat", "lng"] },
    { name: "Review aggregation", desc: "Aggregate review scores and count from a business listing page", type: "review-agg", fields: ["avgRating", "totalReviews", "ratingDistribution"] },
    { name: "Category navigation", desc: "Navigate through category pages to build complete business listings", type: "category-nav", fields: ["category", "businesses", "pageCount"] },
    { name: "Cross-reference listings", desc: "Match and merge business data from two different directory sites", type: "cross-ref", fields: ["name", "sources", "mergedData"] },
    { name: "Incomplete listing handling", desc: "Extract available data from listings with missing fields", type: "incomplete", fields: ["name", "availableFields", "missingFields"] },
    { name: "Hours parsing", desc: "Parse business hours in various formats including holidays", type: "hours", fields: ["day", "open", "close", "isHoliday"] },
    { name: "Photo gallery extraction", desc: "Extract all photos from a business listing with captions", type: "photos", fields: ["url", "caption", "index"] },
  ];

  const antiBot = [
    { name: "Rate limit handling", desc: "Respect 429 rate limit responses with exponential backoff", type: "rate-limit", tag: "rate-limit" },
    { name: "Captcha detection", desc: "Detect captcha challenge page and report it without attempting to solve", type: "captcha", tag: "captcha" },
    { name: "CloudFlare challenge", desc: "Detect CloudFlare challenge page and handle gracefully", type: "cloudflare", tag: "cloudflare" },
    { name: "Session cookie required", desc: "Maintain session cookies across requests to access protected pages", type: "session", tag: "session" },
    { name: "User-agent validation", desc: "Set appropriate User-Agent header to avoid bot detection", type: "user-agent", tag: "user-agent" },
    { name: "Robots.txt compliance", desc: "Check and respect robots.txt directives before scraping", type: "robots-txt", tag: "robots-txt" },
    { name: "JavaScript rendered content", desc: "Handle pages where content is loaded via JavaScript after initial HTML", type: "js-render", tag: "javascript" },
    { name: "Redirect chain following", desc: "Follow a chain of HTTP redirects to reach the final content page", type: "redirects", tag: "redirects" },
    { name: "IP block detection", desc: "Detect when IP has been blocked and report the situation", type: "ip-block", tag: "ip-block" },
    { name: "Login-wall bypass detection", desc: "Detect login requirement and extract only publicly available data", type: "login-wall", tag: "authentication" },
  ];

  const adversarial = [
    { name: "XSS in scraped content", desc: "Sanitize extracted content containing malicious script tags and event handlers", type: "xss-sanitize", tag: "xss" },
    { name: "Honeypot link trap", desc: "Avoid hidden honeypot links designed to trap and identify bots", type: "honeypot", tag: "honeypot" },
    { name: "Fake data in HTML comments", desc: "Ignore misleading data embedded in HTML comments", type: "comment-injection", tag: "injection" },
    { name: "Hidden element deception", desc: "Correctly skip elements hidden via CSS display:none or visibility:hidden", type: "hidden-elements", tag: "css-deception" },
    { name: "Price in image format", desc: "Detect that price is rendered as an image and report inability to extract", type: "image-price", tag: "obfuscation" },
    { name: "JavaScript trap detection", desc: "Detect infinite loop or resource-exhaustion JavaScript traps", type: "js-trap", tag: "trap" },
    { name: "DOM mutation after load", desc: "Handle content that changes via JavaScript after initial page load", type: "dom-mutation", tag: "mutation" },
    { name: "Malformed HTML recovery", desc: "Extract data correctly from pages with broken/unclosed HTML tags", type: "malformed-html", tag: "malformed" },
    { name: "Encoding issues", desc: "Handle mixed character encodings (UTF-8, Windows-1252, ISO-8859-1)", type: "encoding", tag: "encoding" },
    { name: "Time-based content changes", desc: "Detect that content changes based on time of day and capture consistent snapshot", type: "time-based", tag: "temporal" },
    { name: "CSS content injection", desc: "Detect fake content injected via CSS ::before/::after pseudo-elements", type: "css-injection", tag: "css-injection" },
    { name: "Clickjacking overlay", desc: "Detect transparent overlay elements covering the real content", type: "clickjack", tag: "clickjacking" },
    { name: "Unicode homoglyph prices", desc: "Detect prices using lookalike Unicode characters instead of ASCII digits", type: "homoglyphs", tag: "obfuscation" },
    { name: "Tar pit slow response", desc: "Handle deliberately slow-drip responses designed to waste resources", type: "tar-pit", tag: "tar-pit" },
    { name: "Mixed language content", desc: "Extract content correctly from pages mixing multiple languages and scripts", type: "multi-lang", tag: "i18n" },
  ];

  let idx = 1;

  // E-commerce: 60
  for (let i = 0; i < 60; i++) {
    const task = ecomTasks[i % ecomTasks.length];
    const site = pick(sites.slice(0, 3), rng);
    const maxPages = Math.floor(rng() * 10) + 1;
    scenarios.push({
      id: uid("ws", idx),
      domain: "web-scraping",
      name: `${task.name} (${site} v${i + 1})`,
      description: `${task.desc} on ${site}. Variation ${i + 1}: ${i % 3 === 0 ? "with authentication" : i % 3 === 1 ? "with rate limiting" : "standard access"}.`,
      input: { url: `https://mock-${site}/products?page=1`, targetSite: site, extractionType: task.type, fields: task.fields, maxPages, timeout: 30000 },
      expected: { minResults: Math.floor(rng() * 50) + 10, requiredFields: task.fields, dataFormat: "json" },
      metadata: { complexity: complexity(i, 60), tags: ["e-commerce", task.type, ...task.fields.slice(0, 2)], generatedAt: NOW, generatorVersion: VERSION },
    });
    idx++;
  }

  // Content: 50
  for (let i = 0; i < 50; i++) {
    const task = contentTasks[i % contentTasks.length];
    const site = pick(["technews.test", "blogworld.test", "wikiclone.test", "forumhub.test"], rng);
    scenarios.push({
      id: uid("ws", idx),
      domain: "web-scraping",
      name: `${task.name} (${site} v${i + 1})`,
      description: `${task.desc} on ${site}. Test ${i % 2 === 0 ? "clean markup" : "noisy markup with ads and popups"}.`,
      input: { url: `https://mock-${site}/article/${1000 + i}`, targetSite: site, extractionType: task.type, fields: task.fields, timeout: 20000 },
      expected: { requiredFields: task.fields, contentMinLength: 100 },
      metadata: { complexity: complexity(i, 50), tags: ["content-site", task.type, ...task.fields.slice(0, 2)], generatedAt: NOW, generatorVersion: VERSION },
    });
    idx++;
  }

  // Directory: 40
  for (let i = 0; i < 40; i++) {
    const task = directoryTasks[i % directoryTasks.length];
    const site = pick(["localbiz.test", "yellowpages.test", "realestate.test"], rng);
    scenarios.push({
      id: uid("ws", idx),
      domain: "web-scraping",
      name: `${task.name} (${site} v${i + 1})`,
      description: `${task.desc} from ${site}. ${i % 2 === 0 ? "Single listing page" : "Multi-page results"}.`,
      input: { url: `https://mock-${site}/listing/${2000 + i}`, targetSite: site, extractionType: task.type, fields: task.fields, maxPages: Math.floor(rng() * 5) + 1 },
      expected: { requiredFields: task.fields.slice(0, 3), hasCoordinates: task.type === "coordinates" },
      metadata: { complexity: complexity(i, 40), tags: ["directory", task.type, ...task.fields.slice(0, 2)], generatedAt: NOW, generatorVersion: VERSION },
    });
    idx++;
  }

  // Anti-bot: 30
  for (let i = 0; i < 30; i++) {
    const task = antiBot[i % antiBot.length];
    const site = pick(sites, rng);
    scenarios.push({
      id: uid("ws", idx),
      domain: "web-scraping",
      name: `${task.name} (${site} v${i + 1})`,
      description: `${task.desc}. Target: ${site}, variation ${i + 1}.`,
      input: { url: `https://mock-${site}/protected/${3000 + i}`, targetSite: site, extractionType: task.type, antiBot: task.tag, timeout: 15000 },
      expected: { handledGracefully: true, errorType: task.tag === "captcha" ? "captcha_detected" : null },
      metadata: { complexity: "high", tags: ["anti-bot", task.tag], generatedAt: NOW, generatorVersion: VERSION },
    });
    idx++;
  }

  // Adversarial: 30
  for (let i = 0; i < 30; i++) {
    const task = adversarial[i % adversarial.length];
    const site = pick(sites, rng);
    scenarios.push({
      id: uid("ws", idx),
      domain: "web-scraping",
      name: `${task.name} (${site} v${i + 1})`,
      description: `${task.desc}. Adversarial test on ${site}, variation ${i + 1}.`,
      input: { url: `https://mock-${site}/adversarial/${4000 + i}`, targetSite: site, extractionType: task.type, adversarialType: task.tag, timeout: 10000 },
      expected: { sanitized: true, noMaliciousContent: true, attackType: task.tag },
      metadata: { complexity: "adversarial", tags: ["adversarial", task.tag], generatedAt: NOW, generatorVersion: VERSION },
    });
    idx++;
  }

  return scenarios;
}

// ─── Government ──────────────────────────────────────────────
function generateGovernment() {
  const rng = seededRng(101);
  const scenarios = [];
  const agencies = [
    { code: "DOD", subs: ["Army", "Navy", "Air Force", "DISA", "DLA"] },
    { code: "HHS", subs: ["CDC", "NIH", "CMS", "FDA"] },
    { code: "GSA", subs: ["FAS", "PBS", "18F"] },
    { code: "NASA", subs: ["JPL", "GSFC", "KSC"] },
    { code: "DOE", subs: ["NNSA", "ARPA-E", "EIA"] },
    { code: "DHS", subs: ["CISA", "CBP", "FEMA", "TSA"] },
    { code: "VA", subs: ["VHA", "VBA"] },
  ];
  const naics = ["541511", "541512", "541519", "518210", "541330", "541690", "561110"];
  const setAsides = ["Total Small Business", "8(a) Set-Aside", "HUBZone", "SDVOSB", "WOSB", "Unrestricted"];
  const solTypes = ["rfp", "rfq", "rfi", "sources-sought", "combined-synopsis"];
  const farClauses = ["52.212-1", "52.212-2", "52.212-3", "52.212-4", "52.219-1", "52.219-6", "52.219-14", "52.222-26", "52.225-1", "52.232-33"];

  const rfpTasks = [
    "Parse solicitation and extract all requirements",
    "Extract submission deadline and evaluation criteria",
    "Identify all required FAR clauses in the solicitation",
    "Match solicitation to correct NAICS code",
    "Extract period of performance dates",
    "Inventory and download all attachments",
    "Track amendments and identify changes",
    "Extract line item details and quantities",
    "Identify key personnel requirements",
    "Parse wage determination tables",
    "Extract technical evaluation factors and weights",
    "Identify security clearance requirements",
  ];

  const complianceTasks = [
    "Validate all required FAR clauses are included",
    "Check DFARS supplement compliance for DOD solicitation",
    "Assess set-aside eligibility based on company profile",
    "Verify ITAR/EAR restriction compliance",
    "Check past performance requirements against company history",
    "Validate small business subcontracting plan requirements",
    "Verify insurance and bonding requirements",
    "Check Section 508 accessibility compliance",
    "Validate cost accounting standards applicability",
    "Verify organizational conflict of interest requirements",
  ];

  const proposalTasks = [
    "Generate technical volume outline from evaluation criteria",
    "Structure price/cost volume per solicitation instructions",
    "Format past performance references to match requirements",
    "Create compliance matrix mapping requirements to responses",
    "Check proposal against page limit requirements",
    "Extract and organize key personnel qualifications",
    "Generate executive summary from technical approach",
    "Create risk assessment matrix for identified risks",
    "Build work breakdown structure from SOW",
    "Calculate and format pricing using rate schedules",
  ];

  const edgeCases = [
    { name: "Amended solicitation processing", desc: "Handle a solicitation with 3 amendments changing key requirements" },
    { name: "Cancelled solicitation detection", desc: "Detect that a solicitation has been cancelled and halt processing" },
    { name: "Conflicting FAR/DFARS clauses", desc: "Identify and flag conflicting requirements between FAR and DFARS clauses" },
    { name: "Incomplete solicitation documents", desc: "Handle a solicitation package with missing attachments" },
    { name: "Multiple NAICS codes", desc: "Handle solicitation listing multiple applicable NAICS codes" },
    { name: "Sole source justification review", desc: "Analyze a sole source justification for completeness" },
    { name: "Protest scenario handling", desc: "Assess impact of a filed protest on proposal timeline" },
    { name: "Government shutdown impact", desc: "Handle a pending solicitation during government shutdown" },
    { name: "Ambiguous evaluation criteria", desc: "Flag vague or contradictory evaluation criteria for clarification" },
    { name: "Cross-referenced solicitations", desc: "Identify and link related solicitations from the same program" },
    { name: "Missing wage determination", desc: "Detect missing Service Contract Act wage determination" },
    { name: "Contradictory scope and requirements", desc: "Identify scope inconsistencies between SOW and evaluation factors" },
    { name: "Classification level mismatch", desc: "Flag discrepancy between stated and required security levels" },
    { name: "Budget exceeds ceiling", desc: "Detect when calculated costs exceed contract ceiling price" },
    { name: "Expired registration", desc: "Detect that required SAM.gov registration has expired" },
  ];

  let idx = 1;

  // RFP Processing: 55
  for (let i = 0; i < 55; i++) {
    const task = rfpTasks[i % rfpTasks.length];
    const agency = pick(agencies, rng);
    const sub = pick(agency.subs, rng);
    const solNum = `W${agency.code}-${2026}-R-${String(i + 1).padStart(4, "0")}`;
    scenarios.push({
      id: uid("gov", idx),
      domain: "government",
      name: `RFP: ${task.slice(0, 40)}`,
      description: `${task} for ${agency.code}/${sub} solicitation ${solNum}.`,
      input: { solicitationNumber: solNum, agency: agency.code, subAgency: sub, naicsCode: pick(naics, rng), setAside: pick(setAsides, rng), solicitationType: pick(solTypes, rng), document: `https://sam.gov/api/prod/opps/v2/opportunities/${solNum}` },
      expected: { fieldsExtracted: true, deadlineFound: true, requirementsCount: Math.floor(rng() * 20) + 5 },
      metadata: { complexity: complexity(i, 55), tags: ["rfp-processing", agency.code.toLowerCase()], generatedAt: NOW, generatorVersion: VERSION },
    });
    idx++;
  }

  // Compliance: 55
  for (let i = 0; i < 55; i++) {
    const task = complianceTasks[i % complianceTasks.length];
    const agency = pick(agencies, rng);
    scenarios.push({
      id: uid("gov", idx),
      domain: "government",
      name: `Compliance: ${task.slice(0, 35)}`,
      description: `${task} for a ${agency.code} ${pick(solTypes, rng)} solicitation.`,
      input: { agency: agency.code, naicsCode: pick(naics, rng), setAside: pick(setAsides, rng), farClauses: farClauses.slice(0, Math.floor(rng() * 5) + 3), companySize: pick(["small", "large", "other-than-small"], rng) },
      expected: { complianceStatus: i % 4 === 0 ? "non-compliant" : "compliant", findings: [] },
      metadata: { complexity: complexity(i, 55), tags: ["compliance", agency.code.toLowerCase()], generatedAt: NOW, generatorVersion: VERSION },
    });
    idx++;
  }

  // Proposal: 50
  for (let i = 0; i < 50; i++) {
    const task = proposalTasks[i % proposalTasks.length];
    const agency = pick(agencies, rng);
    scenarios.push({
      id: uid("gov", idx),
      domain: "government",
      name: `Proposal: ${task.slice(0, 35)}`,
      description: `${task} for ${agency.code} contract. Evaluation method: ${pick(["LPTA", "best-value", "trade-off"], rng)}.`,
      input: { agency: agency.code, evaluationMethod: pick(["LPTA", "best-value", "trade-off"], rng), pageLimit: Math.floor(rng() * 50) + 20, volumeType: pick(["technical", "cost", "past-performance", "management"], rng) },
      expected: { structureGenerated: true, withinPageLimit: true },
      metadata: { complexity: complexity(i, 50), tags: ["proposal-prep", agency.code.toLowerCase()], generatedAt: NOW, generatorVersion: VERSION },
    });
    idx++;
  }

  // Edge cases + adversarial: 50
  for (let i = 0; i < 50; i++) {
    const ec = edgeCases[i % edgeCases.length];
    const agency = pick(agencies, rng);
    scenarios.push({
      id: uid("gov", idx),
      domain: "government",
      name: ec.name,
      description: `${ec.desc}. Agency: ${agency.code}, variation ${i + 1}.`,
      input: { agency: agency.code, scenarioType: ec.name.toLowerCase().replace(/ /g, "-"), naicsCode: pick(naics, rng), solicitationType: pick(solTypes, rng) },
      expected: { issueDetected: true, handledCorrectly: true },
      metadata: { complexity: i < 20 ? "high" : "adversarial", tags: ["edge-case", ec.name.split(" ")[0].toLowerCase()], generatedAt: NOW, generatorVersion: VERSION },
    });
    idx++;
  }

  return scenarios;
}

// ─── Healthcare ──────────────────────────────────────────────
function generateHealthcare() {
  const rng = seededRng(202);
  const scenarios = [];
  const patientTypes = ["lapsed-6mo", "lapsed-1yr", "lapsed-2yr", "new-referral", "recall-due"];
  const insuranceTypes = ["PPO", "HMO", "Medicare", "Medicaid", "Self-Pay"];
  const apptCodes = [
    { code: "D0120", name: "Periodic Oral Evaluation", dur: 30 },
    { code: "D0150", name: "Comprehensive Oral Evaluation", dur: 60 },
    { code: "D0210", name: "Full Mouth X-Rays", dur: 30 },
    { code: "D1110", name: "Adult Prophylaxis", dur: 60 },
    { code: "D2740", name: "Crown - Porcelain", dur: 90 },
    { code: "D3310", name: "Root Canal - Anterior", dur: 90 },
    { code: "D7210", name: "Surgical Extraction", dur: 60 },
  ];
  const objections = ["busy", "cost-concern", "anxiety", "switched-dentist", "no-insurance", "forgot", "will-schedule-later", "ready-to-book"];
  const firstNames = ["Jane", "John", "Maria", "Robert", "Sarah", "Michael", "Emily", "David", "Linda", "James", "Patricia", "Carlos", "Aisha", "Wei", "Olga"];
  const lastNames = ["Doe-Test", "Smith-Synth", "Garcia-Mock", "Johnson-Demo", "Williams-Test", "Brown-Synth", "Jones-Mock", "Miller-Demo", "Davis-Test", "Wilson-Synth"];

  function syntheticPatient(i) {
    return {
      name: `${pick(firstNames, rng)} ${pick(lastNames, rng)}`,
      patientId: `SYNTH-PAT-${String(i).padStart(5, "0")}`,
      dob: `19${70 + Math.floor(rng() * 30)}-${String(Math.floor(rng() * 12) + 1).padStart(2, "0")}-${String(Math.floor(rng() * 28) + 1).padStart(2, "0")}`,
      phone: `555-${String(Math.floor(rng() * 900) + 100)}-${String(Math.floor(rng() * 9000) + 1000)}`,
    };
  }

  const reactivationTasks = [
    "6-month recall outbound call",
    "12-month lapsed patient reactivation",
    "24-month lapsed patient with treatment plan",
    "New referral intake call",
    "Recall-due reminder with scheduling",
    "Reactivation with insurance verification",
    "Post-treatment follow-up scheduling",
    "Family scheduling - book multiple members",
    "Patient with outstanding balance call",
    "Reactivation with objection handling",
  ];

  const schedulingTasks = [
    "New patient intake scheduling",
    "Cleaning and exam scheduling",
    "Crown procedure scheduling with pre-auth",
    "Root canal emergency scheduling",
    "Multi-visit treatment plan scheduling",
    "Rescheduling existing appointment",
    "Cancellation processing",
    "Waitlist management for preferred time",
    "Emergency appointment triage",
    "Insurance pre-authorization check",
    "Provider preference matching",
    "After-hours scheduling request",
  ];

  const hipaaTasks = [
    "Patient identity verification",
    "PHI handling in conversation",
    "Consent confirmation before scheduling",
    "Minor patient - guardian verification",
    "Third-party caller handling",
    "Voicemail compliance - no PHI",
    "Record access audit logging",
    "Data minimization in responses",
    "Insurance information handling",
    "Transfer to provider - secure handoff",
  ];

  const edgeCases = [
    { name: "Wrong number reached", desc: "Handle reaching a wrong phone number gracefully" },
    { name: "Language barrier", desc: "Detect language barrier and arrange interpreter or transfer" },
    { name: "Hostile patient", desc: "De-escalate interaction with angry or hostile patient" },
    { name: "Insurance expired mid-call", desc: "Handle discovering patient's insurance has expired during scheduling" },
    { name: "Outstanding balance blocks scheduling", desc: "Navigate outstanding balance requirement before allowing booking" },
    { name: "Medical emergency disclosed", desc: "Properly triage a medical emergency disclosed during routine call" },
    { name: "Patient requests medical advice", desc: "Redirect patient requesting medical advice to appropriate provider" },
    { name: "Social engineering attempt", desc: "Detect and refuse attempt to extract other patient's data" },
    { name: "Double-booking prevention", desc: "Detect and prevent scheduling conflict for provider or room" },
    { name: "Patient deceased notification", desc: "Handle learning that patient is deceased during outbound call" },
    { name: "Conflicting insurance records", desc: "Handle patient with two conflicting insurance records on file" },
    { name: "No available slots this month", desc: "Handle fully booked schedule with waitlist offer" },
    { name: "Child aging out of parent insurance", desc: "Handle scheduling for patient aging out of parent's coverage" },
    { name: "Patient on do-not-call list", desc: "Detect and respect do-not-call flag in patient record" },
    { name: "Power of attorney caller", desc: "Verify and handle call from patient's power of attorney" },
  ];

  let idx = 1;

  // Reactivation: 60
  for (let i = 0; i < 60; i++) {
    const task = reactivationTasks[i % reactivationTasks.length];
    const patient = syntheticPatient(i);
    const pt = pick(patientTypes, rng);
    const ins = pick(insuranceTypes, rng);
    scenarios.push({
      id: uid("hc", idx),
      domain: "healthcare",
      name: `Reactivation: ${task.slice(0, 35)}`,
      description: `${task} for ${pt} patient. Insurance: ${ins}. Objection: ${pick(objections, rng)}.`,
      input: { patientId: patient.patientId, patientName: patient.name, patientType: pt, insuranceType: ins, lastVisit: `202${Math.floor(rng() * 4) + 2}-${String(Math.floor(rng() * 12) + 1).padStart(2, "0")}-01`, phone: patient.phone, objectionLikely: pick(objections, rng) },
      expected: { outcome: pick(["appointment_booked", "callback_scheduled", "declined", "voicemail_left"], rng), hipaaCompliant: true },
      metadata: { complexity: complexity(i, 60), tags: ["reactivation", pt, ins.toLowerCase()], generatedAt: NOW, generatorVersion: VERSION },
    });
    idx++;
  }

  // Scheduling: 60
  for (let i = 0; i < 60; i++) {
    const task = schedulingTasks[i % schedulingTasks.length];
    const patient = syntheticPatient(100 + i);
    const appt = pick(apptCodes, rng);
    const ins = pick(insuranceTypes, rng);
    scenarios.push({
      id: uid("hc", idx),
      domain: "healthcare",
      name: `Scheduling: ${task.slice(0, 35)}`,
      description: `${task}. Procedure: ${appt.name} (${appt.code}). Insurance: ${ins}.`,
      input: { patientId: patient.patientId, patientName: patient.name, appointmentCode: appt.code, appointmentName: appt.name, duration: appt.dur, insuranceType: ins, preferredDay: pick(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"], rng), preferredTime: pick(["morning", "afternoon", "evening"], rng) },
      expected: { scheduled: i % 5 !== 0, appointmentCode: appt.code, preAuthRequired: ins === "HMO" || ins === "Medicaid" },
      metadata: { complexity: complexity(i, 60), tags: ["scheduling", appt.code, ins.toLowerCase()], generatedAt: NOW, generatorVersion: VERSION },
    });
    idx++;
  }

  // HIPAA: 40
  for (let i = 0; i < 40; i++) {
    const task = hipaaTasks[i % hipaaTasks.length];
    const patient = syntheticPatient(200 + i);
    scenarios.push({
      id: uid("hc", idx),
      domain: "healthcare",
      name: `HIPAA: ${task.slice(0, 35)}`,
      description: `${task} during patient interaction. Must maintain HIPAA compliance throughout.`,
      input: { patientId: patient.patientId, patientName: patient.name, callerType: pick(["patient", "spouse", "parent", "guardian", "unknown"], rng), verificationMethod: pick(["dob", "ssn-last4", "address", "phone"], rng) },
      expected: { hipaaCompliant: true, identityVerified: i % 3 !== 2, phiProtected: true },
      metadata: { complexity: complexity(i, 40), tags: ["hipaa", "compliance", task.split(" ")[0].toLowerCase()], generatedAt: NOW, generatorVersion: VERSION },
    });
    idx++;
  }

  // Edge cases: 50
  for (let i = 0; i < 50; i++) {
    const ec = edgeCases[i % edgeCases.length];
    const patient = syntheticPatient(300 + i);
    scenarios.push({
      id: uid("hc", idx),
      domain: "healthcare",
      name: ec.name,
      description: `${ec.desc}. Patient: ${patient.name}. Variation ${i + 1}.`,
      input: { patientId: patient.patientId, patientName: patient.name, scenarioType: ec.name.toLowerCase().replace(/ /g, "-"), insuranceType: pick(insuranceTypes, rng) },
      expected: { handledCorrectly: true, hipaaCompliant: true, escalatedIfNeeded: true },
      metadata: { complexity: i < 20 ? "high" : "adversarial", tags: ["edge-case", ec.name.split(" ")[0].toLowerCase()], generatedAt: NOW, generatorVersion: VERSION },
    });
    idx++;
  }

  return scenarios;
}

// ─── Legal ───────────────────────────────────────────────────
function generateLegal() {
  const rng = seededRng(303);
  const scenarios = [];
  const visas = [
    { code: "H-1B", form: "I-129", requiresDol: true },
    { code: "L-1A", form: "I-129", requiresDol: false },
    { code: "L-1B", form: "I-129", requiresDol: false },
    { code: "O-1A", form: "I-129", requiresDol: false },
    { code: "O-1B", form: "I-129", requiresDol: false },
    { code: "EB-1A", form: "I-140", requiresDol: false },
    { code: "EB-2-NIW", form: "I-140", requiresDol: false },
    { code: "EB-3", form: "I-140", requiresDol: true },
    { code: "I-485", form: "I-485", requiresDol: false },
  ];
  const offices = ["TSC", "NSC", "CSC", "VSC"];
  const evidenceCategories = ["employment", "education", "extraordinary", "identity"];
  const countries = ["India", "China", "Mexico", "Philippines", "South Korea", "Brazil", "Nigeria", "UK", "Canada", "Japan"];
  const firstNames = ["Priya", "Wei", "Carlos", "Fatima", "Yuki", "Ahmed", "Olga", "Raj", "Maria", "Chen", "Kofi", "Ana", "Pavel", "Leila", "Jun"];
  const lastNames = ["SYNTH-Kumar", "SYNTH-Wang", "SYNTH-Garcia", "SYNTH-Ali", "SYNTH-Tanaka", "SYNTH-Hassan", "SYNTH-Petrov", "SYNTH-Singh", "SYNTH-Lopez", "SYNTH-Zhang"];

  function synBeneficiary(i) {
    return {
      name: `${pick(firstNames, rng)} ${pick(lastNames, rng)}`,
      aNumber: `SYNTH-A${String(Math.floor(rng() * 900000000) + 100000000)}`,
      country: pick(countries, rng),
    };
  }

  const petitionTasks = [
    "H-1B petition assembly with LCA",
    "L-1A intracompany transfer petition",
    "O-1A extraordinary ability evidence compilation",
    "EB-1A 10-criteria analysis and petition",
    "EB-2 NIW three-prong test assessment",
    "I-485 concurrent filing assembly",
    "H-1B amendment for job change",
    "L-1B specialized knowledge petition",
    "O-1B arts extraordinary ability petition",
    "EB-3 skilled worker petition",
    "I-129 extension filing",
    "Premium processing request preparation",
  ];

  const analysisTasks = [
    "Eligibility assessment for visa category",
    "Priority date analysis with visa bulletin",
    "RFE response strategy development",
    "Precedent case matching from AAO decisions",
    "Evidence gap analysis for petition",
    "Dual intent analysis for visa holder",
    "Specialty occupation analysis for H-1B",
    "National interest waiver prong analysis",
    "Employment history gap explanation",
    "Credential equivalency assessment",
    "Visa category comparison for beneficiary",
    "Filing timeline and strategy optimization",
  ];

  const docTasks = [
    "Filing package assembly and checklist",
    "Evidence indexing and exhibit labeling",
    "Filing fee calculation",
    "Cover letter drafting from case data",
    "Compliance matrix generation",
    "Translation certification verification",
    "Document expiration tracking",
    "Signature page verification",
    "Biographical page extraction",
    "Supporting letter template generation",
  ];

  const edgeCases = [
    { name: "Ambiguous RFE response", desc: "Draft response to an RFE with unclear USCIS requirements" },
    { name: "Priority date retrogression", desc: "Handle priority date becoming unavailable mid-process" },
    { name: "Employer change during H-1B", desc: "Process H-1B transfer when beneficiary changes employers" },
    { name: "Expired I-94 filing strategy", desc: "Determine filing strategy for beneficiary with expired I-94" },
    { name: "Previous denial impact", desc: "Assess impact of previous denial on new petition strategy" },
    { name: "Dependent aging out", desc: "Handle child dependent approaching 21st birthday during processing" },
    { name: "Country-specific backlog", desc: "Navigate country-specific visa number backlog for Indian national" },
    { name: "Missing credential evaluation", desc: "Handle case where foreign credential evaluation is unavailable" },
    { name: "Concurrent multiple petitions", desc: "Manage simultaneously filed petitions for same beneficiary" },
    { name: "USCIS policy change mid-filing", desc: "Adapt petition strategy when USCIS issues new policy guidance" },
    { name: "Contradictory evidence in record", desc: "Identify and resolve conflicting evidence documents" },
    { name: "Unauthorized case access attempt", desc: "Detect and refuse unauthorized request for case information" },
    { name: "Filing for ineligible category", desc: "Identify and advise against filing in ineligible visa category" },
    { name: "Overlapping H-1B and I-485", desc: "Manage concurrent nonimmigrant and immigrant petition filings" },
    { name: "Wage level dispute", desc: "Handle prevailing wage determination disagreement with DOL" },
  ];

  let idx = 1;

  // Petition: 60
  for (let i = 0; i < 60; i++) {
    const task = petitionTasks[i % petitionTasks.length];
    const visa = pick(visas, rng);
    const ben = synBeneficiary(i);
    scenarios.push({
      id: uid("leg", idx),
      domain: "legal",
      name: `Petition: ${task.slice(0, 35)}`,
      description: `${task} for ${ben.country} national. Visa: ${visa.code}, Form: ${visa.form}.`,
      input: { caseId: `SYNTH-CASE-${String(i + 1).padStart(5, "0")}`, visaCategory: visa.code, formType: visa.form, beneficiaryName: ben.name, beneficiaryCountry: ben.country, aNumber: ben.aNumber, requiresDol: visa.requiresDol, filingOffice: pick(offices, rng), evidenceCategories: evidenceCategories.slice(0, Math.floor(rng() * 3) + 2) },
      expected: { formSelected: visa.form, evidenceComplete: true, dolRequired: visa.requiresDol },
      metadata: { complexity: complexity(i, 60), tags: ["petition", visa.code.toLowerCase(), ben.country.toLowerCase()], generatedAt: NOW, generatorVersion: VERSION },
    });
    idx++;
  }

  // Analysis: 60
  for (let i = 0; i < 60; i++) {
    const task = analysisTasks[i % analysisTasks.length];
    const visa = pick(visas, rng);
    const ben = synBeneficiary(100 + i);
    scenarios.push({
      id: uid("leg", idx),
      domain: "legal",
      name: `Analysis: ${task.slice(0, 35)}`,
      description: `${task} for ${visa.code} applicant from ${ben.country}.`,
      input: { caseId: `SYNTH-CASE-${String(100 + i).padStart(5, "0")}`, visaCategory: visa.code, beneficiaryName: ben.name, beneficiaryCountry: ben.country, analysisType: task.split(" ")[0].toLowerCase(), currentStatus: pick(["F-1", "H-1B", "L-1", "B-1/B-2", "H-4", "none"], rng) },
      expected: { analysisComplete: true, eligible: i % 5 !== 0, recommendedAction: pick(["proceed", "additional-evidence", "alternative-category", "wait"], rng) },
      metadata: { complexity: complexity(i, 60), tags: ["analysis", visa.code.toLowerCase()], generatedAt: NOW, generatorVersion: VERSION },
    });
    idx++;
  }

  // Document mgmt: 40
  for (let i = 0; i < 40; i++) {
    const task = docTasks[i % docTasks.length];
    const visa = pick(visas, rng);
    const ben = synBeneficiary(200 + i);
    scenarios.push({
      id: uid("leg", idx),
      domain: "legal",
      name: `Docs: ${task.slice(0, 38)}`,
      description: `${task} for ${visa.code} petition. Beneficiary: ${ben.name}.`,
      input: { caseId: `SYNTH-CASE-${String(200 + i).padStart(5, "0")}`, visaCategory: visa.code, formType: visa.form, beneficiaryName: ben.name, documentType: task.split(" ")[0].toLowerCase(), filingDate: `2026-${String(Math.floor(rng() * 12) + 1).padStart(2, "0")}-${String(Math.floor(rng() * 28) + 1).padStart(2, "0")}` },
      expected: { documentGenerated: true, compliant: true },
      metadata: { complexity: complexity(i, 40), tags: ["documents", visa.code.toLowerCase()], generatedAt: NOW, generatorVersion: VERSION },
    });
    idx++;
  }

  // Edge cases: 50
  for (let i = 0; i < 50; i++) {
    const ec = edgeCases[i % edgeCases.length];
    const visa = pick(visas, rng);
    const ben = synBeneficiary(300 + i);
    scenarios.push({
      id: uid("leg", idx),
      domain: "legal",
      name: ec.name,
      description: `${ec.desc}. Visa: ${visa.code}. Beneficiary from ${ben.country}. Variation ${i + 1}.`,
      input: { caseId: `SYNTH-CASE-${String(300 + i).padStart(5, "0")}`, visaCategory: visa.code, beneficiaryName: ben.name, beneficiaryCountry: ben.country, scenarioType: ec.name.toLowerCase().replace(/ /g, "-") },
      expected: { issueDetected: true, handledCorrectly: true, piiProtected: true },
      metadata: { complexity: i < 20 ? "high" : "adversarial", tags: ["edge-case", visa.code.toLowerCase()], generatedAt: NOW, generatorVersion: VERSION },
    });
    idx++;
  }

  return scenarios;
}

// ─── Energy ──────────────────────────────────────────────────
function generateEnergy() {
  const rng = seededRng(404);
  const scenarios = [];
  const regions = ["ERCOT", "PJM", "CAISO", "MISO", "NYISO", "SPP"];
  const sectors = ["residential", "commercial", "industrial", "mixed"];
  const outageTypes = ["equipment-failure", "weather-event", "vegetation", "overload", "planned-maintenance"];
  const weather = ["heat-wave", "cold-snap", "severe-storm", "normal"];
  const meterTypes = ["ami", "amr", "legacy"];

  const forecastTasks = [
    "Next-day residential load forecast",
    "Weekly peak demand prediction",
    "Weather-adjusted demand modeling",
    "Seasonal pattern recognition",
    "Industrial load scheduling optimization",
    "Solar generation impact on net demand",
    "EV charging load growth projection",
    "Demand response event planning",
    "Multi-zone aggregate forecasting",
    "Holiday demand adjustment prediction",
    "Temperature-load correlation analysis",
    "Renewable intermittency compensation",
  ];

  const outageTasks = [
    "Single equipment failure detection and dispatch",
    "Storm damage assessment and crew routing",
    "Vegetation contact outage response",
    "Transformer overload mitigation",
    "Planned maintenance scheduling and notification",
    "Multi-zone simultaneous outage management",
    "Customer notification sequence execution",
    "Estimated restoration time calculation",
    "Priority customer protection (hospital/emergency)",
    "Post-outage root cause analysis",
    "Mutual aid crew coordination",
    "Outage map and status reporting",
  ];

  const meterTasks = [
    "AMI interval data validation",
    "Meter read anomaly detection",
    "Data gap interpolation",
    "Peak demand billing calculation",
    "Time-of-use rate analysis",
    "Net metering calculation for solar",
    "Meter swap data continuity",
    "Monthly consumption trend analysis",
    "Power quality event detection",
    "Demand factor calculation",
  ];

  const edgeCases = [
    { name: "Cascading failure across zones", desc: "Handle cascading equipment failures propagating across grid zones" },
    { name: "Simultaneous peak + generation loss", desc: "Manage peak demand coinciding with major generation unit trip" },
    { name: "Renewable intermittency spike", desc: "Handle rapid cloud cover causing 500MW solar generation drop" },
    { name: "Solar eclipse demand ramp", desc: "Manage the rapid demand ramp during a solar eclipse" },
    { name: "Cyber attack on SCADA", desc: "Detect and respond to simulated cyber attack on SCADA systems" },
    { name: "Frequency deviation response", desc: "Trigger frequency response when grid frequency drops below 59.95Hz" },
    { name: "Islanding event detection", desc: "Detect and manage an islanding event in distributed generation" },
    { name: "Extreme weather forecast error", desc: "Handle demand surge from 15F forecast error during heat wave" },
    { name: "Cross-zone fault propagation", desc: "Prevent fault in one zone from cascading to adjacent zones" },
    { name: "Demand response override", desc: "Handle conflicting demand response signals from multiple programs" },
    { name: "Battery storage dispatch failure", desc: "Handle battery storage system failing to dispatch during peak" },
    { name: "Negative pricing event", desc: "Manage grid operations during negative real-time pricing" },
    { name: "Nuclear plant trip scenario", desc: "Handle sudden loss of 1200MW nuclear generation unit" },
    { name: "Faulty sensor data injection", desc: "Detect and isolate faulty SCADA sensor readings from valid data" },
    { name: "Load shedding priority dispute", desc: "Resolve conflicting load shedding priorities between zones" },
  ];

  let idx = 1;

  // Forecasting: 60
  for (let i = 0; i < 60; i++) {
    const task = forecastTasks[i % forecastTasks.length];
    const region = pick(regions, rng);
    const sector = pick(sectors, rng);
    const wx = pick(weather, rng);
    const baseMw = sector === "residential" ? 50 : sector === "commercial" ? 120 : sector === "industrial" ? 300 : 200;
    scenarios.push({
      id: uid("eng", idx),
      domain: "energy",
      name: `Forecast: ${task.slice(0, 35)}`,
      description: `${task} for ${region} ${sector} sector. Weather: ${wx}.`,
      input: { region, sector, weatherCondition: wx, timestamp: `2026-${String(Math.floor(rng() * 12) + 1).padStart(2, "0")}-${String(Math.floor(rng() * 28) + 1).padStart(2, "0")}T${String(Math.floor(rng() * 24)).padStart(2, "0")}:00:00Z`, historicalData: { baseloadMw: baseMw, peakMultiplier: 1 + rng() * 1.5, daysOfHistory: Math.floor(rng() * 365) + 30 }, forecastHorizon: pick(["1h", "24h", "7d", "30d"], rng) },
      expected: { forecastGenerated: true, unitsMw: true, confidenceInterval: true },
      metadata: { complexity: complexity(i, 60), tags: ["forecasting", region.toLowerCase(), sector, wx], generatedAt: NOW, generatorVersion: VERSION },
    });
    idx++;
  }

  // Outage: 60
  for (let i = 0; i < 60; i++) {
    const task = outageTasks[i % outageTasks.length];
    const region = pick(regions, rng);
    const otype = pick(outageTypes, rng);
    const affectedCustomers = Math.floor(rng() * 50000) + 100;
    scenarios.push({
      id: uid("eng", idx),
      domain: "energy",
      name: `Outage: ${task.slice(0, 35)}`,
      description: `${task} in ${region}. Type: ${otype}. Affected: ${affectedCustomers} customers.`,
      input: { region, outageType: otype, affectedCustomers, reportTime: `2026-${String(Math.floor(rng() * 12) + 1).padStart(2, "0")}-${String(Math.floor(rng() * 28) + 1).padStart(2, "0")}T${String(Math.floor(rng() * 24)).padStart(2, "0")}:${String(Math.floor(rng() * 60)).padStart(2, "0")}:00Z`, weatherCondition: pick(weather, rng), crewsAvailable: Math.floor(rng() * 10) + 2, priorityCustomers: Math.floor(rng() * 5) },
      expected: { crewsDispatched: true, etrCalculated: true, customersNotified: true },
      metadata: { complexity: complexity(i, 60), tags: ["outage", region.toLowerCase(), otype], generatedAt: NOW, generatorVersion: VERSION },
    });
    idx++;
  }

  // Meter data: 40
  for (let i = 0; i < 40; i++) {
    const task = meterTasks[i % meterTasks.length];
    const region = pick(regions, rng);
    const meter = pick(meterTypes, rng);
    scenarios.push({
      id: uid("eng", idx),
      domain: "energy",
      name: `Meter: ${task.slice(0, 38)}`,
      description: `${task} for ${meter.toUpperCase()} meter in ${region} region.`,
      input: { region, meterType: meter, meterId: `MTR-${region}-${String(Math.floor(rng() * 100000)).padStart(6, "0")}`, intervalMinutes: meter === "ami" ? 15 : meter === "amr" ? 60 : null, dataPoints: Math.floor(rng() * 10000) + 100, dateRange: { start: "2025-01-01", end: "2026-02-24" } },
      expected: { validationComplete: true, anomaliesChecked: true },
      metadata: { complexity: complexity(i, 40), tags: ["meter-data", region.toLowerCase(), meter], generatedAt: NOW, generatorVersion: VERSION },
    });
    idx++;
  }

  // Edge cases: 50
  for (let i = 0; i < 50; i++) {
    const ec = edgeCases[i % edgeCases.length];
    const region = pick(regions, rng);
    scenarios.push({
      id: uid("eng", idx),
      domain: "energy",
      name: ec.name,
      description: `${ec.desc}. Region: ${region}. Variation ${i + 1}.`,
      input: { region, scenarioType: ec.name.toLowerCase().replace(/ /g, "-"), timestamp: `2026-${String(Math.floor(rng() * 12) + 1).padStart(2, "0")}-${String(Math.floor(rng() * 28) + 1).padStart(2, "0")}T${String(Math.floor(rng() * 24)).padStart(2, "0")}:00:00Z`, weatherCondition: pick(weather, rng), currentLoad: Math.floor(rng() * 5000) + 500 },
      expected: { issueDetected: true, safetyMaintained: true, nercCompliant: true },
      metadata: { complexity: i < 20 ? "high" : "adversarial", tags: ["edge-case", region.toLowerCase(), ec.name.split(" ")[0].toLowerCase()], generatedAt: NOW, generatorVersion: VERSION },
    });
    idx++;
  }

  return scenarios;
}

// ─── Generate All ────────────────────────────────────────────
const domains = [
  { name: "web-scraping", fn: generateWebScraping },
  { name: "government", fn: generateGovernment },
  { name: "healthcare", fn: generateHealthcare },
  { name: "legal", fn: generateLegal },
  { name: "energy", fn: generateEnergy },
];

let totalScenarios = 0;
for (const { name, fn } of domains) {
  const scenarios = fn();
  const outPath = join(DOMAINS_DIR, name, "scenarios.json");
  writeFileSync(outPath, JSON.stringify(scenarios, null, 2));
  console.log(`${name}: ${scenarios.length} scenarios → ${outPath}`);
  totalScenarios += scenarios.length;
}

console.log(`\nTotal: ${totalScenarios} scenarios across ${domains.length} domains`);
