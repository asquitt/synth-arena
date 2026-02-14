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
    "legal": generateLegalScenario,
    "energy": generateEnergyScenario,
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

function generateLegalScenario(): Scenario {
  const visas = ["H-1B", "L-1A", "O-1A", "EB-1A", "EB-2-NIW", "I-485"];
  const actions = ["petition-prep", "rfe-response", "evidence-compilation", "eligibility-assessment"];
  const visa = visas[Math.floor(Math.random() * visas.length)]!;
  const action = actions[Math.floor(Math.random() * actions.length)]!;
  const isComplex = action === "rfe-response" || visa === "EB-1A";

  return {
    id: "",
    domain: "legal",
    name: "",
    description: `${action.replace(/-/g, " ")} for ${visa} visa petition`,
    input: {
      caseId: `CASE-${Math.floor(Math.random() * 100000)}`,
      visaCategory: visa,
      action,
      beneficiaryCountry: ["India", "China", "Brazil", "UK", "Nigeria"][Math.floor(Math.random() * 5)],
      filingDeadline: new Date(Date.now() + 60 * 86400000).toISOString(),
      hasEmployerSponsor: visa !== "EB-1A" && visa !== "EB-2-NIW",
    },
    expected: {
      formIdentified: true,
      evidenceListComplete: action !== "eligibility-assessment",
      deadlineMet: true,
    },
    metadata: {
      complexity: isComplex ? "high" : "medium",
      tags: ["legal", "immigration", visa, action],
      generatedAt: new Date().toISOString(),
      generatorVersion: "0.1.0-demo",
    },
  };
}

function generateEnergyScenario(): Scenario {
  const regions = ["ERCOT", "PJM", "CAISO", "MISO", "NYISO", "SPP"];
  const tasks = ["demand-forecast", "outage-response", "meter-analysis", "capacity-planning"];
  const conditions = ["heat-wave", "cold-snap", "severe-storm", "normal"];
  const region = regions[Math.floor(Math.random() * regions.length)]!;
  const task = tasks[Math.floor(Math.random() * tasks.length)]!;
  const weather = conditions[Math.floor(Math.random() * conditions.length)]!;
  const isAdversarial = weather === "severe-storm" && task === "outage-response";

  return {
    id: "",
    domain: "energy",
    name: "",
    description: `${task.replace(/-/g, " ")} for ${region} during ${weather.replace(/-/g, " ")}`,
    input: {
      region,
      task,
      weatherCondition: weather,
      timeHorizon: task === "demand-forecast" ? "48h" : "real-time",
      meterType: "ami",
      baseloadMw: 200 + Math.floor(Math.random() * 300),
      customersAffected: task === "outage-response" ? Math.floor(Math.random() * 50000) : 0,
    },
    expected: {
      analysisComplete: true,
      withinAccuracyThreshold: task === "demand-forecast",
      restorationEstimate: task === "outage-response",
    },
    metadata: {
      complexity: isAdversarial ? "adversarial" : weather !== "normal" ? "high" : "medium",
      tags: ["energy", task, region, weather],
      generatedAt: new Date().toISOString(),
      generatorVersion: "0.1.0-demo",
    },
  };
}
