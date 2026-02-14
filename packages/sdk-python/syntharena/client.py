"""SynthArena Python SDK client."""

from __future__ import annotations

import asyncio
import math
import time
import uuid
from typing import Any, Callable, Awaitable

from syntharena.types import (
    Scenario,
    EvaluationRun,
    EvaluationSummary,
    ScenarioResult,
    TrialResult,
    ScorerResult,
    TokenUsage,
    AggregatedScore,
)


ScorerFn = Callable[[dict[str, Any]], Awaitable[ScorerResult]]
TaskFn = Callable[[dict[str, Any]], Awaitable[dict[str, Any]]]


class SynthArenaClient:
    """Client for the SynthArena API."""

    def __init__(self, api_url: str = "http://localhost:3001", api_key: str | None = None):
        self.api_url = api_url.rstrip("/")
        self.api_key = api_key


async def evaluate(
    name: str,
    dataset: list[Scenario],
    task: TaskFn,
    scorers: list[ScorerFn],
    trials: int = 1,
    max_concurrency: int = 5,
    timeout: float = 300.0,
) -> EvaluationRun:
    """Run an evaluation locally.

    Args:
        name: Name for this evaluation run
        dataset: List of scenarios to evaluate
        task: Async function that takes scenario input and returns output dict
        scorers: List of scorer functions
        trials: Number of trials per scenario
        max_concurrency: Maximum concurrent evaluations
        timeout: Timeout per scenario in seconds

    Returns:
        EvaluationRun with results and summary
    """
    run_id = str(uuid.uuid4())
    created_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    results: list[ScenarioResult] = []

    # Process scenarios with concurrency limit
    semaphore = asyncio.Semaphore(max_concurrency)

    async def eval_scenario(scenario: Scenario) -> ScenarioResult:
        async with semaphore:
            return await _evaluate_scenario(scenario, task, scorers, trials, timeout)

    tasks = [eval_scenario(s) for s in dataset]
    results = await asyncio.gather(*tasks)

    summary = _compute_summary(list(results))

    return EvaluationRun(
        id=run_id,
        name=name,
        created_at=created_at,
        completed_at=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        status="completed",
        results=list(results),
        summary=summary,
    )


async def _evaluate_scenario(
    scenario: Scenario,
    task: TaskFn,
    scorers: list[ScorerFn],
    trial_count: int,
    timeout: float,
) -> ScenarioResult:
    trial_results: list[TrialResult] = []

    for t in range(trial_count):
        start = time.time()
        try:
            result = await asyncio.wait_for(task(scenario.input), timeout=timeout)
        except asyncio.TimeoutError:
            result = {"error": f"Timeout after {timeout}s"}

        duration = time.time() - start
        output = result.get("output", result)
        token_usage_raw = result.get("token_usage", {})

        token_usage = TokenUsage(
            input_tokens=token_usage_raw.get("input_tokens", 0),
            output_tokens=token_usage_raw.get("output_tokens", 0),
            total_tokens=token_usage_raw.get("total_tokens", 0),
            estimated_cost=token_usage_raw.get("estimated_cost", 0.0),
            model=token_usage_raw.get("model", "unknown"),
            provider=token_usage_raw.get("provider", "unknown"),
        )

        ctx: dict[str, Any] = {
            "input": scenario.input,
            "output": output,
            "expected": scenario.expected,
            "metadata": scenario.metadata,
            "token_usage": token_usage_raw,
        }

        scores: list[ScorerResult] = []
        for scorer in scorers:
            try:
                score = await scorer(ctx)
                scores.append(score)
            except Exception as e:
                scores.append(ScorerResult(name="scorer_error", score=0.0, passed=False, reason=str(e)))

        passed = all(s.passed for s in scores)

        trial_results.append(TrialResult(
            trial_number=t,
            output=output,
            scores=scores,
            passed=passed,
            token_usage=token_usage,
            duration=duration,
        ))

    # Compute probabilistic pass@k, pass^k, and G-pass@k
    n = len(trial_results)
    c = sum(1 for t in trial_results if t.passed)
    p = c / n if n > 0 else 0.0
    pass_at_k = 1.0 - math.pow(1.0 - p, n) if n > 0 else 0.0
    pass_to_the_k = math.pow(p, n) if n > 0 else 0.0
    g_pass_at_k = _compute_g_pass_at_k(n, c)

    # Aggregate scores
    score_values: dict[str, list[float]] = {}
    for trial in trial_results:
        for score in trial.scores:
            score_values.setdefault(score.name, []).append(score.score)

    aggregated: dict[str, AggregatedScore] = {}
    for score_name, values in score_values.items():
        mean = sum(values) / len(values)
        min_val = min(values)
        max_val = max(values)
        variance = sum((v - mean) ** 2 for v in values) / len(values)
        aggregated[score_name] = AggregatedScore(
            name=score_name, mean=mean, min=min_val, max=max_val, stddev=variance ** 0.5
        )

    return ScenarioResult(
        scenario_id=scenario.id,
        trials=trial_results,
        aggregated_scores=aggregated,
        pass_at_k=pass_at_k,
        pass_to_the_k=pass_to_the_k,
        g_pass_at_k=g_pass_at_k,
    )


def _compute_summary(results: list[ScenarioResult]) -> EvaluationSummary:
    total_scenarios = len(results)
    total_trials = sum(len(r.trials) for r in results)
    passed_trials = sum(sum(1 for t in r.trials if t.passed) for r in results)
    overall_pass_rate = passed_trials / total_trials if total_trials > 0 else 0.0

    pass_at_k = sum(r.pass_at_k for r in results) / total_scenarios if total_scenarios > 0 else 0.0
    pass_to_the_k = sum(r.pass_to_the_k for r in results) / total_scenarios if total_scenarios > 0 else 0.0
    g_pass_at_k = sum(r.g_pass_at_k for r in results) / total_scenarios if total_scenarios > 0 else 0.0

    total_cost = sum(t.token_usage.estimated_cost for r in results for t in r.trials)
    total_duration = sum(t.duration for r in results for t in r.trials)
    total_tokens = sum(t.token_usage.total_tokens for r in results for t in r.trials)
    avg_tokens = total_tokens / total_scenarios if total_scenarios > 0 else 0.0

    # Merge score summaries
    all_names: set[str] = set()
    for r in results:
        all_names.update(r.aggregated_scores.keys())

    score_summaries: dict[str, AggregatedScore] = {}
    for name in all_names:
        values = [r.aggregated_scores[name].mean for r in results if name in r.aggregated_scores]
        if not values:
            continue
        mean = sum(values) / len(values)
        variance = sum((v - mean) ** 2 for v in values) / len(values)
        score_summaries[name] = AggregatedScore(
            name=name, mean=mean, min=min(values), max=max(values), stddev=variance ** 0.5
        )

    return EvaluationSummary(
        total_scenarios=total_scenarios,
        total_trials=total_trials,
        overall_pass_rate=overall_pass_rate,
        pass_at_k=pass_at_k,
        pass_to_the_k=pass_to_the_k,
        g_pass_at_k=g_pass_at_k,
        total_cost=total_cost,
        total_duration=total_duration,
        avg_tokens_per_scenario=avg_tokens,
        score_summaries=score_summaries,
    )


def _binomial_pmf(n: int, k: int, p: float) -> float:
    """Binomial probability mass function: P(X=k) given n trials and success probability p."""
    if p == 0.0:
        return 1.0 if k == 0 else 0.0
    if p == 1.0:
        return 1.0 if k == n else 0.0
    coeff = math.comb(n, k)
    return coeff * math.pow(p, k) * math.pow(1.0 - p, n - k)


def _compute_g_pass_at_k(n: int, c: int, threshold: int | None = None) -> float:
    """Compute G-Pass@k (Generalized Pass@k from LiveMathBench).

    Measures the probability of achieving at least `threshold` successes
    in n trials using the binomial CDF.

    Args:
        n: Total number of trials
        c: Number of successes observed
        threshold: Minimum successes required (default: ceil(n * 0.5))

    Returns:
        Probability of achieving >= threshold successes
    """
    if n == 0:
        return 0.0
    t = threshold if threshold is not None else math.ceil(n * 0.5)
    if c >= t:
        return 1.0
    p = c / n
    cumulative = sum(_binomial_pmf(n, i, p) for i in range(t))
    return 1.0 - cumulative
