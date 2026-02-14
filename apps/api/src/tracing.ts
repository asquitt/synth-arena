/**
 * OpenTelemetry SDK configuration.
 *
 * Must be imported BEFORE any other module to ensure instrumentation
 * hooks are registered before library code loads.
 *
 * Activated when OTEL_EXPORTER_OTLP_ENDPOINT is set.
 * Uses standard OTel env vars: OTEL_SERVICE_NAME, OTEL_EXPORTER_OTLP_HEADERS, etc.
 */

import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";

let sdk: NodeSDK | null = null;

export function initTracing(): void {
  const endpoint = process.env["OTEL_EXPORTER_OTLP_ENDPOINT"];
  if (!endpoint) return;

  const exporter = new OTLPTraceExporter({ url: `${endpoint}/v1/traces` });

  sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: process.env["OTEL_SERVICE_NAME"] ?? "syntharena-api",
      [ATTR_SERVICE_VERSION]: "0.1.0",
      "deployment.environment": process.env["NODE_ENV"] ?? "development",
    }),
    traceExporter: exporter,
  });

  sdk.start();
  console.log(JSON.stringify({
    level: "info",
    message: "OpenTelemetry tracing enabled",
    endpoint,
  }));
}

export async function shutdownTracing(): Promise<void> {
  if (sdk) {
    await sdk.shutdown();
  }
}
