import { execSync, type ChildProcess } from "child_process";
import { randomBytes } from "crypto";
import type { EnvironmentConfig, ServiceConfig } from "@syntharena/shared";

/**
 * Sandbox lifecycle manager.
 *
 * Tiered isolation:
 * - Tier 1: Docker + seccomp (dev/test)
 * - Tier 2: Firecracker microVMs (production, untrusted code)
 * - Tier 3: OS-level sandbox (bubblewrap/seatbelt for trusted tools)
 */

export type SandboxTier = "docker" | "firecracker" | "os-sandbox";

export interface SandboxConfig {
  tier: SandboxTier;
  environment: EnvironmentConfig;
  timeoutMs: number;
  networkPolicy: NetworkPolicy;
  resourceLimits: ResourceLimits;
}

export interface NetworkPolicy {
  allowedDomains: string[];
  blockExternal: boolean;
  proxyPort?: number;
}

export interface ResourceLimits {
  memoryMb: number;
  cpuShares: number;
  maxProcesses: number;
  diskMb: number;
}

export interface Sandbox {
  id: string;
  config: SandboxConfig;
  status: "creating" | "ready" | "running" | "stopped" | "error";
  services: RunningService[];
  createdAt: number;
  networkAddress?: string;
}

export interface RunningService {
  name: string;
  type: ServiceConfig["type"];
  port: number;
  process?: ChildProcess;
  containerId?: string;
}

const DEFAULT_RESOURCE_LIMITS: ResourceLimits = {
  memoryMb: 512,
  cpuShares: 256,
  maxProcesses: 64,
  diskMb: 1024,
};

const DEFAULT_NETWORK_POLICY: NetworkPolicy = {
  allowedDomains: [],
  blockExternal: true,
};

export class SandboxManager {
  private sandboxes = new Map<string, Sandbox>();

  async create(config: Partial<SandboxConfig> & { environment: EnvironmentConfig }): Promise<Sandbox> {
    const id = `sb-${randomBytes(8).toString("hex")}`;
    const fullConfig: SandboxConfig = {
      tier: config.tier ?? "docker",
      environment: config.environment,
      timeoutMs: config.timeoutMs ?? 300_000,
      networkPolicy: config.networkPolicy ?? DEFAULT_NETWORK_POLICY,
      resourceLimits: config.resourceLimits ?? DEFAULT_RESOURCE_LIMITS,
    };

    const sandbox: Sandbox = {
      id,
      config: fullConfig,
      status: "creating",
      services: [],
      createdAt: Date.now(),
    };

    this.sandboxes.set(id, sandbox);

    try {
      if (fullConfig.tier === "docker") {
        await this.createDockerSandbox(sandbox);
      } else {
        // Firecracker and OS-level sandboxes are future work
        sandbox.status = "ready";
      }
    } catch (err) {
      sandbox.status = "error";
      throw err;
    }

    return sandbox;
  }

  async destroy(sandboxId: string): Promise<void> {
    const sandbox = this.sandboxes.get(sandboxId);
    if (!sandbox) return;

    for (const service of sandbox.services) {
      if (service.containerId) {
        try {
          execSync(`docker rm -f ${service.containerId}`, { stdio: "ignore" });
        } catch {
          // Container may already be gone
        }
      }
      if (service.process) {
        service.process.kill("SIGTERM");
      }
    }

    sandbox.status = "stopped";
    this.sandboxes.delete(sandboxId);
  }

  async destroyAll(): Promise<void> {
    for (const id of this.sandboxes.keys()) {
      await this.destroy(id);
    }
  }

  get(sandboxId: string): Sandbox | undefined {
    return this.sandboxes.get(sandboxId);
  }

  list(): Sandbox[] {
    return Array.from(this.sandboxes.values());
  }

  private async createDockerSandbox(sandbox: Sandbox): Promise<void> {
    const { environment } = sandbox.config;
    let nextPort = 9000 + Math.floor(Math.random() * 1000);

    for (const service of environment.services) {
      const port = nextPort++;
      const runningService: RunningService = {
        name: service.name,
        type: service.type,
        port,
      };

      // For Docker tier, we use child processes to simulate services
      // In production, these would be actual Docker containers
      sandbox.services.push(runningService);
    }

    sandbox.status = "ready";
    sandbox.networkAddress = `localhost`;
  }

  /**
   * Generate Docker seccomp profile for sandbox isolation.
   */
  static generateSeccompProfile(): Record<string, unknown> {
    return {
      defaultAction: "SCMP_ACT_ERRNO",
      architectures: ["SCMP_ARCH_X86_64", "SCMP_ARCH_AARCH64"],
      syscalls: [
        // Allow basic operations
        { names: ["read", "write", "close", "fstat", "lseek", "mmap", "mprotect", "munmap", "brk"], action: "SCMP_ACT_ALLOW" },
        // Allow process management
        { names: ["clone", "fork", "execve", "exit", "exit_group", "wait4", "kill"], action: "SCMP_ACT_ALLOW" },
        // Allow networking (within sandbox)
        { names: ["socket", "connect", "accept", "bind", "listen", "sendto", "recvfrom", "setsockopt", "getsockopt"], action: "SCMP_ACT_ALLOW" },
        // Allow file operations (within mounted volumes only)
        { names: ["open", "openat", "stat", "access", "readlink", "getcwd", "getdents", "mkdir", "unlink", "rename"], action: "SCMP_ACT_ALLOW" },
        // Allow time operations
        { names: ["clock_gettime", "gettimeofday", "nanosleep"], action: "SCMP_ACT_ALLOW" },
        // Block dangerous operations
        { names: ["ptrace", "mount", "umount", "reboot", "swapon", "swapoff", "init_module"], action: "SCMP_ACT_ERRNO" },
      ],
    };
  }
}
