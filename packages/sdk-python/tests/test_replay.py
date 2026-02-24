"""Tests for syntharena.replay module."""

import json
from pathlib import Path

import pytest

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
from syntharena.types import (
    EvaluationRun,
    EvaluationSummary,
    ScenarioResult,
    TrialResult,
    TokenUsage,
    AggregatedScore,
)


def _make_token_usage(cost: float = 0.001) -> TokenUsage:
    return TokenUsage(
        input_tokens=100,
        output_tokens=50,
        total_tokens=150,
        estimated_cost=cost,
        model="test-model",
        provider="test",
    )


def _make_trial(passed: bool = True, cost: float = 0.001) -> TrialResult:
    return TrialResult(
        trial_number=0,
        output={"result": "ok"},
        scores=[],
        passed=passed,
        token_usage=_make_token_usage(cost),
        duration=0.1,
    )


def _make_scenario_result(
    scenario_id: str = "s1",
    pass_at_k: float = 1.0,
    trials: list[TrialResult] | None = None,
) -> ScenarioResult:
    return ScenarioResult(
        scenario_id=scenario_id,
        trials=trials or [_make_trial()],
        aggregated_scores={},
        pass_at_k=pass_at_k,
        pass_to_the_k=pass_at_k,
        g_pass_at_k=pass_at_k,
    )


def _make_summary(
    pass_rate: float = 0.9,
    pass_at_k: float = 0.9,
    cost: float = 0.01,
    duration: float = 10.0,
) -> EvaluationSummary:
    return EvaluationSummary(
        total_scenarios=2,
        total_trials=4,
        overall_pass_rate=pass_rate,
        pass_at_k=pass_at_k,
        pass_to_the_k=pass_at_k,
        g_pass_at_k=pass_at_k,
        total_cost=cost,
        total_duration=duration,
        avg_tokens_per_scenario=150.0,
        score_summaries={},
    )


def _make_run(
    id: str = "run-1",
    results: list[ScenarioResult] | None = None,
    summary: EvaluationSummary | None = None,
) -> EvaluationRun:
    return EvaluationRun(
        id=id,
        name="test-run",
        created_at="2026-01-01T00:00:00Z",
        completed_at="2026-01-01T00:01:00Z",
        status="completed",
        results=results or [_make_scenario_result("s1"), _make_scenario_result("s2")],
        summary=summary or _make_summary(),
    )


class TestCompareRuns:
    def test_identical_runs_pass(self) -> None:
        baseline = _make_run(id="baseline")
        current = _make_run(id="current")
        report = compare_runs(baseline, current)

        assert report.verdict == "pass"
        assert report.summary.new_failures == 0
        assert report.summary.fixed_failures == 0

    def test_regression_detected(self) -> None:
        baseline = _make_run(
            id="baseline",
            results=[
                _make_scenario_result("s1", pass_at_k=1.0),
                _make_scenario_result("s2", pass_at_k=1.0),
            ],
            summary=_make_summary(pass_rate=1.0, pass_at_k=1.0),
        )
        current = _make_run(
            id="current",
            results=[
                _make_scenario_result("s1", pass_at_k=0.5),
                _make_scenario_result("s2", pass_at_k=1.0),
            ],
            summary=_make_summary(pass_rate=0.75, pass_at_k=0.75),
        )
        report = compare_runs(baseline, current)

        assert report.verdict == "fail"
        assert report.summary.new_failures == 1

    def test_improvement_detected(self) -> None:
        baseline = _make_run(
            id="baseline",
            results=[_make_scenario_result("s1", pass_at_k=0.5)],
            summary=_make_summary(pass_rate=0.5, pass_at_k=0.5),
        )
        current = _make_run(
            id="current",
            results=[_make_scenario_result("s1", pass_at_k=1.0)],
            summary=_make_summary(pass_rate=1.0, pass_at_k=1.0),
        )
        report = compare_runs(baseline, current)

        assert report.verdict == "pass"
        assert report.summary.fixed_failures == 1

    def test_new_scenario(self) -> None:
        baseline = _make_run(
            id="baseline",
            results=[_make_scenario_result("s1")],
        )
        current = _make_run(
            id="current",
            results=[_make_scenario_result("s1"), _make_scenario_result("s2")],
        )
        report = compare_runs(baseline, current)

        new_scenarios = [d for d in report.scenario_details if d.status == "new"]
        assert len(new_scenarios) == 1
        assert new_scenarios[0].scenario_id == "s2"

    def test_removed_scenario(self) -> None:
        baseline = _make_run(
            id="baseline",
            results=[_make_scenario_result("s1"), _make_scenario_result("s2")],
        )
        current = _make_run(
            id="current",
            results=[_make_scenario_result("s1")],
        )
        report = compare_runs(baseline, current)

        removed = [d for d in report.scenario_details if d.status == "removed"]
        assert len(removed) == 1
        assert removed[0].scenario_id == "s2"

    def test_custom_thresholds(self) -> None:
        baseline = _make_run(
            id="baseline",
            summary=_make_summary(pass_rate=0.9, pass_at_k=0.9),
        )
        current = _make_run(
            id="current",
            summary=_make_summary(pass_rate=0.88, pass_at_k=0.88),
        )

        # Default threshold: 0.05 drop -> should pass (only 0.02 drop)
        report = compare_runs(baseline, current)
        assert report.verdict == "pass"

        # Strict threshold: 0.01 drop -> should fail
        strict = RegressionThresholds(max_pass_rate_drop=0.01)
        report = compare_runs(baseline, current, thresholds=strict)
        assert report.verdict == "fail"

    def test_cost_increase_warning(self) -> None:
        baseline = _make_run(
            id="baseline",
            summary=_make_summary(cost=0.01),
        )
        current = _make_run(
            id="current",
            summary=_make_summary(cost=0.03),
        )
        report = compare_runs(baseline, current)
        assert report.verdict == "warn"
        assert report.summary.cost_delta_percent > 20.0


class TestSaveLoadBaseline:
    def test_roundtrip(self, tmp_path: Path) -> None:
        run = _make_run()
        file = tmp_path / "baseline.json"

        save_baseline(run, file)
        loaded = load_baseline(file)

        assert loaded.id == run.id
        assert loaded.name == run.name
        assert loaded.summary.total_scenarios == run.summary.total_scenarios
        assert len(loaded.results) == len(run.results)

    def test_load_missing_file(self) -> None:
        with pytest.raises(FileNotFoundError):
            load_baseline("/nonexistent/baseline.json")

    def test_save_creates_parent_dirs(self, tmp_path: Path) -> None:
        nested = tmp_path / "a" / "b" / "baseline.json"
        save_baseline(_make_run(), nested)
        assert nested.exists()


class TestFormatReport:
    def test_pass_report(self) -> None:
        baseline = _make_run(id="baseline")
        current = _make_run(id="current")
        report = compare_runs(baseline, current)
        formatted = format_report(report)

        assert "PASS" in formatted
        assert "baseline" in formatted
        assert "current" in formatted

    def test_fail_report_shows_scenarios(self) -> None:
        baseline = _make_run(
            id="baseline",
            results=[_make_scenario_result("s1", pass_at_k=1.0)],
            summary=_make_summary(pass_rate=1.0, pass_at_k=1.0),
        )
        current = _make_run(
            id="current",
            results=[_make_scenario_result("s1", pass_at_k=0.0)],
            summary=_make_summary(pass_rate=0.0, pass_at_k=0.0),
        )
        report = compare_runs(baseline, current)
        formatted = format_report(report)

        assert "FAIL" in formatted
        assert "s1" in formatted
        assert "[-]" in formatted  # regressed indicator
