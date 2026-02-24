"""Batch evaluation operations for SynthArena."""

from __future__ import annotations

import asyncio
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Callable, Awaitable, Literal

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


@dataclass
class BatchConfig:
    """Configuration for a batch evaluation."""
    name: str
    dataset: list[Scenario]
    task: Callable[[dict[str, Any]], Awaitable[dict[str, Any]]]
    scorers: list[Callable[[dict[str, Any]], Awaitable[ScorerResult]]]
    trials: int = 1
    max_concurrency: int = 5
    timeout: float = 300.0
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class BatchProgress:
    """Progress update for a batch evaluation."""
    completed: int
    total: int
    current_scenario: str | None
    elapsed: float
    errors: int


@dataclass
class BatchResult:
    """Result of a batch evaluation with additional metadata."""
    run: EvaluationRun
    duration: float
    error_count: int
    retried_count: int


ProgressCallback = Callable[[BatchProgress], None]


async def run_batch(
    config: BatchConfig,
    on_progress: ProgressCallback | None = None,
    retry_failures: bool = False,
    max_retries: int = 2,
) -> BatchResult:
    """Run a batch evaluation with progress tracking and optional retries.

    Args:
        config: Batch evaluation configuration.
        on_progress: Optional callback for progress updates.
        retry_failures: Whether to retry failed scenarios.
        max_retries: Maximum retries per scenario when retry_failures is True.

    Returns:
        BatchResult with the completed evaluation run.
    """
    from syntharena.client import _evaluate_scenario, _compute_summary

    run_id = str(uuid.uuid4())
    start_time = time.time()
    created_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

    semaphore = asyncio.Semaphore(config.max_concurrency)
    completed = 0
    error_count = 0
    retried_count = 0
    total = len(config.dataset)

    async def eval_with_tracking(scenario: Scenario) -> ScenarioResult:
        nonlocal completed, error_count, retried_count

        async with semaphore:
            if on_progress:
                on_progress(BatchProgress(
                    completed=completed,
                    total=total,
                    current_scenario=scenario.id,
                    elapsed=time.time() - start_time,
                    errors=error_count,
                ))

            result = await _evaluate_scenario(
                scenario, config.task, config.scorers, config.trials, config.timeout,
            )

            # Retry if enabled and scenario failed
            if retry_failures and result.pass_at_k == 0.0:
                for attempt in range(max_retries):
                    retried_count += 1
                    result = await _evaluate_scenario(
                        scenario, config.task, config.scorers, config.trials, config.timeout,
                    )
                    if result.pass_at_k > 0.0:
                        break

            if result.pass_at_k == 0.0:
                error_count += 1

            completed += 1
            return result

    tasks = [eval_with_tracking(s) for s in config.dataset]
    results = list(await asyncio.gather(*tasks))

    if on_progress:
        on_progress(BatchProgress(
            completed=total,
            total=total,
            current_scenario=None,
            elapsed=time.time() - start_time,
            errors=error_count,
        ))

    summary = _compute_summary(results)
    duration = time.time() - start_time

    run = EvaluationRun(
        id=run_id,
        name=config.name,
        created_at=created_at,
        completed_at=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        status="completed",
        results=results,
        summary=summary,
    )

    return BatchResult(
        run=run,
        duration=duration,
        error_count=error_count,
        retried_count=retried_count,
    )


async def run_batch_multi(
    configs: list[BatchConfig],
    sequential: bool = False,
) -> list[BatchResult]:
    """Run multiple batch evaluations.

    Args:
        configs: List of batch configurations.
        sequential: Run sequentially (True) or concurrently (False).

    Returns:
        List of BatchResult, one per config.
    """
    if sequential:
        results: list[BatchResult] = []
        for config in configs:
            result = await run_batch(config)
            results.append(result)
        return results

    tasks = [run_batch(config) for config in configs]
    return list(await asyncio.gather(*tasks))
