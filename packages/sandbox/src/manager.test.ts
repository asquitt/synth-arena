import { describe, it, expect, vi, beforeEach } from "vitest";
import { SandboxManager } from "./manager.js";

// Mock child_process to avoid actual Docker commands
vi.mock("child_process", () => ({
  execSync: vi.fn(),
}));

describe("SandboxManager", () => {
  let manager: SandboxManager;

  beforeEach(() => {
    manager = new SandboxManager();
  });

  describe("create", () => {
    it("creates a sandbox with default config", async () => {
      const sandbox = await manager.create({
        environment: { services: [{ type: "mock-api", name: "api", config: {} }] },
      });

      expect(sandbox.id).toMatch(/^sb-/);
      expect(sandbox.status).toBe("ready");
      expect(sandbox.config.tier).toBe("docker");
      expect(sandbox.config.timeoutMs).toBe(300_000);
      expect(sandbox.config.resourceLimits.memoryMb).toBe(512);
      expect(sandbox.config.networkPolicy.blockExternal).toBe(true);
    });

    it("creates sandbox with custom tier", async () => {
      const sandbox = await manager.create({
        tier: "firecracker",
        environment: { services: [] },
      });

      expect(sandbox.config.tier).toBe("firecracker");
      expect(sandbox.status).toBe("ready"); // Firecracker is stubbed
    });

    it("assigns services with ports for docker tier", async () => {
      const sandbox = await manager.create({
        environment: {
          services: [
            { type: "mock-api", name: "api", config: {} },
            { type: "mock-website", name: "site", config: {} },
          ],
        },
      });

      expect(sandbox.services).toHaveLength(2);
      expect(sandbox.services[0]!.name).toBe("api");
      expect(sandbox.services[1]!.name).toBe("site");
      expect(sandbox.services[0]!.port).toBeGreaterThan(0);
      expect(sandbox.services[1]!.port).toBeGreaterThan(0);
      expect(sandbox.services[0]!.port).not.toBe(sandbox.services[1]!.port);
    });

    it("sets network address for docker sandbox", async () => {
      const sandbox = await manager.create({
        environment: { services: [{ type: "mock-api", name: "api", config: {} }] },
      });

      expect(sandbox.networkAddress).toBe("localhost");
    });

    it("applies custom resource limits", async () => {
      const sandbox = await manager.create({
        environment: { services: [] },
        resourceLimits: { memoryMb: 1024, cpuShares: 512, maxProcesses: 128, diskMb: 2048 },
      });

      expect(sandbox.config.resourceLimits.memoryMb).toBe(1024);
      expect(sandbox.config.resourceLimits.cpuShares).toBe(512);
    });

    it("records creation timestamp", async () => {
      const before = Date.now();
      const sandbox = await manager.create({ environment: { services: [] } });

      expect(sandbox.createdAt).toBeGreaterThanOrEqual(before);
      expect(sandbox.createdAt).toBeLessThanOrEqual(Date.now());
    });
  });

  describe("destroy", () => {
    it("removes sandbox from manager", async () => {
      const sandbox = await manager.create({ environment: { services: [] } });
      expect(manager.get(sandbox.id)).toBeDefined();

      await manager.destroy(sandbox.id);
      expect(manager.get(sandbox.id)).toBeUndefined();
    });

    it("handles destroying nonexistent sandbox gracefully", async () => {
      await manager.destroy("nonexistent"); // Should not throw
    });
  });

  describe("destroyAll", () => {
    it("removes all sandboxes", async () => {
      await manager.create({ environment: { services: [] } });
      await manager.create({ environment: { services: [] } });
      expect(manager.list()).toHaveLength(2);

      await manager.destroyAll();
      expect(manager.list()).toHaveLength(0);
    });
  });

  describe("get", () => {
    it("returns sandbox by id", async () => {
      const sandbox = await manager.create({ environment: { services: [] } });
      const found = manager.get(sandbox.id);

      expect(found).toBeDefined();
      expect(found!.id).toBe(sandbox.id);
    });

    it("returns undefined for unknown id", () => {
      expect(manager.get("nonexistent")).toBeUndefined();
    });
  });

  describe("list", () => {
    it("returns all sandboxes", async () => {
      await manager.create({ environment: { services: [] } });
      await manager.create({ environment: { services: [] } });

      const list = manager.list();
      expect(list).toHaveLength(2);
    });

    it("returns empty array when no sandboxes", () => {
      expect(manager.list()).toHaveLength(0);
    });
  });

  describe("generateSeccompProfile", () => {
    it("generates a valid seccomp profile", () => {
      const profile = SandboxManager.generateSeccompProfile();

      expect(profile.defaultAction).toBe("SCMP_ACT_ERRNO");
      expect(profile.architectures).toContain("SCMP_ARCH_X86_64");
      expect(profile.architectures).toContain("SCMP_ARCH_AARCH64");
      expect(Array.isArray(profile.syscalls)).toBe(true);
    });

    it("blocks dangerous syscalls", () => {
      const profile = SandboxManager.generateSeccompProfile();
      const syscalls = profile.syscalls as Array<{ names: string[]; action: string }>;

      const blocked = syscalls.find((s) => s.names.includes("ptrace"));
      expect(blocked).toBeDefined();
      expect(blocked!.action).toBe("SCMP_ACT_ERRNO");
    });

    it("allows basic operations", () => {
      const profile = SandboxManager.generateSeccompProfile();
      const syscalls = profile.syscalls as Array<{ names: string[]; action: string }>;

      const basic = syscalls.find((s) => s.names.includes("read"));
      expect(basic).toBeDefined();
      expect(basic!.action).toBe("SCMP_ACT_ALLOW");
    });
  });
});
