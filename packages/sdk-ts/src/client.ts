import type {
  EvaluationRun,
  EvaluationProgress,
  CostEstimate,
} from "@syntharena/shared";

/**
 * SynthArena API client for TypeScript.
 *
 * @example
 * ```ts
 * const client = new SynthArenaClient({
 *   apiUrl: "http://localhost:3001",
 *   apiKey: "sk-...",
 * });
 *
 * const run = await client.createEvaluation({
 *   name: "my-eval",
 *   domain: "web-scraping",
 *   scenarioCount: 10,
 * });
 * ```
 */
export class SynthArenaClient {
  private baseUrl: string;
  private apiKey?: string;

  constructor(opts: { apiUrl?: string; apiKey?: string } = {}) {
    this.baseUrl = (opts.apiUrl ?? "http://localhost:3001").replace(/\/$/, "");
    this.apiKey = opts.apiKey;
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (this.apiKey) h["Authorization"] = `Bearer ${this.apiKey}`;
    return h;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: { ...this.headers(), ...init?.headers },
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }));
      throw new SynthArenaError(
        (body as { error?: string }).error ?? `HTTP ${res.status}`,
        res.status,
      );
    }

    const json = await res.json() as { data: T };
    return json.data;
  }

  // ─── Evaluations ──────────────────────────────────────────

  async listEvaluations(): Promise<EvaluationRun[]> {
    return this.request("/api/v1/evaluations");
  }

  async getEvaluation(id: string): Promise<EvaluationRun> {
    return this.request(`/api/v1/evaluations/${id}`);
  }

  async createEvaluation(opts: {
    name: string;
    domain: string;
    scenarioCount?: number;
    trials?: number;
    maxConcurrency?: number;
    timeout?: number;
  }): Promise<EvaluationRun> {
    return this.request("/api/v1/evaluations", {
      method: "POST",
      body: JSON.stringify(opts),
    });
  }

  async deleteEvaluation(id: string): Promise<{ deleted: boolean; id: string }> {
    return this.request(`/api/v1/evaluations/${id}`, { method: "DELETE" });
  }

  /**
   * Stream evaluation progress via SSE.
   * Yields EvaluationProgress events as scenarios complete.
   */
  async *streamEvaluation(opts: {
    name: string;
    domain: string;
    scenarioCount?: number;
    trials?: number;
    maxConcurrency?: number;
    timeout?: number;
  }): AsyncGenerator<EvaluationProgress> {
    const res = await fetch(`${this.baseUrl}/api/v1/evaluations/stream`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(opts),
    });

    if (!res.ok || !res.body) {
      throw new SynthArenaError(`Stream failed: HTTP ${res.status}`, res.status);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line.startsWith("data:")) {
            const data = line.slice(5).trim();
            if (data) {
              yield JSON.parse(data) as EvaluationProgress;
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  // ─── Async Jobs ─────────────────────────────────────────

  /** Submit an evaluation job for async processing. Returns a job ID. */
  async createAsyncEvaluation(opts: {
    name: string;
    domain: string;
    scenarioCount?: number;
    trials?: number;
    maxConcurrency?: number;
    timeout?: number;
  }): Promise<{ jobId: string; status: string }> {
    return this.request("/api/v1/evaluations/async", {
      method: "POST",
      body: JSON.stringify(opts),
    });
  }

  /** Get the status of an async evaluation job. */
  async getJobStatus(jobId: string): Promise<{
    jobId: string;
    status: string;
    attempts: number;
    runId?: string;
    error?: string;
    submittedAt: string;
    startedAt?: string;
    completedAt?: string;
  }> {
    return this.request(`/api/v1/evaluations/jobs/${jobId}`);
  }

  /**
   * Wait for an async job to complete, polling at the given interval.
   * Returns the completed evaluation run.
   */
  async waitForJob(jobId: string, pollIntervalMs: number = 2000): Promise<EvaluationRun> {
    while (true) {
      const status = await this.getJobStatus(jobId);
      if (status.status === "completed" && status.runId) {
        return this.getEvaluation(status.runId);
      }
      if (status.status === "dead" || status.status === "failed") {
        throw new SynthArenaError(
          status.error ?? `Job ${status.status}`,
          status.status === "dead" ? 410 : 500,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
  }

  // ─── Comparisons ──────────────────────────────────────────

  async compareRuns(currentId: string, baselineId: string) {
    return this.request(`/api/v1/evaluations/${currentId}/compare`, {
      method: "POST",
      body: JSON.stringify({ baselineId }),
    });
  }

  // ─── Cost ─────────────────────────────────────────────────

  async estimateCost(opts: {
    model: string;
    scenarioCount: number;
    trialsPerScenario?: number;
    avgInputTokensPerCall?: number;
    avgOutputTokensPerCall?: number;
    avgCallsPerScenario?: number;
    cacheHitRate?: number;
    useBatchApi?: boolean;
  }): Promise<{ estimate: CostEstimate; recommendations: string[] }> {
    return this.request("/api/v1/cost/estimate", {
      method: "POST",
      body: JSON.stringify(opts),
    });
  }

  async listModels() {
    return this.request<{ model: string; provider: string; inputPer1M: number; outputPer1M: number }[]>(
      "/api/v1/cost/models"
    );
  }

  // ─── Health ───────────────────────────────────────────────

  async health(): Promise<{ status: string; version: string }> {
    const res = await fetch(`${this.baseUrl}/health`);
    return res.json() as Promise<{ status: string; version: string }>;
  }
}

export class SynthArenaError extends Error {
  constructor(message: string, public statusCode: number) {
    super(message);
    this.name = "SynthArenaError";
  }
}
