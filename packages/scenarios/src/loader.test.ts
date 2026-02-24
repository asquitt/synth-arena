import { describe, it, expect, vi, beforeEach } from "vitest";
import { loadTemplate, listDomainDirs, validateTemplate } from "./loader.js";
import type { DomainTemplate } from "@syntharena/shared";

vi.mock("fs", () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  readdirSync: vi.fn(),
  statSync: vi.fn(),
}));

import { existsSync, readFileSync, readdirSync, statSync } from "fs";

const mockExistsSync = vi.mocked(existsSync);
const mockReadFileSync = vi.mocked(readFileSync);
const mockReaddirSync = vi.mocked(readdirSync);
const mockStatSync = vi.mocked(statSync);

const SAMPLE_TEMPLATE: DomainTemplate = {
  name: "test-domain",
  description: "Test domain for testing",
  version: "0.1.0",
  scenarioGenerators: [{ name: "gen1", type: "llm", prompt: "Generate tests", config: {} }],
  environmentDefaults: { services: [{ type: "mock-api", name: "api", config: {} }] },
  defaultScorers: ["task_completion"],
  constraints: [{ name: "rule1", description: "A rule", validator: "validateRule1" }],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("loadTemplate", () => {
  it("loads template and seeds from disk", () => {
    mockExistsSync.mockImplementation((path: unknown) => {
      const p = String(path);
      return p.includes("template.json") || p.includes("seeds.json");
    });
    mockReadFileSync.mockImplementation((path: unknown) => {
      const p = String(path);
      if (p.includes("template.json")) return JSON.stringify(SAMPLE_TEMPLATE);
      if (p.includes("seeds.json")) return JSON.stringify({ items: [1, 2, 3] });
      return "";
    });

    const result = loadTemplate("test-domain", "/tmp/domains");

    expect(result.template.name).toBe("test-domain");
    expect(result.seeds).toEqual({ items: [1, 2, 3] });
    expect(result.path).toContain("test-domain");
  });

  it("loads template without seeds when seeds.json missing", () => {
    mockExistsSync.mockImplementation((path: unknown) => {
      return String(path).includes("template.json");
    });
    mockReadFileSync.mockReturnValue(JSON.stringify(SAMPLE_TEMPLATE));

    const result = loadTemplate("test-domain", "/tmp/domains");

    expect(result.template.name).toBe("test-domain");
    expect(result.seeds).toEqual({});
  });

  it("throws when template.json not found", () => {
    mockExistsSync.mockReturnValue(false);
    mockReaddirSync.mockReturnValue([]);

    expect(() => loadTemplate("nonexistent", "/tmp/domains")).toThrow("Domain template not found");
  });
});

describe("listDomainDirs", () => {
  it("returns directories containing template.json", () => {
    mockExistsSync.mockImplementation((path: unknown) => {
      const p = String(path);
      return p === "/tmp/domains" || p.includes("domain-a/template.json") || p.includes("domain-b/template.json");
    });
    mockReaddirSync.mockReturnValue(["domain-a", "domain-b", "not-a-domain"] as unknown as ReturnType<typeof readdirSync>);
    mockStatSync.mockReturnValue({ isDirectory: () => true } as ReturnType<typeof statSync>);

    const dirs = listDomainDirs("/tmp/domains");

    expect(dirs).toContain("domain-a");
    expect(dirs).toContain("domain-b");
    expect(dirs).not.toContain("not-a-domain");
  });

  it("returns empty array when domains dir does not exist", () => {
    mockExistsSync.mockReturnValue(false);

    const dirs = listDomainDirs("/tmp/nonexistent");

    expect(dirs).toEqual([]);
  });

  it("excludes files (non-directories)", () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(["README.md"] as unknown as ReturnType<typeof readdirSync>);
    mockStatSync.mockReturnValue({ isDirectory: () => false } as ReturnType<typeof statSync>);

    const dirs = listDomainDirs("/tmp/domains");

    expect(dirs).toEqual([]);
  });
});

describe("validateTemplate", () => {
  it("returns no errors for a valid template", () => {
    const errors = validateTemplate(SAMPLE_TEMPLATE);
    expect(errors).toHaveLength(0);
  });

  it("catches missing name", () => {
    const errors = validateTemplate({ ...SAMPLE_TEMPLATE, name: "" });
    expect(errors).toContain("Template missing 'name'");
  });

  it("catches missing description", () => {
    const errors = validateTemplate({ ...SAMPLE_TEMPLATE, description: "" });
    expect(errors).toContain("Template missing 'description'");
  });

  it("catches missing version", () => {
    const errors = validateTemplate({ ...SAMPLE_TEMPLATE, version: "" });
    expect(errors).toContain("Template missing 'version'");
  });

  it("catches empty scenario generators", () => {
    const errors = validateTemplate({ ...SAMPLE_TEMPLATE, scenarioGenerators: [] });
    expect(errors).toContain("Template has no scenario generators");
  });

  it("catches empty constraints", () => {
    const errors = validateTemplate({ ...SAMPLE_TEMPLATE, constraints: [] });
    expect(errors).toContain("Template has no constraints");
  });

  it("catches generator missing name", () => {
    const template = {
      ...SAMPLE_TEMPLATE,
      scenarioGenerators: [{ name: "", type: "llm" as const, prompt: "test", config: {} }],
    };
    const errors = validateTemplate(template);
    expect(errors.some((e) => e.includes("Generator missing 'name'"))).toBe(true);
  });

  it("catches LLM generator missing prompt", () => {
    const template = {
      ...SAMPLE_TEMPLATE,
      scenarioGenerators: [{ name: "gen1", type: "llm" as const, prompt: "", config: {} }],
    };
    const errors = validateTemplate(template);
    expect(errors.some((e) => e.includes("missing 'prompt'"))).toBe(true);
  });

  it("does not require prompt for non-LLM generators", () => {
    const template = {
      ...SAMPLE_TEMPLATE,
      scenarioGenerators: [{ name: "gen1", type: "statistical" as const, config: {} }],
    };
    const errors = validateTemplate(template);
    expect(errors.some((e) => e.includes("missing 'prompt'"))).toBe(false);
  });
});
