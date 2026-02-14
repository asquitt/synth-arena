import type { Scenario } from "@syntharena/shared";

/**
 * Generate demo scenarios for API testing.
 * When users hit the evaluation API without a real agent,
 * they get realistic scenarios to understand the platform.
 */
export function generateDemoScenarios(domain: string, count: number): Scenario[] {
  const generators: Record<string, () => Scenario> = {
    "web-scraping": generateWebScrapingScenario,
    "government": generateGovernmentScenario,
    "healthcare": generateHealthcareScenario,
  };

  const generator = generators[domain] ?? generateWebScrapingScenario;
  return Array.from({ length: count }, (_, i) => {
    const scenario = generator();
    scenario.id = `${domain}-${i + 1}`;
    scenario.name = `${domain}-scenario-${i + 1}`;
    return scenario;
  });
}

function generateWebScrapingScenario(): Scenario {
  const sites = ["e-commerce", "blog", "news", "social-media", "directory"];
  const complexities: Scenario["metadata"]["complexity"][] = ["low", "medium", "high", "adversarial"];
  const site = sites[Math.floor(Math.random() * sites.length)]!;
  const complexity = complexities[Math.floor(Math.random() * complexities.length)]!;

  return {
    id: "",
    domain: "web-scraping",
    name: "",
    description: `Scrape product data from a ${complexity}-complexity ${site} site`,
    input: {
      targetUrl: `https://mock-${site}.syntharena.test`,
      extractFields: ["title", "price", "description", "rating"],
      pagination: complexity !== "low",
      authentication: complexity === "high" || complexity === "adversarial",
      rateLimit: complexity === "adversarial" ? 2 : 10,
    },
    expected: {
      minResults: complexity === "low" ? 5 : 20,
      requiredFields: ["title", "price"],
    },
    metadata: {
      complexity,
      tags: ["web-scraping", site],
      generatedAt: new Date().toISOString(),
      generatorVersion: "0.1.0-demo",
    },
  };
}

function generateGovernmentScenario(): Scenario {
  const types = ["rfp", "rfq", "rfi", "sources-sought", "combined-synopsis"];
  const agencies = ["DOD", "HHS", "GSA", "NASA", "DOE"];
  const type = types[Math.floor(Math.random() * types.length)]!;
  const agency = agencies[Math.floor(Math.random() * agencies.length)]!;

  return {
    id: "",
    domain: "government",
    name: "",
    description: `Process a ${type.toUpperCase()} from ${agency}`,
    input: {
      listingUrl: `https://mock-sam.syntharena.test/opp/${type}`,
      solicitationType: type,
      agency,
      naicsCode: "541511",
      dueDate: new Date(Date.now() + 30 * 86400000).toISOString(),
    },
    expected: { extracted: true, hasDeadline: true, hasRequirements: true },
    metadata: {
      complexity: "medium",
      tags: ["government", type, agency],
      generatedAt: new Date().toISOString(),
      generatorVersion: "0.1.0-demo",
    },
  };
}

function generateHealthcareScenario(): Scenario {
  const patientTypes = ["active", "lapsed-6mo", "lapsed-1yr", "lapsed-2yr", "new-referral"];
  const insurances = ["PPO", "HMO", "Medicare", "Medicaid", "Self-Pay"];
  const patientType = patientTypes[Math.floor(Math.random() * patientTypes.length)]!;
  const insurance = insurances[Math.floor(Math.random() * insurances.length)]!;

  return {
    id: "",
    domain: "healthcare",
    name: "",
    description: `Reactivation call for ${patientType} patient with ${insurance}`,
    input: {
      patientId: `PAT-${Math.floor(Math.random() * 100000)}`,
      patientType,
      insurance,
      lastVisit: patientType === "active"
        ? new Date(Date.now() - 30 * 86400000).toISOString()
        : new Date(Date.now() - 365 * 86400000).toISOString(),
      preferredContact: "phone",
      appointmentTypes: ["cleaning", "exam", "xray"],
    },
    expected: {
      contactAttempted: true,
      appointmentScheduled: patientType !== "lapsed-2yr",
    },
    metadata: {
      complexity: patientType === "lapsed-2yr" ? "high" : "medium",
      tags: ["healthcare", "reactivation", patientType],
      generatedAt: new Date().toISOString(),
      generatorVersion: "0.1.0-demo",
    },
  };
}
