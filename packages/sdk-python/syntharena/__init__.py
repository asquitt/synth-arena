"""
SynthArena Python SDK

Pre-deployment simulation platform for AI agents.

Example:
    from syntharena import evaluate, scorers

    results = await evaluate(
        name="my-agent-eval",
        dataset=scenarios,
        task=my_agent.run,
        scorers=[scorers.task_completion, scorers.cost_threshold(0.50)],
        trials=3,
    )

    print(f"pass@k: {results.summary.pass_at_k}")
    print(f"pass^k: {results.summary.pass_to_the_k}")
"""

from syntharena.client import SynthArenaClient, SynthArenaError, evaluate
from syntharena.types import (
    Scenario,
    ScenarioMetadata,
    EvaluationConfig,
    EvaluationRun,
    EvaluationSummary,
    ScenarioResult,
    TrialResult,
    ScorerResult,
    TokenUsage,
    CostEstimate,
)
from syntharena import scorers

__version__ = "0.1.0"
__all__ = [
    "SynthArenaClient",
    "SynthArenaError",
    "evaluate",
    "scorers",
    "Scenario",
    "ScenarioMetadata",
    "EvaluationConfig",
    "EvaluationRun",
    "EvaluationSummary",
    "ScenarioResult",
    "TrialResult",
    "ScorerResult",
    "TokenUsage",
    "CostEstimate",
]
