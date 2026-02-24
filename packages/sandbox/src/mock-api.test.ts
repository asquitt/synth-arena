import { describe, it, expect } from "vitest";
import {
  handleMockRequest,
  createRequestState,
  createSamGovMockApi,
  type MockApiConfig,
  type RequestState,
} from "./mock-api.js";

function makeConfig(overrides?: Partial<MockApiConfig>): MockApiConfig {
  return {
    name: "Test API",
    basePath: "/api/v1",
    endpoints: [
      {
        method: "GET",
        path: "/items",
        responseTemplate: {
          statusCode: 200,
          headers: {},
          body: [{ id: 1, name: "Item 1" }, { id: 2, name: "Item 2" }],
          paginatable: true,
          totalItems: 2,
          itemsPerPage: 10,
        },
      },
      {
        method: "GET",
        path: "/items/:id",
        responseTemplate: {
          statusCode: 200,
          headers: {},
          body: { id: 1, name: "Item 1" },
        },
      },
      {
        method: "POST",
        path: "/items",
        responseTemplate: {
          statusCode: 201,
          headers: {},
          body: { id: 3, name: "Created" },
        },
      },
    ],
    latencyMs: { minMs: 0, maxMs: 1, p99Ms: 2 },
    errorRate: 0,
    rateLimit: { requestsPerSecond: 100, burstSize: 1000, retryAfterSeconds: 60 },
    ...overrides,
  };
}

describe("handleMockRequest", () => {
  it("returns 200 for matching GET endpoint", () => {
    const state = createRequestState();
    const response = handleMockRequest(
      makeConfig(), "GET", "/api/v1/items", {}, {}, state,
    );

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.data).toBeDefined();
    expect(body.pagination).toBeDefined();
  });

  it("returns 404 for unmatched path", () => {
    const state = createRequestState();
    const response = handleMockRequest(
      makeConfig(), "GET", "/api/v1/nonexistent", {}, {}, state,
    );

    expect(response.statusCode).toBe(404);
    expect(JSON.parse(response.body).error).toBe("Not Found");
  });

  it("matches parameterized paths", () => {
    const state = createRequestState();
    const response = handleMockRequest(
      makeConfig(), "GET", "/api/v1/items/42", {}, {}, state,
    );

    expect(response.statusCode).toBe(200);
  });

  it("returns 401 when auth required and missing", () => {
    const config = makeConfig({
      auth: { type: "api-key", validCredentials: ["valid-key"] },
    });
    const state = createRequestState();
    const response = handleMockRequest(
      config, "GET", "/api/v1/items", {}, {}, state,
    );

    expect(response.statusCode).toBe(401);
    expect(JSON.parse(response.body).error).toBe("Unauthorized");
  });

  it("accepts valid api-key auth", () => {
    const config = makeConfig({
      auth: { type: "api-key", validCredentials: ["valid-key"] },
    });
    const state = createRequestState();
    const response = handleMockRequest(
      config, "GET", "/api/v1/items", { "x-api-key": "valid-key" }, {}, state,
    );

    expect(response.statusCode).toBe(200);
  });

  it("accepts valid bearer auth", () => {
    const config = makeConfig({
      auth: { type: "bearer", validCredentials: ["token123"] },
    });
    const state = createRequestState();
    const response = handleMockRequest(
      config, "GET", "/api/v1/items", { authorization: "Bearer token123" }, {}, state,
    );

    expect(response.statusCode).toBe(200);
  });

  it("rejects invalid bearer auth", () => {
    const config = makeConfig({
      auth: { type: "bearer", validCredentials: ["token123"] },
    });
    const state = createRequestState();
    const response = handleMockRequest(
      config, "GET", "/api/v1/items", { authorization: "Bearer wrong" }, {}, state,
    );

    expect(response.statusCode).toBe(401);
  });

  it("accepts valid basic auth", () => {
    const config = makeConfig({
      auth: { type: "basic", validCredentials: ["dXNlcjpwYXNz"] },
    });
    const state = createRequestState();
    const response = handleMockRequest(
      config, "GET", "/api/v1/items", { authorization: "Basic dXNlcjpwYXNz" }, {}, state,
    );

    expect(response.statusCode).toBe(200);
  });

  it("returns 429 when rate limit exceeded", () => {
    const config = makeConfig({ rateLimit: { requestsPerSecond: 1, burstSize: 2, retryAfterSeconds: 30 } });
    const state: RequestState = { requestCount: 5, startTime: Date.now() };
    const response = handleMockRequest(
      config, "GET", "/api/v1/items", {}, {}, state,
    );

    expect(response.statusCode).toBe(429);
    expect(response.headers["Retry-After"]).toBe("30");
    expect(response.headers["X-RateLimit-Remaining"]).toBe("0");
  });

  it("supports pagination via query params", () => {
    const state = createRequestState();
    const response = handleMockRequest(
      makeConfig(), "GET", "/api/v1/items", {}, { page: "1" }, state,
    );

    const body = JSON.parse(response.body);
    expect(body.pagination).toBeDefined();
    expect(body.pagination.page).toBe(1);
  });

  it("returns non-paginated response for non-paginatable endpoints", () => {
    const state = createRequestState();
    const response = handleMockRequest(
      makeConfig(), "GET", "/api/v1/items/1", {}, {}, state,
    );

    const body = JSON.parse(response.body);
    expect(body.id).toBe(1);
    expect(body.pagination).toBeUndefined();
  });

  it("increments request count", () => {
    const state = createRequestState();
    expect(state.requestCount).toBe(0);

    handleMockRequest(makeConfig(), "GET", "/api/v1/items", {}, {}, state);
    expect(state.requestCount).toBe(1);
  });

  it("includes latency in response", () => {
    const state = createRequestState();
    const response = handleMockRequest(
      makeConfig(), "GET", "/api/v1/items", {}, {}, state,
    );

    expect(response.latencyMs).toBeGreaterThanOrEqual(0);
  });
});

describe("createRequestState", () => {
  it("initializes with zero count", () => {
    const state = createRequestState();
    expect(state.requestCount).toBe(0);
    expect(state.startTime).toBeGreaterThan(0);
  });
});

describe("createSamGovMockApi", () => {
  it("creates a valid SAM.gov mock API config", () => {
    const config = createSamGovMockApi();

    expect(config.name).toBe("SAM.gov API");
    expect(config.basePath).toBe("/api/v1");
    expect(config.endpoints.length).toBeGreaterThan(0);
    expect(config.auth).toBeDefined();
    expect(config.auth!.type).toBe("api-key");
  });

  it("SAM.gov opportunities endpoint returns data", () => {
    const config = createSamGovMockApi();
    config.errorRate = 0; // Disable random errors for deterministic test
    const state = createRequestState();
    const response = handleMockRequest(
      config, "GET", "/api/v1/opportunities",
      { "x-api-key": "test-sam-api-key-12345" }, {}, state,
    );

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.data).toBeDefined();
    expect(body.pagination.total).toBe(50);
  });

  it("SAM.gov single opportunity endpoint works", () => {
    const config = createSamGovMockApi();
    config.errorRate = 0; // Disable random errors for deterministic test
    const state = createRequestState();
    const response = handleMockRequest(
      config, "GET", "/api/v1/opportunities/123",
      { "x-api-key": "test-sam-api-key-12345" }, {}, state,
    );

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.noticeId).toBeDefined();
  });
});
