"""Tests for syntharena.batch module."""

import asyncio

import pytest

from syntharena.batch import (
    BatchConfig,
    BatchProgress,
    BatchResult,
    run_batch,
    run_batch_multi,
)
from syntharena.types import Scenario, ScenarioMetadata, ScorerResult


def _make_scenario(id: str = "s1") -> Scenario:
    return Scenario(
        id=id,
        domain="test",
        name=f"Test {id}",
        description=f"Scenario {id}",
        input={"value": 1},
        metadata=ScenarioMetadata(
            complexity="medium",
            tags=["test"],
            generated_at="2026-01-01T00:00:00Z",
            generator_version="test",
        ),
    )


async def _passing_task(input: dict) -> dict:
    return {
        "output": {"success": True},
        "token_usage": {
            "input_tokens": 100,
            "output_tokens": 50,
            "total_tokens": 150,
            "estimated_cost": 0.001,
            "model": "test",
            "provider": "test",
        },
    }


async def _failing_task(input: dict) -> dict:
    return {
        "output": None,
        "token_usage": {
            "input_tokens": 100,
            "output_tokens": 50,
            "total_tokens": 150,
            "estimated_cost": 0.001,
            "model": "test",
            "provider": "test",
        },
    }


async def _always_pass_scorer(ctx: dict) -> ScorerResult:
    return ScorerResult(name="pass", score=1.0, passed=True)


async def _always_fail_scorer(ctx: dict) -> ScorerResult:
    return ScorerResult(name="fail", score=0.0, passed=False, reason="Always fails")


class TestRunBatch:
    @pytest.mark.asyncio
    async def test_basic_batch(self) -> None:
        config = BatchConfig(
            name="test-batch",
            dataset=[_make_scenario("s1"), _make_scenario("s2")],
            task=_passing_task,
            scorers=[_always_pass_scorer],
        )
        result = await run_batch(config)

        assert isinstance(result, BatchResult)
        assert result.run.status == "completed"
        assert len(result.run.results) == 2
        assert result.error_count == 0
        assert result.duration > 0

    @pytest.mark.asyncio
    async def test_progress_callback(self) -> None:
        progress_events: list[BatchProgress] = []

        config = BatchConfig(
            name="test-progress",
            dataset=[_make_scenario("s1"), _make_scenario("s2")],
            task=_passing_task,
            scorers=[_always_pass_scorer],
        )
        await run_batch(config, on_progress=progress_events.append)

        # At minimum: one during each scenario + one final
        assert len(progress_events) >= 2
        # Final event should show all completed
        final = progress_events[-1]
        assert final.completed == 2
        assert final.total == 2

    @pytest.mark.asyncio
    async def test_error_counting(self) -> None:
        config = BatchConfig(
            name="test-errors",
            dataset=[_make_scenario("s1"), _make_scenario("s2")],
            task=_passing_task,
            scorers=[_always_fail_scorer],
        )
        result = await run_batch(config)

        assert result.error_count == 2

    @pytest.mark.asyncio
    async def test_retry_on_failure(self) -> None:
        call_count = 0

        async def flaky_task(input: dict) -> dict:
            nonlocal call_count
            call_count += 1
            return await _passing_task(input)

        config = BatchConfig(
            name="test-retry",
            dataset=[_make_scenario("s1")],
            task=flaky_task,
            scorers=[_always_fail_scorer],  # Always fails, so retries kick in
        )
        result = await run_batch(config, retry_failures=True, max_retries=2)

        assert result.retried_count == 2  # 2 retries for the 1 failing scenario

    @pytest.mark.asyncio
    async def test_concurrency_limit(self) -> None:
        active = 0
        max_active = 0

        async def tracked_task(input: dict) -> dict:
            nonlocal active, max_active
            active += 1
            max_active = max(max_active, active)
            await asyncio.sleep(0.01)
            active -= 1
            return await _passing_task(input)

        config = BatchConfig(
            name="test-concurrency",
            dataset=[_make_scenario(f"s{i}") for i in range(10)],
            task=tracked_task,
            scorers=[_always_pass_scorer],
            max_concurrency=3,
        )
        await run_batch(config)

        assert max_active <= 3

    @pytest.mark.asyncio
    async def test_empty_dataset(self) -> None:
        config = BatchConfig(
            name="test-empty",
            dataset=[],
            task=_passing_task,
            scorers=[_always_pass_scorer],
        )
        result = await run_batch(config)
        assert len(result.run.results) == 0
        assert result.error_count == 0


class TestRunBatchMulti:
    @pytest.mark.asyncio
    async def test_sequential(self) -> None:
        configs = [
            BatchConfig(
                name=f"batch-{i}",
                dataset=[_make_scenario(f"s{i}")],
                task=_passing_task,
                scorers=[_always_pass_scorer],
            )
            for i in range(3)
        ]
        results = await run_batch_multi(configs, sequential=True)

        assert len(results) == 3
        assert all(r.run.status == "completed" for r in results)

    @pytest.mark.asyncio
    async def test_concurrent(self) -> None:
        configs = [
            BatchConfig(
                name=f"batch-{i}",
                dataset=[_make_scenario(f"s{i}")],
                task=_passing_task,
                scorers=[_always_pass_scorer],
            )
            for i in range(3)
        ]
        results = await run_batch_multi(configs, sequential=False)

        assert len(results) == 3
        assert all(r.run.status == "completed" for r in results)
