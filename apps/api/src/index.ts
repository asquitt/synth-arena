import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { evaluationRoutes } from "./routes/evaluations.js";
import { scenarioRoutes } from "./routes/scenarios.js";
import { domainRoutes } from "./routes/domains.js";
import { costRoutes } from "./routes/cost.js";

const app = new Hono();

// Middleware
app.use("*", cors());
app.use("*", logger());

// Health check
app.get("/health", (c) => c.json({ status: "ok", version: "0.1.0", timestamp: new Date().toISOString() }));

// API v1 routes
const v1 = new Hono();
v1.route("/evaluations", evaluationRoutes);
v1.route("/scenarios", scenarioRoutes);
v1.route("/domains", domainRoutes);
v1.route("/cost", costRoutes);

app.route("/api/v1", v1);

// 404 handler
app.notFound((c) => c.json({ error: "Not Found", path: c.req.path }, 404));

// Error handler
app.onError((err, c) => {
  console.error("API Error:", err);
  return c.json({ error: "Internal Server Error", message: err.message }, 500);
});

const port = parseInt(process.env["PORT"] ?? "3001", 10);
console.log(`SynthArena API starting on port ${port}`);

serve({ fetch: app.fetch, port });
