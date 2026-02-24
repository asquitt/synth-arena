import { describe, it, expect, vi, beforeEach } from "vitest";
import { initCommand } from "./init.js";

vi.mock("fs", () => ({
  existsSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

import { existsSync, writeFileSync } from "fs";

const mockedExistsSync = vi.mocked(existsSync);
const mockedWriteFileSync = vi.mocked(writeFileSync);

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
});

describe("initCommand", () => {
  it("creates syntharena.yaml when it does not exist", async () => {
    mockedExistsSync.mockReturnValue(false);

    await initCommand();

    expect(mockedWriteFileSync).toHaveBeenCalledWith(
      "syntharena.yaml",
      expect.stringContaining("domain: web-scraping"),
      "utf-8",
    );
  });

  it("does not overwrite existing config", async () => {
    mockedExistsSync.mockReturnValue(true);

    await initCommand();

    expect(mockedWriteFileSync).not.toHaveBeenCalled();
  });

  it("config template contains expected sections", async () => {
    mockedExistsSync.mockReturnValue(false);

    await initCommand();

    const content = mockedWriteFileSync.mock.calls[0]![1] as string;
    expect(content).toContain("domain:");
    expect(content).toContain("scenarios:");
    expect(content).toContain("trials:");
    expect(content).toContain("scorers:");
    expect(content).toContain("cost:");
    expect(content).toContain("regression:");
    expect(content).toContain("output:");
  });
});
