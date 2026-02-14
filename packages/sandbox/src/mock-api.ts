/**
 * Mock API server for agent testing.
 *
 * Generates configurable REST API endpoints that return synthetic data
 * with realistic latency, errors, rate limiting, and pagination.
 */

export interface MockApiConfig {
  name: string;
  basePath: string;
  endpoints: MockEndpoint[];
  latencyMs: LatencyConfig;
  errorRate: number; // 0-1, probability of returning an error
  rateLimit: RateLimitConfig;
  auth?: MockAuthConfig;
}

export interface MockEndpoint {
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  path: string;
  responseTemplate: ResponseTemplate;
  queryParams?: string[];
  requiredHeaders?: string[];
}

export interface ResponseTemplate {
  statusCode: number;
  headers: Record<string, string>;
  body: Record<string, unknown> | unknown[];
  paginatable?: boolean;
  totalItems?: number;
  itemsPerPage?: number;
}

export interface LatencyConfig {
  minMs: number;
  maxMs: number;
  p99Ms: number;
}

export interface RateLimitConfig {
  requestsPerSecond: number;
  burstSize: number;
  retryAfterSeconds: number;
}

export interface MockAuthConfig {
  type: "api-key" | "bearer" | "basic";
  validCredentials: string[];
}

export interface MockApiResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  latencyMs: number;
}

/**
 * Process a request against a mock API configuration.
 */
export function handleMockRequest(
  config: MockApiConfig,
  method: string,
  path: string,
  headers: Record<string, string>,
  queryParams: Record<string, string>,
  _requestState: RequestState
): MockApiResponse {
  // Check auth
  if (config.auth) {
    const authResult = checkAuth(config.auth, headers);
    if (!authResult.valid) {
      return {
        statusCode: 401,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Unauthorized", message: authResult.reason }),
        latencyMs: randomLatency(config.latencyMs),
      };
    }
  }

  // Check rate limit
  if (_requestState.requestCount > config.rateLimit.burstSize) {
    return {
      statusCode: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(config.rateLimit.retryAfterSeconds),
        "X-RateLimit-Limit": String(config.rateLimit.requestsPerSecond),
        "X-RateLimit-Remaining": "0",
      },
      body: JSON.stringify({ error: "Too Many Requests", retryAfter: config.rateLimit.retryAfterSeconds }),
      latencyMs: 10,
    };
  }

  // Simulate random errors
  if (Math.random() < config.errorRate) {
    const errorCodes = [500, 502, 503, 504];
    const code = errorCodes[Math.floor(Math.random() * errorCodes.length)]!;
    return {
      statusCode: code,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Internal Server Error", code }),
      latencyMs: randomLatency(config.latencyMs),
    };
  }

  // Find matching endpoint
  const normalizedPath = path.replace(config.basePath, "");
  const endpoint = config.endpoints.find(
    (ep) => ep.method === method.toUpperCase() && matchPath(ep.path, normalizedPath)
  );

  if (!endpoint) {
    return {
      statusCode: 404,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Not Found", path }),
      latencyMs: randomLatency(config.latencyMs),
    };
  }

  // Generate response
  const response = generateResponse(endpoint.responseTemplate, queryParams);
  _requestState.requestCount++;

  return {
    ...response,
    latencyMs: randomLatency(config.latencyMs),
  };
}

function checkAuth(auth: MockAuthConfig, headers: Record<string, string>): { valid: boolean; reason?: string } {
  switch (auth.type) {
    case "api-key": {
      const key = headers["x-api-key"] ?? headers["authorization"]?.replace("ApiKey ", "");
      if (!key) return { valid: false, reason: "Missing API key" };
      if (!auth.validCredentials.includes(key)) return { valid: false, reason: "Invalid API key" };
      return { valid: true };
    }
    case "bearer": {
      const token = headers["authorization"]?.replace("Bearer ", "");
      if (!token) return { valid: false, reason: "Missing bearer token" };
      if (!auth.validCredentials.includes(token)) return { valid: false, reason: "Invalid token" };
      return { valid: true };
    }
    case "basic": {
      const encoded = headers["authorization"]?.replace("Basic ", "");
      if (!encoded) return { valid: false, reason: "Missing basic auth" };
      if (!auth.validCredentials.includes(encoded)) return { valid: false, reason: "Invalid credentials" };
      return { valid: true };
    }
  }
}

function matchPath(pattern: string, path: string): boolean {
  // Simple path matching with :param placeholders
  const patternParts = pattern.split("/");
  const pathParts = path.split("/");
  if (patternParts.length !== pathParts.length) return false;
  return patternParts.every((part, i) => part.startsWith(":") || part === pathParts[i]);
}

function generateResponse(template: ResponseTemplate, queryParams: Record<string, string>): Omit<MockApiResponse, "latencyMs"> {
  let body = template.body;

  if (template.paginatable && Array.isArray(body)) {
    const page = parseInt(queryParams["page"] ?? "1", 10);
    const perPage = template.itemsPerPage ?? 20;
    const total = template.totalItems ?? body.length;
    const start = (page - 1) * perPage;

    body = {
      data: body.slice(start, start + perPage),
      pagination: {
        page,
        perPage,
        total,
        totalPages: Math.ceil(total / perPage),
        hasNext: start + perPage < total,
        hasPrev: page > 1,
      },
    };
  }

  return {
    statusCode: template.statusCode,
    headers: {
      "Content-Type": "application/json",
      ...template.headers,
    },
    body: JSON.stringify(body),
  };
}

function randomLatency(config: LatencyConfig): number {
  // 99% of requests within normal range, 1% hit p99
  if (Math.random() > 0.99) return config.p99Ms;
  return config.minMs + Math.random() * (config.maxMs - config.minMs);
}

export interface RequestState {
  requestCount: number;
  startTime: number;
}

export function createRequestState(): RequestState {
  return { requestCount: 0, startTime: Date.now() };
}

// ─── Pre-built Mock API Configs ──────────────────────────────────────

export function createSamGovMockApi(): MockApiConfig {
  return {
    name: "SAM.gov API",
    basePath: "/api/v1",
    endpoints: [
      {
        method: "GET",
        path: "/opportunities",
        queryParams: ["keyword", "naicsCode", "postedFrom", "postedTo", "limit", "offset"],
        responseTemplate: {
          statusCode: 200,
          headers: {},
          body: generateSamOpportunities(50),
          paginatable: true,
          totalItems: 50,
          itemsPerPage: 10,
        },
      },
      {
        method: "GET",
        path: "/opportunities/:id",
        responseTemplate: {
          statusCode: 200,
          headers: {},
          body: generateSamOpportunity(0),
        },
      },
    ],
    latencyMs: { minMs: 50, maxMs: 200, p99Ms: 2000 },
    errorRate: 0.02,
    rateLimit: { requestsPerSecond: 10, burstSize: 50, retryAfterSeconds: 60 },
    auth: { type: "api-key", validCredentials: ["test-sam-api-key-12345"] },
  };
}

function generateSamOpportunities(count: number): unknown[] {
  return Array.from({ length: count }, (_, i) => generateSamOpportunity(i));
}

function generateSamOpportunity(index: number): Record<string, unknown> {
  const types = ["rfp", "rfq", "rfi", "sources-sought", "combined-synopsis"];
  const agencies = ["DOD", "HHS", "GSA", "NASA", "DOE", "DHS", "VA"];
  const naics = ["541511", "541512", "541519", "518210", "541330"];

  return {
    noticeId: `SA-${String(index + 1).padStart(6, "0")}`,
    title: `Synthetic Opportunity #${index + 1} - IT Services`,
    solicitationNumber: `SOL-2026-${String(index + 1).padStart(4, "0")}`,
    type: types[index % types.length],
    agency: agencies[index % agencies.length],
    naicsCode: naics[index % naics.length],
    setAside: index % 3 === 0 ? "Total Small Business" : null,
    postedDate: new Date(Date.now() - index * 86400000).toISOString(),
    responseDeadline: new Date(Date.now() + (30 - index) * 86400000).toISOString(),
    placeOfPerformance: "Washington, DC",
    estimatedValue: { min: 100000 + index * 50000, max: 500000 + index * 100000 },
    pointOfContact: { name: `John Doe ${index}`, email: `poc${index}@agency.gov`, phone: "202-555-0100" },
    description: `This is a synthetic government opportunity for testing purposes. Opportunity ${index + 1}.`,
    attachments: index % 2 === 0 ? [{ name: "SOW.pdf", size: 245000 }, { name: "Pricing.xlsx", size: 45000 }] : [],
  };
}
