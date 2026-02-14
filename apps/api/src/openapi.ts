/**
 * OpenAPI 3.1 specification for SynthArena API.
 *
 * Served at GET /api/docs/openapi.json
 * Swagger UI served at GET /api/docs
 */

export const openApiSpec = {
  openapi: "3.1.0",
  info: {
    title: "SynthArena API",
    version: "0.1.0",
    description: "Pre-deployment simulation platform for AI agents. Generate realistic test scenarios, run agents in sandboxed environments, and evaluate performance with probabilistic metrics.",
    contact: { name: "SynthArena", url: "https://syntharena.dev" },
    license: { name: "MIT" },
  },
  servers: [
    { url: "http://localhost:3001", description: "Local development" },
  ],
  tags: [
    { name: "Health", description: "Health check endpoints" },
    { name: "Evaluations", description: "Create, list, and manage evaluation runs" },
    { name: "Scenarios", description: "Generate, validate, and import scenarios" },
    { name: "Compliance", description: "EU AI Act compliance reports" },
    { name: "State-Diff", description: "Environment state diff analysis" },
    { name: "Cost", description: "Cost estimation for evaluation runs" },
    { name: "Domains", description: "Domain template management" },
    { name: "Admin", description: "Administrative operations" },
  ],
  paths: {
    "/health": {
      get: {
        tags: ["Health"],
        summary: "Basic health check",
        operationId: "healthCheck",
        responses: {
          200: {
            description: "Service is healthy",
            content: { "application/json": { schema: { $ref: "#/components/schemas/HealthResponse" } } },
          },
        },
      },
    },
    "/health/deep": {
      get: {
        tags: ["Health"],
        summary: "Deep health check with dependency status",
        operationId: "deepHealthCheck",
        responses: {
          200: {
            description: "Dependency health status",
            content: { "application/json": { schema: { $ref: "#/components/schemas/DeepHealthResponse" } } },
          },
        },
      },
    },
    "/metrics": {
      get: {
        tags: ["Health"],
        summary: "Prometheus metrics",
        operationId: "getMetrics",
        responses: {
          200: {
            description: "Prometheus text format",
            content: { "text/plain": { schema: { type: "string" } } },
          },
        },
      },
    },
    "/api/v1/evaluations": {
      get: {
        tags: ["Evaluations"],
        summary: "List evaluation runs",
        operationId: "listEvaluations",
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: "limit", in: "query", schema: { type: "integer", default: 50, maximum: 200 } },
          { name: "offset", in: "query", schema: { type: "integer", default: 0 } },
          { name: "domain", in: "query", schema: { type: "string" } },
          { name: "status", in: "query", schema: { type: "string", enum: ["running", "completed", "failed"] } },
        ],
        responses: {
          200: {
            description: "Paginated list of evaluation runs",
            content: { "application/json": { schema: { $ref: "#/components/schemas/EvaluationListResponse" } } },
          },
        },
      },
      post: {
        tags: ["Evaluations"],
        summary: "Create and run a new evaluation",
        operationId: "createEvaluation",
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/CreateEvaluationRequest" } } },
        },
        responses: {
          201: { description: "Evaluation completed", content: { "application/json": { schema: { $ref: "#/components/schemas/EvaluationResponse" } } } },
          400: { description: "Validation error", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
    },
    "/api/v1/evaluations/stream": {
      post: {
        tags: ["Evaluations"],
        summary: "Create evaluation with SSE progress streaming",
        operationId: "streamEvaluation",
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/CreateEvaluationRequest" } } },
        },
        responses: {
          200: { description: "SSE event stream", content: { "text/event-stream": { schema: { type: "string" } } } },
        },
      },
    },
    "/api/v1/evaluations/async": {
      post: {
        tags: ["Evaluations"],
        summary: "Queue evaluation for async processing (requires Redis)",
        operationId: "createAsyncEvaluation",
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/CreateEvaluationRequest" } } },
        },
        responses: {
          202: { description: "Evaluation queued", content: { "application/json": { schema: { $ref: "#/components/schemas/AsyncJobResponse" } } } },
          503: { description: "Redis unavailable" },
        },
      },
    },
    "/api/v1/evaluations/{id}": {
      get: {
        tags: ["Evaluations"],
        summary: "Get evaluation run by ID",
        operationId: "getEvaluation",
        security: [{ BearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: {
          200: { description: "Evaluation run with results", content: { "application/json": { schema: { $ref: "#/components/schemas/EvaluationResponse" } } } },
          404: { description: "Not found", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
      delete: {
        tags: ["Evaluations"],
        summary: "Delete an evaluation run",
        operationId: "deleteEvaluation",
        security: [{ BearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: {
          200: { description: "Deleted" },
          404: { description: "Not found" },
        },
      },
    },
    "/api/v1/evaluations/{id}/compliance": {
      get: {
        tags: ["Compliance"],
        summary: "Generate EU AI Act compliance report",
        operationId: "getComplianceReport",
        security: [{ BearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: {
          200: { description: "Compliance report", content: { "application/json": { schema: { $ref: "#/components/schemas/ComplianceReportResponse" } } } },
          400: { description: "Evaluation not complete" },
          404: { description: "Not found" },
        },
      },
    },
    "/api/v1/evaluations/{id}/state-diff": {
      post: {
        tags: ["State-Diff"],
        summary: "Compute state diff between environment snapshots",
        operationId: "computeStateDiff",
        security: [{ BearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["scenarioId", "before", "after"],
                properties: {
                  scenarioId: { type: "string" },
                  before: { type: "object", properties: { state: { type: "object" } } },
                  after: { type: "object", properties: { state: { type: "object" } } },
                  expectedKeys: { type: "array", items: { type: "string" } },
                  collateralKeys: { type: "array", items: { type: "string" } },
                },
              },
            },
          },
        },
        responses: {
          200: { description: "State diff report" },
          400: { description: "Evaluation not complete" },
          404: { description: "Not found" },
        },
      },
    },
    "/api/v1/evaluations/{id}/compare": {
      post: {
        tags: ["Evaluations"],
        summary: "Compare evaluation against a baseline for regression detection",
        operationId: "compareEvaluations",
        security: [{ BearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["baselineId"], properties: { baselineId: { type: "string", format: "uuid" } } } } },
        },
        responses: {
          200: { description: "Regression report" },
          404: { description: "Not found" },
        },
      },
    },
    "/api/v1/scenarios/generate": {
      post: {
        tags: ["Scenarios"],
        summary: "Generate domain-specific scenarios (requires ANTHROPIC_API_KEY)",
        operationId: "generateScenarios",
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["domain", "count"],
                properties: {
                  domain: { type: "string", description: "Domain template name" },
                  count: { type: "integer", minimum: 1, maximum: 1000 },
                  complexity: { type: "string", enum: ["low", "medium", "high", "adversarial"] },
                },
              },
            },
          },
        },
        responses: {
          200: { description: "Generated scenarios" },
        },
      },
    },
    "/api/v1/scenarios/adversarial": {
      post: {
        tags: ["Scenarios"],
        summary: "Generate adversarial variants of existing scenarios",
        operationId: "generateAdversarial",
        security: [{ BearerAuth: [] }],
        responses: { 200: { description: "Adversarial scenarios" } },
      },
    },
    "/api/v1/scenarios/import-traces": {
      post: {
        tags: ["Scenarios"],
        summary: "Import production traces as regression scenarios",
        operationId: "importTraces",
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["traces", "domain"],
                properties: {
                  traces: { type: "array", items: { $ref: "#/components/schemas/ProductionTrace" } },
                  domain: { type: "string" },
                  filterOutcome: { type: "string", enum: ["success", "failure", "timeout", "error"] },
                  maxScenarios: { type: "integer" },
                  includeTrace: { type: "boolean" },
                  tags: { type: "array", items: { type: "string" } },
                },
              },
            },
          },
        },
        responses: {
          200: { description: "Imported scenarios with summary" },
        },
      },
    },
    "/api/v1/cost/estimate": {
      post: {
        tags: ["Cost"],
        summary: "Estimate costs for an evaluation run",
        operationId: "estimateCost",
        security: [{ BearerAuth: [] }],
        responses: { 200: { description: "Cost estimate" } },
      },
    },
    "/api/v1/domains": {
      get: {
        tags: ["Domains"],
        summary: "List available domain templates",
        operationId: "listDomains",
        security: [{ BearerAuth: [] }],
        responses: { 200: { description: "Domain templates" } },
      },
    },
  },
  components: {
    securitySchemes: {
      BearerAuth: {
        type: "http",
        scheme: "bearer",
        description: "API key authentication. Set API_KEYS env var to enable.",
      },
    },
    schemas: {
      HealthResponse: {
        type: "object",
        properties: {
          status: { type: "string", example: "ok" },
          version: { type: "string", example: "0.1.0" },
          timestamp: { type: "string", format: "date-time" },
          uptime: { type: "number" },
        },
      },
      DeepHealthResponse: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["healthy", "degraded"] },
          checks: { type: "object" },
          timestamp: { type: "string", format: "date-time" },
        },
      },
      CreateEvaluationRequest: {
        type: "object",
        required: ["name", "domain"],
        properties: {
          name: { type: "string", minLength: 1 },
          domain: { type: "string", description: "Domain template (web-scraping, government, healthcare, legal, energy)" },
          scenarioCount: { type: "integer", default: 10, minimum: 1, maximum: 10000 },
          trials: { type: "integer", default: 1, minimum: 1, maximum: 100 },
          maxConcurrency: { type: "integer", default: 5, minimum: 1, maximum: 50 },
          timeout: { type: "integer", default: 300000, description: "Timeout in milliseconds" },
        },
      },
      EvaluationResponse: { type: "object", properties: { data: { $ref: "#/components/schemas/EvaluationRun" } } },
      EvaluationListResponse: {
        type: "object",
        properties: {
          data: { type: "array", items: { type: "object" } },
          metadata: { type: "object", properties: { total: { type: "integer" }, limit: { type: "integer" }, offset: { type: "integer" } } },
        },
      },
      EvaluationRun: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          status: { type: "string", enum: ["running", "completed", "failed"] },
          createdAt: { type: "string", format: "date-time" },
          completedAt: { type: "string", format: "date-time" },
          results: { type: "array", items: { $ref: "#/components/schemas/ScenarioResult" } },
          summary: { $ref: "#/components/schemas/EvaluationSummary" },
        },
      },
      ScenarioResult: {
        type: "object",
        properties: {
          scenarioId: { type: "string" },
          passAtK: { type: "number", description: "Capability metric: 1-(1-p)^k" },
          passToTheK: { type: "number", description: "Reliability metric: p^k" },
          gPassAtK: { type: "number", description: "Consistency metric (binomial CDF)" },
          aggregatedScores: { type: "object" },
          trials: { type: "array", items: { type: "object" } },
        },
      },
      EvaluationSummary: {
        type: "object",
        properties: {
          totalScenarios: { type: "integer" },
          totalTrials: { type: "integer" },
          overallPassRate: { type: "number" },
          passAtK: { type: "number" },
          passToTheK: { type: "number" },
          gPassAtK: { type: "number" },
          totalCost: { type: "number" },
          totalDuration: { type: "number" },
          avgTokensPerScenario: { type: "number" },
          scoreSummaries: { type: "object" },
        },
      },
      ComplianceReportResponse: { type: "object", properties: { data: { type: "object" } } },
      AsyncJobResponse: {
        type: "object",
        properties: {
          data: {
            type: "object",
            properties: {
              jobId: { type: "string" },
              status: { type: "string", enum: ["queued", "running", "completed", "failed"] },
              message: { type: "string" },
            },
          },
        },
      },
      ProductionTrace: {
        type: "object",
        required: ["traceId", "spans"],
        properties: {
          traceId: { type: "string" },
          spans: { type: "array", items: { type: "object" } },
          input: { type: "object" },
          output: {},
          outcome: { type: "string", enum: ["success", "failure", "timeout", "error"] },
          duration: { type: "number" },
          cost: { type: "number" },
        },
      },
      ErrorResponse: {
        type: "object",
        properties: {
          error: {
            type: "object",
            properties: {
              code: { type: "string" },
              message: { type: "string" },
            },
          },
          requestId: { type: "string" },
        },
      },
    },
  },
};

/** Minimal Swagger UI HTML for API documentation. */
export function swaggerHtml(specUrl: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>SynthArena API Docs</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui.css"/>
  <style>body{margin:0;background:#1a1a2e}.topbar{display:none}</style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui-bundle.js"></script>
  <script>SwaggerUIBundle({url:"${specUrl}",dom_id:"#swagger-ui",deepLinking:true,layout:"BaseLayout",defaultModelsExpandDepth:-1})</script>
</body>
</html>`;
}
