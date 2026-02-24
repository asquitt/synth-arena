import { describe, it, expect } from "vitest";
import { openApiSpec, swaggerHtml } from "./openapi.js";

/**
 * OpenAPI specification tests — validates the spec structure and completeness.
 */

describe("openApiSpec", () => {
  it("is OpenAPI 3.1", () => {
    expect(openApiSpec.openapi).toBe("3.1.0");
  });

  it("has required info fields", () => {
    expect(openApiSpec.info.title).toBe("SynthArena API");
    expect(openApiSpec.info.version).toBeDefined();
    expect(openApiSpec.info.description).toBeDefined();
  });

  it("has at least one server", () => {
    expect(openApiSpec.servers.length).toBeGreaterThan(0);
  });

  it("has tags for all major categories", () => {
    const tagNames = openApiSpec.tags.map((t) => t.name);
    expect(tagNames).toContain("Health");
    expect(tagNames).toContain("Evaluations");
    expect(tagNames).toContain("Scenarios");
    expect(tagNames).toContain("Red Team");
    expect(tagNames).toContain("Cost");
    expect(tagNames).toContain("Domains");
  });

  it("has paths for all major endpoints", () => {
    const paths = Object.keys(openApiSpec.paths);
    expect(paths).toContain("/health");
    expect(paths).toContain("/health/deep");
    expect(paths).toContain("/metrics");
    expect(paths).toContain("/api/v1/evaluations");
    expect(paths).toContain("/api/v1/evaluations/{id}");
    expect(paths).toContain("/api/v1/scenarios/generate");
    expect(paths).toContain("/api/v1/domains");
    expect(paths).toContain("/api/v1/cost/estimate");
  });

  it("has BearerAuth security scheme", () => {
    expect(openApiSpec.components.securitySchemes.BearerAuth).toBeDefined();
    expect(openApiSpec.components.securitySchemes.BearerAuth.type).toBe("http");
    expect(openApiSpec.components.securitySchemes.BearerAuth.scheme).toBe("bearer");
  });

  it("has required component schemas", () => {
    const schemas = Object.keys(openApiSpec.components.schemas);
    expect(schemas).toContain("HealthResponse");
    expect(schemas).toContain("CreateEvaluationRequest");
    expect(schemas).toContain("EvaluationRun");
    expect(schemas).toContain("ErrorResponse");
  });

  it("evaluation paths have security", () => {
    const evalPath = openApiSpec.paths["/api/v1/evaluations"] as Record<string, Record<string, unknown>>;
    expect(evalPath.get.security).toBeDefined();
    expect(evalPath.post.security).toBeDefined();
  });

  it("health paths do NOT have security", () => {
    const healthPath = openApiSpec.paths["/health"] as Record<string, Record<string, unknown>>;
    expect(healthPath.get.security).toBeUndefined();
  });

  it("CreateEvaluationRequest has required fields", () => {
    const schema = openApiSpec.components.schemas.CreateEvaluationRequest;
    expect(schema.required).toContain("name");
    expect(schema.required).toContain("domain");
  });
});

describe("swaggerHtml", () => {
  it("returns valid HTML with swagger-ui", () => {
    const html = swaggerHtml("/api/docs/openapi.json");
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("swagger-ui");
    expect(html).toContain("SynthArena API Docs");
    expect(html).toContain("/api/docs/openapi.json");
  });

  it("injects the spec URL into the script", () => {
    const html = swaggerHtml("/custom/path.json");
    expect(html).toContain('url:"/custom/path.json"');
  });

  it("includes swagger-ui CSS and JS", () => {
    const html = swaggerHtml("/spec.json");
    expect(html).toContain("swagger-ui.css");
    expect(html).toContain("swagger-ui-bundle.js");
  });
});
