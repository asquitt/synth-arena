import { describe, it, expect } from "vitest";
import {
  WEB_SCRAPING_TEMPLATE,
  GOVERNMENT_TEMPLATE,
  HEALTHCARE_TEMPLATE,
  DOMAIN_TEMPLATES,
  getTemplate,
  listTemplates,
} from "./templates.js";

describe("built-in templates", () => {
  it("web-scraping template has required fields", () => {
    expect(WEB_SCRAPING_TEMPLATE.name).toBe("web-scraping");
    expect(WEB_SCRAPING_TEMPLATE.version).toBe("0.1.0");
    expect(WEB_SCRAPING_TEMPLATE.description).toBeTruthy();
    expect(WEB_SCRAPING_TEMPLATE.scenarioGenerators.length).toBeGreaterThan(0);
    expect(WEB_SCRAPING_TEMPLATE.constraints.length).toBeGreaterThan(0);
    expect(WEB_SCRAPING_TEMPLATE.defaultScorers.length).toBeGreaterThan(0);
  });

  it("government template has required fields", () => {
    expect(GOVERNMENT_TEMPLATE.name).toBe("government");
    expect(GOVERNMENT_TEMPLATE.scenarioGenerators.length).toBeGreaterThan(0);
    expect(GOVERNMENT_TEMPLATE.constraints.length).toBeGreaterThan(0);
  });

  it("healthcare template has required fields", () => {
    expect(HEALTHCARE_TEMPLATE.name).toBe("healthcare");
    expect(HEALTHCARE_TEMPLATE.scenarioGenerators.length).toBeGreaterThan(0);
    expect(HEALTHCARE_TEMPLATE.constraints.length).toBeGreaterThan(0);
  });

  it("all templates have LLM generators with prompts", () => {
    for (const template of Object.values(DOMAIN_TEMPLATES)) {
      for (const gen of template.scenarioGenerators) {
        expect(gen.name).toBeTruthy();
        expect(gen.type).toBe("llm");
        expect(gen.prompt).toBeTruthy();
      }
    }
  });

  it("all templates have environment defaults", () => {
    for (const template of Object.values(DOMAIN_TEMPLATES)) {
      expect(template.environmentDefaults).toBeDefined();
      expect(template.environmentDefaults.services.length).toBeGreaterThan(0);
    }
  });
});

describe("getTemplate", () => {
  it("returns template for valid domain", () => {
    const template = getTemplate("web-scraping");
    expect(template).toBeDefined();
    expect(template?.name).toBe("web-scraping");
  });

  it("returns template for government domain", () => {
    const template = getTemplate("government");
    expect(template).toBeDefined();
    expect(template?.name).toBe("government");
  });

  it("returns undefined for unknown domain", () => {
    const template = getTemplate("nonexistent");
    expect(template).toBeUndefined();
  });

  it("returns undefined for empty string", () => {
    const template = getTemplate("");
    expect(template).toBeUndefined();
  });
});

describe("listTemplates", () => {
  it("returns all registered template names", () => {
    const templates = listTemplates();
    expect(templates).toContain("web-scraping");
    expect(templates).toContain("government");
    expect(templates).toContain("healthcare");
  });

  it("returns exactly 3 templates", () => {
    expect(listTemplates()).toHaveLength(3);
  });
});
