import type { DomainTemplate } from "@syntharena/shared";

/**
 * Built-in domain templates for scenario generation.
 * Each template defines the domain's constraints, default scorers,
 * and generation configuration.
 */

export const WEB_SCRAPING_TEMPLATE: DomainTemplate = {
  name: "web-scraping",
  description: "Web scraping agent testing with mock websites featuring realistic HTML, pagination, authentication, rate limiting, and anti-bot measures",
  version: "0.1.0",
  scenarioGenerators: [
    {
      name: "e-commerce",
      type: "llm",
      prompt: "Generate test scenarios for scraping e-commerce product listings",
      config: { siteTypes: ["shop", "marketplace", "catalog"] },
    },
    {
      name: "content-site",
      type: "llm",
      prompt: "Generate test scenarios for scraping blog/news content",
      config: { siteTypes: ["blog", "news", "wiki"] },
    },
  ],
  environmentDefaults: {
    services: [
      { type: "mock-website", name: "target-site", config: { port: 8080 } },
    ],
  },
  defaultScorers: ["task_completion", "data_accuracy", "cost_threshold"],
  constraints: [
    { name: "rate-limiting", description: "Mock sites enforce rate limits; agents must respect them", validator: "validateRateLimit" },
    { name: "robots-txt", description: "Mock sites have robots.txt; agents should check it", validator: "validateRobotsTxt" },
  ],
};

export const GOVERNMENT_TEMPLATE: DomainTemplate = {
  name: "government",
  description: "Government contracting and RFP automation testing with mock SAM.gov listings, solicitation documents, and NAICS/PSC codes",
  version: "0.1.0",
  scenarioGenerators: [
    {
      name: "rfp-processing",
      type: "llm",
      prompt: "Generate test scenarios for processing government RFPs from SAM.gov",
      config: { solicitationTypes: ["rfp", "rfq", "rfi", "sources-sought"] },
    },
  ],
  environmentDefaults: {
    services: [
      { type: "mock-api", name: "sam-gov-api", config: { port: 8081 } },
    ],
  },
  defaultScorers: ["task_completion", "deadline_accuracy", "requirement_extraction"],
  constraints: [
    { name: "far-compliance", description: "Scenarios reference FAR/DFARS regulations", validator: "validateFarCompliance" },
    { name: "naics-accuracy", description: "NAICS codes must be valid 6-digit codes", validator: "validateNaicsCode" },
  ],
};

export const HEALTHCARE_TEMPLATE: DomainTemplate = {
  name: "healthcare",
  description: "Healthcare patient reactivation and appointment scheduling with synthetic HIPAA-safe patient data",
  version: "0.1.0",
  scenarioGenerators: [
    {
      name: "patient-reactivation",
      type: "llm",
      prompt: "Generate test scenarios for dental patient reactivation calls",
      config: { patientTypes: ["lapsed", "new-referral", "followup"] },
    },
  ],
  environmentDefaults: {
    services: [
      { type: "mock-database", name: "patient-db", config: { port: 5433 } },
      { type: "user-simulator", name: "patient-sim", config: {} },
    ],
  },
  defaultScorers: ["task_completion", "appointment_scheduled", "hipaa_compliance"],
  constraints: [
    { name: "hipaa", description: "All patient data must be synthetic and HIPAA-safe; no real PHI", validator: "validateHipaa" },
    { name: "consent", description: "Agents must obtain verbal consent before scheduling", validator: "validateConsent" },
  ],
};

export const DOMAIN_TEMPLATES: Record<string, DomainTemplate> = {
  "web-scraping": WEB_SCRAPING_TEMPLATE,
  "government": GOVERNMENT_TEMPLATE,
  "healthcare": HEALTHCARE_TEMPLATE,
};

export function getTemplate(domain: string): DomainTemplate | undefined {
  return DOMAIN_TEMPLATES[domain];
}

export function listTemplates(): string[] {
  return Object.keys(DOMAIN_TEMPLATES);
}
