export { compareRuns, saveBaseline, loadBaseline, formatRegressionReport } from "./regression.js";
export type { RegressionReport, RegressionSummary, ScenarioRegression, ScenarioSnapshot } from "./regression.js";

export { generateAdversarialScenarios } from "./adversarial.js";
export type { AdversarialConfig, AdversarialCategory } from "./adversarial.js";

export {
  convertOTLPSpans,
  classifyTrace,
  importTraces,
  summarizeImport,
} from "./trace-import.js";
export type { OTLPSpan, ProductionTrace, TraceImportOptions } from "./trace-import.js";
