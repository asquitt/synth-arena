export interface CategoryResult {
  category: string;
  scenarioCount: number;
  passRate: number;
}

export interface RedTeamReport {
  runId: string;
  redTeamRunId: string;
  categories: CategoryResult[];
  intensity: string;
  totalScenarios: number;
  overallPassRate: number;
  verdict: "robust" | "moderate_risk" | "vulnerable";
  summary: {
    overallPassRate: number;
    passAtK: number;
    passToTheK: number;
    totalScenarios: number;
    totalTrials: number;
    totalCost: number;
    totalDuration: number;
    scoreSummaries: Record<string, { name: string; mean: number; min: number; max: number }>;
  };
}

export const ALL_CATEGORIES = [
  "prompt-injection",
  "data-exfiltration",
  "tool-misuse",
  "state-confusion",
  "resource-exhaustion",
  "input-perturbation",
  "multi-turn-manipulation",
];

export const CATEGORY_LABELS: Record<string, { label: string; icon: string; description: string }> = {
  "prompt-injection": { label: "Prompt Injection", icon: "💉", description: "Tests resistance to instruction override attempts" },
  "data-exfiltration": { label: "Data Exfiltration", icon: "🔓", description: "Tests for sensitive data leakage" },
  "tool-misuse": { label: "Tool Misuse", icon: "🔧", description: "Tests for unauthorized tool or API abuse" },
  "state-confusion": { label: "State Confusion", icon: "🌀", description: "Tests for inconsistent state handling" },
  "resource-exhaustion": { label: "Resource Exhaustion", icon: "💥", description: "Tests for resource limit enforcement" },
  "input-perturbation": { label: "Input Perturbation", icon: "🎭", description: "Tests robustness to malformed inputs" },
  "multi-turn-manipulation": { label: "Multi-Turn Manipulation", icon: "🔗", description: "Tests for gradual trust exploitation" },
};
