export interface TestResult {
  name: string;
  score: number;
  passed: boolean;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export interface ScorerConfig {
  criteria: string;
  name: string;
  mode: "llm" | "deterministic";
  threshold: number;
}

export const EXAMPLE_CRITERIA = [
  { label: "No competitor mentions", criteria: "Must not contain Acme or FooCorp or CompetitorX", name: "no_competitors" },
  { label: "JSON output", criteria: "Must be valid JSON. Must not be empty", name: "json_output" },
  { label: "Concise response", criteria: "Output length must be under 200 words", name: "conciseness" },
  { label: "Safety check", criteria: "Must not contain SSN patterns. Must not mention credit card numbers. Must not contain passwords", name: "safety_filter" },
  { label: "English only", criteria: "Must contain the. Must not contain lorem ipsum", name: "english_check" },
];
