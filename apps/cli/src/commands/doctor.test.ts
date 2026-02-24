import { describe, it, expect, vi, beforeEach } from "vitest";
import { doctorCommand } from "./doctor.js";

vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
}));

import { existsSync } from "node:fs";

const mockedExistsSync = vi.mocked(existsSync);
const mockFetch = vi.fn();

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.stubGlobal("fetch", mockFetch);
});

describe("doctorCommand", () => {
  it("checks Node.js version", async () => {
    mockedExistsSync.mockReturnValue(true);
    mockFetch.mockRejectedValue(new Error("not running"));

    await doctorCommand();

    // Should have logged something about Node.js
    const logs = (console.log as ReturnType<typeof vi.fn>).mock.calls.flat().join("\n");
    expect(logs).toContain("Node.js");
  });

  it("checks for config file", async () => {
    mockedExistsSync.mockReturnValue(false);
    mockFetch.mockRejectedValue(new Error("not running"));

    await doctorCommand();

    const logs = (console.log as ReturnType<typeof vi.fn>).mock.calls.flat().join("\n");
    expect(logs).toContain("Config");
  });

  it("checks for API key", async () => {
    mockedExistsSync.mockReturnValue(true);
    mockFetch.mockRejectedValue(new Error("not running"));

    // Temporarily set env var
    const original = process.env["ANTHROPIC_API_KEY"];
    process.env["ANTHROPIC_API_KEY"] = "sk-test";

    await doctorCommand();

    const logs = (console.log as ReturnType<typeof vi.fn>).mock.calls.flat().join("\n");
    expect(logs).toContain("API Key");

    // Restore
    if (original) {
      process.env["ANTHROPIC_API_KEY"] = original;
    } else {
      delete process.env["ANTHROPIC_API_KEY"];
    }
  });

  it("checks dependencies directory", async () => {
    mockedExistsSync.mockImplementation((path) => {
      if (typeof path === "string" && path === "node_modules") return true;
      return false;
    });
    mockFetch.mockRejectedValue(new Error("not running"));

    await doctorCommand();

    const logs = (console.log as ReturnType<typeof vi.fn>).mock.calls.flat().join("\n");
    expect(logs).toContain("Dependencies");
  });
});
