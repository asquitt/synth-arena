import { describe, it, expect, vi, beforeEach } from "vitest";
import { domainsCommand } from "./domains.js";

vi.mock("@syntharena/scenarios", () => ({
  listDomainDirs: vi.fn(),
  loadTemplate: vi.fn(),
  validateTemplate: vi.fn(),
}));

import { listDomainDirs, loadTemplate, validateTemplate } from "@syntharena/scenarios";

const mockedListDomainDirs = vi.mocked(listDomainDirs);
const mockedLoadTemplate = vi.mocked(loadTemplate);
const mockedValidateTemplate = vi.mocked(validateTemplate);

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
});

describe("domainsCommand", () => {
  it("shows message when no domains found", async () => {
    mockedListDomainDirs.mockReturnValue([]);

    await domainsCommand({ validate: false });

    const logs = (console.log as ReturnType<typeof vi.fn>).mock.calls.flat().join("\n");
    expect(logs).toContain("No domains found");
  });

  it("lists available domains", async () => {
    mockedListDomainDirs.mockReturnValue(["web-scraping", "healthcare"]);
    mockedLoadTemplate.mockImplementation((domain: string) => ({
      template: {
        name: domain,
        description: `${domain} domain`,
        version: "1.0",
        scenarioGenerators: [{ name: "gen1", type: "llm", config: {} }],
        environmentDefaults: { services: [] },
        defaultScorers: ["task_completion"],
        constraints: [{ name: "constraint1", description: "test", validator: "fn" }],
      },
      seeds: [],
    }));

    await domainsCommand({ validate: false });

    const logs = (console.log as ReturnType<typeof vi.fn>).mock.calls.flat().join("\n");
    expect(logs).toContain("web-scraping");
    expect(logs).toContain("healthcare");
    expect(logs).toContain("gen1");
  });

  it("validates templates when --validate flag is set", async () => {
    mockedListDomainDirs.mockReturnValue(["web-scraping"]);
    mockedLoadTemplate.mockReturnValue({
      template: {
        name: "web-scraping",
        description: "Web scraping domain",
        version: "1.0",
        scenarioGenerators: [],
        environmentDefaults: { services: [] },
        defaultScorers: [],
        constraints: [],
      },
      seeds: [],
    });
    mockedValidateTemplate.mockReturnValue([]);

    await domainsCommand({ validate: true });

    expect(mockedValidateTemplate).toHaveBeenCalled();
    const logs = (console.log as ReturnType<typeof vi.fn>).mock.calls.flat().join("\n");
    expect(logs).toContain("valid");
  });

  it("shows validation errors", async () => {
    mockedListDomainDirs.mockReturnValue(["bad-domain"]);
    mockedLoadTemplate.mockReturnValue({
      template: {
        name: "bad-domain",
        description: "Bad domain",
        version: "1.0",
        scenarioGenerators: [],
        environmentDefaults: { services: [] },
        defaultScorers: [],
        constraints: [],
      },
      seeds: [],
    });
    mockedValidateTemplate.mockReturnValue(["Missing generators", "No scorers defined"]);

    await domainsCommand({ validate: true });

    const logs = (console.log as ReturnType<typeof vi.fn>).mock.calls.flat().join("\n");
    expect(logs).toContain("2 errors");
  });

  it("handles template load errors gracefully", async () => {
    mockedListDomainDirs.mockReturnValue(["broken"]);
    mockedLoadTemplate.mockImplementation(() => {
      throw new Error("Template not found");
    });

    await domainsCommand({ validate: false });

    const logs = (console.log as ReturnType<typeof vi.fn>).mock.calls.flat().join("\n");
    expect(logs).toContain("Template not found");
  });
});
