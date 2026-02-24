import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("./repositories/webhooks.js", () => ({
  listActive: vi.fn().mockResolvedValue([]),
  logDelivery: vi.fn().mockResolvedValue(undefined),
}));

import {
  deliverWebhook,
  registerWebhook,
  listWebhooks,
  deleteWebhook,
  getWebhook,
} from "./webhooks.js";
import type { EvaluationRun } from "@syntharena/shared";

function makeMockRun(overrides?: Partial<EvaluationRun>): EvaluationRun {
  return {
    id: "run-1",
    name: "test-eval",
    status: "completed",
    createdAt: "2026-01-01T00:00:00Z",
    completedAt: "2026-01-01T00:01:00Z",
    config: { dataset: [], task: async () => ({ output: {}, trace: [], tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCost: 0, model: "demo", provider: "demo" }, duration: 0 }), scorers: [] },
    results: [],
    summary: {
      totalScenarios: 10,
      totalTrials: 10,
      overallPassRate: 0.9,
      passAtK: 0.9,
      passToTheK: 0.9,
      gPassAtK: 0.9,
      totalCost: 0.01,
      totalDuration: 500,
      avgTokensPerScenario: 200,
      latencyPercentiles: { p50: 50, p75: 50, p95: 50, p99: 50, min: 50, max: 50, mean: 50 },
      scoreSummaries: {},
    },
    ...overrides,
  } as EvaluationRun;
}

/** Count fetch calls to a specific URL. */
function callsToUrl(mockFn: ReturnType<typeof vi.fn>, url: string): number {
  return mockFn.mock.calls.filter((c: unknown[]) => c[0] === url).length;
}

describe("webhook CRUD (in-memory)", () => {
  // Use "evaluation.regression" for CRUD tests to avoid interfering with delivery tests
  it("registers and retrieves a webhook", async () => {
    const wh = await registerWebhook("https://crud.test/register", ["evaluation.regression"]);
    expect(wh.url).toBe("https://crud.test/register");
    expect(wh.events).toEqual(["evaluation.regression"]);
    expect(wh.active).toBe(true);
    expect(wh.secret).toMatch(/^whsec_/);

    const found = await getWebhook(wh.id);
    expect(found?.id).toBe(wh.id);
  });

  it("lists webhooks with masked secrets", async () => {
    await registerWebhook("https://crud.test/list", ["evaluation.regression"]);
    const all = await listWebhooks();
    expect(all.length).toBeGreaterThan(0);
    expect(all.some((w) => w.secret.endsWith("..."))).toBe(true);
  });

  it("deletes a webhook", async () => {
    const wh = await registerWebhook("https://crud.test/delete", ["evaluation.regression"]);
    const deleted = await deleteWebhook(wh.id);
    expect(deleted).toBe(true);
    const found = await getWebhook(wh.id);
    expect(found).toBeUndefined();
  });
});

describe("deliverWebhook", () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  let testCounter = 0;

  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
    mockFetch = vi.fn().mockResolvedValue(new Response("OK", { status: 200 }));
    vi.stubGlobal("fetch", mockFetch);
    testCounter++;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("delivers to registered webhook on success", async () => {
    const url = `https://delivery.test/success-${testCounter}`;
    await registerWebhook(url, ["evaluation.completed"]);

    await deliverWebhook("evaluation.completed", makeMockRun());

    expect(callsToUrl(mockFetch, url)).toBe(1);
  });

  it("includes HMAC signature header", async () => {
    const url = `https://delivery.test/sig-${testCounter}`;
    await registerWebhook(url, ["evaluation.completed"]);

    await deliverWebhook("evaluation.completed", makeMockRun());

    const call = mockFetch.mock.calls.find((c: unknown[]) => c[0] === url);
    expect(call).toBeDefined();
    const opts = (call as unknown[])[1] as { headers: Record<string, string> };
    expect(opts.headers["X-SynthArena-Signature"]).toMatch(/^sha256=/);
    expect(opts.headers["X-SynthArena-Event"]).toBe("evaluation.completed");
  });

  it("retries on 5xx errors", async () => {
    const url = `https://delivery.test/5xx-${testCounter}`;
    await registerWebhook(url, ["evaluation.completed"]);

    let urlCallCount = 0;
    mockFetch.mockImplementation((reqUrl: string) => {
      if (reqUrl === url) {
        urlCallCount++;
        if (urlCallCount <= 2) return Promise.resolve(new Response("error", { status: 500 }));
        return Promise.resolve(new Response("OK", { status: 200 }));
      }
      return Promise.resolve(new Response("OK", { status: 200 }));
    });

    await deliverWebhook("evaluation.completed", makeMockRun());

    expect(urlCallCount).toBe(3); // 2 failures + 1 success
  });

  it("does not retry on 4xx errors (except 429)", async () => {
    const url = `https://delivery.test/4xx-${testCounter}`;
    await registerWebhook(url, ["evaluation.completed"]);

    mockFetch.mockImplementation((reqUrl: string) => {
      if (reqUrl === url) return Promise.resolve(new Response("bad request", { status: 400 }));
      return Promise.resolve(new Response("OK", { status: 200 }));
    });

    await deliverWebhook("evaluation.completed", makeMockRun());

    expect(callsToUrl(mockFetch, url)).toBe(1);
  });

  it("retries on 429 (rate limited)", async () => {
    const url = `https://delivery.test/429-${testCounter}`;
    await registerWebhook(url, ["evaluation.completed"]);

    let urlCallCount = 0;
    mockFetch.mockImplementation((reqUrl: string) => {
      if (reqUrl === url) {
        urlCallCount++;
        if (urlCallCount === 1) return Promise.resolve(new Response("rate limited", { status: 429 }));
        return Promise.resolve(new Response("OK", { status: 200 }));
      }
      return Promise.resolve(new Response("OK", { status: 200 }));
    });

    await deliverWebhook("evaluation.completed", makeMockRun());

    expect(urlCallCount).toBe(2);
  });

  it("retries on network errors", async () => {
    const url = `https://delivery.test/network-${testCounter}`;
    await registerWebhook(url, ["evaluation.completed"]);

    let urlCallCount = 0;
    mockFetch.mockImplementation((reqUrl: string) => {
      if (reqUrl === url) {
        urlCallCount++;
        if (urlCallCount === 1) return Promise.reject(new Error("ECONNREFUSED"));
        return Promise.resolve(new Response("OK", { status: 200 }));
      }
      return Promise.resolve(new Response("OK", { status: 200 }));
    });

    await deliverWebhook("evaluation.completed", makeMockRun());

    expect(urlCallCount).toBe(2);
  });

  it("gives up after max retries", async () => {
    const url = `https://delivery.test/maxretry-${testCounter}`;
    await registerWebhook(url, ["evaluation.completed"]);

    mockFetch.mockImplementation((reqUrl: string) => {
      if (reqUrl === url) return Promise.resolve(new Response("error", { status: 500 }));
      return Promise.resolve(new Response("OK", { status: 200 }));
    });

    await deliverWebhook("evaluation.completed", makeMockRun());

    expect(callsToUrl(mockFetch, url)).toBe(3); // MAX_WEBHOOK_RETRIES = 3
  });

  it("skips webhooks for non-matching events", async () => {
    const url = `https://delivery.test/eventmatch-${testCounter}`;
    await registerWebhook(url, ["evaluation.failed"]);

    await deliverWebhook("evaluation.completed", makeMockRun());

    expect(callsToUrl(mockFetch, url)).toBe(0);
  });
});
