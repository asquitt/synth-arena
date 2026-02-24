export interface TraceSpan {
  id: string;
  parentId: string;
  name: string;
  type: "llm_call" | "tool_invocation" | "decision" | "environment_interaction" | "state_transition";
  startTime: string;
  endTime: string;
  durationMs: number;
  status: "ok" | "error";
  runId: string;
  scenarioId: string;
  trialNumber: number;
  model: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  attributes: string;
  events: string;
}

export const TYPE_COLORS: Record<string, string> = {
  llm_call: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  tool_invocation: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  decision: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  environment_interaction: "bg-green-500/20 text-green-400 border-green-500/30",
  state_transition: "bg-orange-500/20 text-orange-400 border-orange-500/30",
};

export const TYPE_ICONS: Record<string, string> = {
  llm_call: "🧠",
  tool_invocation: "🔧",
  decision: "🤔",
  environment_interaction: "🌐",
  state_transition: "🔄",
};
