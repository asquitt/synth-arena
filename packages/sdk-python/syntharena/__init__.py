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
from syntharena.scenarios import (
    GenerationConfig,
    QualityReport,
    load_scenarios,
    save_scenarios,
    generate_scenarios,
    validate_scenarios,
    filter_scenarios,
    deduplicate_scenarios,
)
from syntharena.replay import (
    RegressionSummary,
    RegressionReport,
    RegressionThresholds,
    ScenarioComparison,
    compare_runs,
    save_baseline,
    load_baseline,
    format_report,
)
from syntharena.batch import (
    BatchConfig,
    BatchProgress,
    BatchResult,
    run_batch,
    run_batch_multi,
)
from syntharena.webhooks import (
    WebhookEvent,
    WebhookConfig,
    WebhookReceiver,
    sign_payload,
    create_event,
    serialize_event,
)

__version__ = "0.1.0"
__all__ = [
    # Client
    "SynthArenaClient",
    "SynthArenaError",
    "evaluate",
    "scorers",
    # Types
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
    # Scenarios
    "GenerationConfig",
    "QualityReport",
    "load_scenarios",
    "save_scenarios",
    "generate_scenarios",
    "validate_scenarios",
    "filter_scenarios",
    "deduplicate_scenarios",
    # Replay / Regression
    "RegressionSummary",
    "RegressionReport",
    "RegressionThresholds",
    "ScenarioComparison",
    "compare_runs",
    "save_baseline",
    "load_baseline",
    "format_report",
    # Batch
    "BatchConfig",
    "BatchProgress",
    "BatchResult",
    "run_batch",
    "run_batch_multi",
    # Webhooks
    "WebhookEvent",
    "WebhookConfig",
    "WebhookReceiver",
    "sign_payload",
    "create_event",
    "serialize_event",
]
