import { createHmac, randomBytes } from "node:crypto";
import type { EvaluationRun } from "@syntharena/shared";

/**
 * Webhook delivery for evaluation lifecycle events.
 *
 * Sends signed POST requests to registered URLs when evaluations
 * complete, fail, or regress. Includes HMAC-SHA256 signatures
 * for payload verification.
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

// In-memory webhook store (replaced by DB when DATABASE_URL is set)
const webhooks = new Map<string, WebhookConfig>();

export function registerWebhook(
  url: string,
  events: WebhookEvent[],
): WebhookConfig {
  const id = randomBytes(8).toString("hex");
  const secret = `whsec_${randomBytes(24).toString("hex")}`;
  const config: WebhookConfig = {
    id,
    url,
    secret,
    events,
    active: true,
    createdAt: new Date().toISOString(),
  };
  webhooks.set(id, config);
  return config;
}

export function listWebhooks(): WebhookConfig[] {
  return Array.from(webhooks.values()).map((w) => ({
    ...w,
    secret: `${w.secret.slice(0, 10)}...`, // Mask secret in listings
  }));
}

export function deleteWebhook(id: string): boolean {
  return webhooks.delete(id);
}

export function getWebhook(id: string): WebhookConfig | undefined {
  return webhooks.get(id);
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

/** Deliver a webhook event to all registered endpoints. */
export async function deliverWebhook(
  event: WebhookEvent,
  run: EvaluationRun,
  domain?: string,
): Promise<void> {
  const matching = Array.from(webhooks.values()).filter(
    (w) => w.active && w.events.includes(event),
  );

  if (matching.length === 0) return;

  const payload = buildPayload(event, run, domain);
  const body = JSON.stringify(payload);

  const deliveries = matching.map(async (webhook) => {
    const signature = signPayload(body, webhook.secret);

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
      console.error(JSON.stringify({
        level: "error",
        message: "Webhook delivery error",
        webhookId: webhook.id,
        url: webhook.url,
        error: err instanceof Error ? err.message : String(err),
      }));
    }
  });

  // Fire and forget — don't block the caller
  await Promise.allSettled(deliveries);
}
