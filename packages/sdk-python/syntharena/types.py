"""Core type definitions for SynthArena Python SDK."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal


@dataclass
class ScenarioMetadata:
    complexity: Literal["low", "medium", "high", "adversarial"]
    tags: list[str]
    generated_at: str
    generator_version: str
    seed_id: str | None = None


@dataclass
class Scenario:
    id: str
    domain: str
    name: str
    description: str
    input: dict[str, Any]
    metadata: ScenarioMetadata
    expected: dict[str, Any] | None = None


@dataclass
class TokenUsage:
    input_tokens: int
    output_tokens: int
    total_tokens: int
    estimated_cost: float
    model: str
    provider: str


@dataclass
class ScorerResult:
    name: str
    score: float
    passed: bool
    reason: str | None = None
    metadata: dict[str, Any] | None = None


@dataclass
class TrialResult:
    trial_number: int
    output: Any
    scores: list[ScorerResult]
    passed: bool
    token_usage: TokenUsage
    duration: float


@dataclass
class AggregatedScore:
    name: str
    mean: float
    min: float
    max: float
    stddev: float


@dataclass
class ScenarioResult:
    scenario_id: str
    trials: list[TrialResult]
    aggregated_scores: dict[str, AggregatedScore]
    pass_at_k: float
    pass_to_the_k: float
    g_pass_at_k: float = 0.0


@dataclass
class LatencyPercentiles:
    p50: float
    p75: float
    p95: float
    p99: float
    min: float
    max: float
    mean: float


@dataclass
class EvaluationSummary:
    total_scenarios: int
    total_trials: int
    overall_pass_rate: float
    pass_at_k: float
    pass_to_the_k: float
    g_pass_at_k: float
    total_cost: float
    total_duration: float
    avg_tokens_per_scenario: float
    score_summaries: dict[str, AggregatedScore]
    latency_percentiles: LatencyPercentiles | None = None


@dataclass
class EvaluationConfig:
    name: str
    dataset: list[Scenario]
    scorers: list[Any]
    trials: int = 1
    max_concurrency: int = 5
    timeout: float = 300.0


@dataclass
class EvaluationRun:
    id: str
    name: str
    created_at: str
    status: Literal["running", "completed", "failed"]
    results: list[ScenarioResult]
    summary: EvaluationSummary
    completed_at: str | None = None


@dataclass
class CostBreakdownItem:
    category: str
    input_tokens: int
    output_tokens: int
    cost: float
    percentage: float


@dataclass
class CostEstimate:
    scenario_count: int
    trials_per_scenario: int
    estimated_input_tokens: int
    estimated_output_tokens: int
    estimated_cost: float
    model: str
    provider: str
    breakdown: list[CostBreakdownItem] = field(default_factory=list)
