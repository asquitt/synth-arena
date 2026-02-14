import { createHmac, randomBytes } from "node:crypto";
import type { EvaluationRun } from "@syntharena/shared";
import * as webhookRepo from "./repositories/webhooks.js";

/**
 * Webhook delivery for evaluation lifecycle events.
 *
 * Sends signed POST requests to registered URLs when evaluations
 * complete, fail, or regress. Includes HMAC-SHA256 signatures
 * for payload verification.
 *
 * Uses PostgreSQL when DATABASE_URL is set, in-memory Map otherwise.
 */

export interface WebhookConfig {
  id: string;
  url: string;
  secret: string;
  events: WebhookEvent[];
  active: boolean;
  createdAt: string;
}

export type WebhookEvent =
  | "evaluation.completed"
  | "evaluation.failed"
  | "evaluation.regression";

interface WebhookPayload {
  event: WebhookEvent;
  timestamp: string;
  data: {
    runId: string;
    name: string;
    status: string;
    passRate: number;
    totalScenarios: number;
    totalCost: number;
    duration: number;
    latencyP95?: number;
    latencyP99?: number;
    domain?: string;
  };
}

const useDb = !!process.env["DATABASE_URL"];

// In-memory fallback when no database
const memoryStore = new Map<string, WebhookConfig>();

export async function registerWebhook(
  url: string,
  events: WebhookEvent[],
): Promise<WebhookConfig> {
  const secret = `whsec_${randomBytes(24).toString("hex")}`;

  if (useDb) {
    const record = await webhookRepo.create({ url, secret, events });
    return {
      id: record.id,
      url: record.url,
      secret: record.secret,
      events: record.events as WebhookEvent[],
      active: record.active,
      createdAt: record.createdAt,
    };
  }

  const id = randomBytes(8).toString("hex");
  const config: WebhookConfig = {
    id,
    url,
    secret,
    events,
    active: true,
    createdAt: new Date().toISOString(),
  };
  memoryStore.set(id, config);
  return config;
}

export async function listWebhooks(): Promise<WebhookConfig[]> {
  if (useDb) {
    const records = await webhookRepo.listAll();
    return records.map((r) => ({
      id: r.id,
      url: r.url,
      secret: `${r.secret.slice(0, 10)}...`,
      events: r.events as WebhookEvent[],
      active: r.active,
      createdAt: r.createdAt,
    }));
  }

  return Array.from(memoryStore.values()).map((w) => ({
    ...w,
    secret: `${w.secret.slice(0, 10)}...`,
  }));
}

export async function deleteWebhook(id: string): Promise<boolean> {
  if (useDb) {
    return webhookRepo.deactivate(id);
  }
  return memoryStore.delete(id);
}

export async function getWebhook(id: string): Promise<WebhookConfig | undefined> {
  if (useDb) {
    const record = await webhookRepo.findById(id);
    if (!record) return undefined;
    return {
      id: record.id,
      url: record.url,
      secret: record.secret,
      events: record.events as WebhookEvent[],
      active: record.active,
      createdAt: record.createdAt,
    };
  }
  return memoryStore.get(id);
}

/** Sign a payload with HMAC-SHA256 for webhook verification. */
function signPayload(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

/** Build webhook payload from an evaluation run. */
function buildPayload(
  event: WebhookEvent,
  run: EvaluationRun,
  domain?: string,
): WebhookPayload {
  return {
    event,
    timestamp: new Date().toISOString(),
    data: {
      runId: run.id,
      name: run.name,
      status: run.status,
      passRate: run.summary.overallPassRate,
      totalScenarios: run.summary.totalScenarios,
      totalCost: run.summary.totalCost,
      duration: run.summary.totalDuration,
      latencyP95: run.summary.latencyPercentiles?.p95,
      latencyP99: run.summary.latencyPercentiles?.p99,
      domain,
    },
  };
}

/** Get all active webhooks matching the event. */
async function getMatchingWebhooks(event: WebhookEvent): Promise<WebhookConfig[]> {
  if (useDb) {
    const records = await webhookRepo.listActive();
    return records
      .filter((r) => (r.events as WebhookEvent[]).includes(event))
      .map((r) => ({
        id: r.id,
        url: r.url,
        secret: r.secret,
        events: r.events as WebhookEvent[],
        active: r.active,
        createdAt: r.createdAt,
      }));
  }
  return Array.from(memoryStore.values()).filter(
    (w) => w.active && w.events.includes(event),
  );
}

/** Deliver a webhook event to all registered endpoints. */
export async function deliverWebhook(
  event: WebhookEvent,
  run: EvaluationRun,
  domain?: string,
): Promise<void> {
  const matching = await getMatchingWebhooks(event);
  if (matching.length === 0) return;

  const payload = buildPayload(event, run, domain);
  const body = JSON.stringify(payload);

  const deliveries = matching.map(async (webhook) => {
    const signature = signPayload(body, webhook.secret);
    const start = Date.now();
    let statusCode: number | null = null;
    let responseBody: string | null = null;
    let error: string | null = null;

    try {
      const res = await fetch(webhook.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-SynthArena-Signature": `sha256=${signature}`,
          "X-SynthArena-Event": event,
          "X-SynthArena-Delivery": randomBytes(8).toString("hex"),
        },
        body,
        signal: AbortSignal.timeout(10_000),
      });

      statusCode = res.status;
      responseBody = await res.text().catch(() => null);

      if (!res.ok) {
        console.error(JSON.stringify({
          level: "warn",
          message: "Webhook delivery failed",
          webhookId: webhook.id,
          url: webhook.url,
          status: res.status,
        }));
      }
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      console.error(JSON.stringify({
        level: "error",
        message: "Webhook delivery error",
        webhookId: webhook.id,
        url: webhook.url,
        error,
      }));
    }

    // Log delivery to database if available
    if (useDb) {
      await webhookRepo.logDelivery({
        webhookId: webhook.id,
        event,
        payload: payload as unknown as Record<string, unknown>,
        statusCode,
        responseBody,
        error,
        durationMs: Date.now() - start,
      }).catch((logErr) => {
        console.error(JSON.stringify({
          level: "error",
          message: "Failed to log webhook delivery",
          error: String(logErr),
        }));
      });
    }
  });

  await Promise.allSettled(deliveries);
}
