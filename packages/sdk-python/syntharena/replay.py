"""Trace replay and regression detection for SynthArena."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal

from syntharena.types import EvaluationRun, ScenarioResult


@dataclass
class RegressionSummary:
    """Summary of regression comparison between two runs."""
    pass_rate_delta: float
    pass_at_k_delta: float
    cost_delta: float
    cost_delta_percent: float
    latency_delta: float
    new_failures: int
    fixed_failures: int


@dataclass
class ScenarioComparison:
    """Comparison of a single scenario across two runs."""
    scenario_id: str
    baseline_pass_rate: float
    current_pass_rate: float
    status: Literal["improved", "regressed", "unchanged", "new", "removed"]
    cost_delta: float


@dataclass
class RegressionReport:
    """Full regression report comparing baseline vs current run."""
    baseline_run_id: str
    current_run_id: str
    verdict: Literal["pass", "fail", "warn"]
    summary: RegressionSummary
    scenario_details: list[ScenarioComparison]
    thresholds: RegressionThresholds


@dataclass
class RegressionThresholds:
    """Thresholds for regression detection."""
    max_pass_rate_drop: float = 0.05
    max_cost_increase_pct: float = 20.0
    max_latency_increase_pct: float = 50.0
    max_new_failures: int = 0


def compare_runs(
    baseline: EvaluationRun,
    current: EvaluationRun,
    thresholds: RegressionThresholds | None = None,
) -> RegressionReport:
    """Compare two evaluation runs to detect regressions.

    Args:
        baseline: The reference run to compare against.
        current: The new run to check for regressions.
        thresholds: Regression thresholds (uses defaults if not specified).

    Returns:
        RegressionReport with verdict and per-scenario details.
    """
    thresh = thresholds or RegressionThresholds()

    baseline_map = {r.scenario_id: r for r in baseline.results}
    current_map = {r.scenario_id: r for r in current.results}

    all_ids = set(baseline_map.keys()) | set(current_map.keys())
    details: list[ScenarioComparison] = []
    new_failures = 0
    fixed_failures = 0

    for sid in sorted(all_ids):
        b = baseline_map.get(sid)
        c = current_map.get(sid)

        if b and not c:
            details.append(ScenarioComparison(
                scenario_id=sid, baseline_pass_rate=b.pass_at_k,
                current_pass_rate=0.0, status="removed", cost_delta=0.0,
            ))
            continue

        if c and not b:
            details.append(ScenarioComparison(
                scenario_id=sid, baseline_pass_rate=0.0,
                current_pass_rate=c.pass_at_k, status="new", cost_delta=0.0,
            ))
            continue

        assert b is not None and c is not None
        b_cost = sum(t.token_usage.estimated_cost for t in b.trials)
        c_cost = sum(t.token_usage.estimated_cost for t in c.trials)

        if c.pass_at_k > b.pass_at_k + 0.01:
            status: Literal["improved", "regressed", "unchanged"] = "improved"
            fixed_failures += 1
        elif c.pass_at_k < b.pass_at_k - 0.01:
            status = "regressed"
            new_failures += 1
        else:
            status = "unchanged"

        details.append(ScenarioComparison(
            scenario_id=sid,
            baseline_pass_rate=b.pass_at_k,
            current_pass_rate=c.pass_at_k,
            status=status,
            cost_delta=c_cost - b_cost,
        ))

    # Compute summary
    pass_rate_delta = current.summary.overall_pass_rate - baseline.summary.overall_pass_rate
    pass_at_k_delta = current.summary.pass_at_k - baseline.summary.pass_at_k
    cost_delta = current.summary.total_cost - baseline.summary.total_cost
    cost_delta_pct = (cost_delta / baseline.summary.total_cost * 100) if baseline.summary.total_cost > 0 else 0.0
    latency_delta = current.summary.total_duration - baseline.summary.total_duration

    summary = RegressionSummary(
        pass_rate_delta=pass_rate_delta,
        pass_at_k_delta=pass_at_k_delta,
        cost_delta=cost_delta,
        cost_delta_percent=cost_delta_pct,
        latency_delta=latency_delta,
        new_failures=new_failures,
        fixed_failures=fixed_failures,
    )

    # Determine verdict
    verdict: Literal["pass", "fail", "warn"] = "pass"
    if pass_rate_delta < -thresh.max_pass_rate_drop:
        verdict = "fail"
    elif new_failures > thresh.max_new_failures:
        verdict = "fail"
    elif cost_delta_pct > thresh.max_cost_increase_pct:
        verdict = "warn"

    return RegressionReport(
        baseline_run_id=baseline.id,
        current_run_id=current.id,
        verdict=verdict,
        summary=summary,
        scenario_details=details,
        thresholds=thresh,
    )


def save_baseline(run: EvaluationRun, path: str | Path) -> None:
    """Save an evaluation run as a baseline for future regression checks.

    Args:
        run: The evaluation run to save.
        path: File path for the baseline JSON.
    """
    file_path = Path(path)
    file_path.parent.mkdir(parents=True, exist_ok=True)

    data = _serialize_run(run)
    file_path.write_text(json.dumps(data, indent=2), encoding="utf-8")


def load_baseline(path: str | Path) -> EvaluationRun:
    """Load a baseline evaluation run from a JSON file.

    Args:
        path: Path to the baseline JSON file.

    Returns:
        Parsed EvaluationRun.

    Raises:
        FileNotFoundError: If the baseline file doesn't exist.
    """
    file_path = Path(path)
    if not file_path.exists():
        raise FileNotFoundError(f"Baseline file not found: {path}")

    data = json.loads(file_path.read_text(encoding="utf-8"))
    return _parse_run(data)


def format_report(report: RegressionReport) -> str:
    """Format a regression report as a human-readable string.

    Args:
        report: The regression report to format.

    Returns:
        Formatted report string.
    """
    lines: list[str] = []
    verdict_icon = {"pass": "PASS", "fail": "FAIL", "warn": "WARN"}[report.verdict]
    lines.append(f"Regression Report [{verdict_icon}]")
    lines.append(f"  Baseline: {report.baseline_run_id}")
    lines.append(f"  Current:  {report.current_run_id}")
    lines.append("")
    lines.append("Summary:")
    lines.append(f"  Pass rate delta: {report.summary.pass_rate_delta:+.2%}")
    lines.append(f"  Cost delta: {report.summary.cost_delta_percent:+.1f}%")
    lines.append(f"  New failures: {report.summary.new_failures}")
    lines.append(f"  Fixed: {report.summary.fixed_failures}")

    if report.scenario_details:
        lines.append("")
        lines.append("Scenarios:")
        for d in report.scenario_details:
            icon = {"improved": "+", "regressed": "-", "unchanged": "=", "new": "N", "removed": "R"}[d.status]
            lines.append(f"  [{icon}] {d.scenario_id}: {d.baseline_pass_rate:.0%} → {d.current_pass_rate:.0%}")

    return "\n".join(lines)


# ─── Serialization helpers ───────────────────────────────────

def _serialize_run(run: EvaluationRun) -> dict[str, Any]:
    """Serialize an EvaluationRun to a JSON-compatible dict."""
    return {
        "id": run.id,
        "name": run.name,
        "created_at": run.created_at,
        "completed_at": run.completed_at,
        "status": run.status,
        "summary": {
            "total_scenarios": run.summary.total_scenarios,
            "total_trials": run.summary.total_trials,
            "overall_pass_rate": run.summary.overall_pass_rate,
            "pass_at_k": run.summary.pass_at_k,
            "pass_to_the_k": run.summary.pass_to_the_k,
            "g_pass_at_k": run.summary.g_pass_at_k,
            "total_cost": run.summary.total_cost,
            "total_duration": run.summary.total_duration,
            "avg_tokens_per_scenario": run.summary.avg_tokens_per_scenario,
        },
        "results": [
            {
                "scenario_id": r.scenario_id,
                "pass_at_k": r.pass_at_k,
                "pass_to_the_k": r.pass_to_the_k,
                "g_pass_at_k": r.g_pass_at_k,
                "trials": [
                    {
                        "trial_number": t.trial_number,
                        "passed": t.passed,
                        "duration": t.duration,
                        "token_usage": {
                            "input_tokens": t.token_usage.input_tokens,
                            "output_tokens": t.token_usage.output_tokens,
                            "total_tokens": t.token_usage.total_tokens,
                            "estimated_cost": t.token_usage.estimated_cost,
                            "model": t.token_usage.model,
                            "provider": t.token_usage.provider,
                        },
                    }
                    for t in r.trials
                ],
            }
            for r in run.results
        ],
    }


def _parse_run(data: dict[str, Any]) -> EvaluationRun:
    """Parse a dict into an EvaluationRun."""
    from syntharena.types import (
        EvaluationSummary,
        ScenarioResult,
        TrialResult,
        ScorerResult,
        TokenUsage,
        AggregatedScore,
    )

    summary_raw = data["summary"]
    summary = EvaluationSummary(
        total_scenarios=summary_raw["total_scenarios"],
        total_trials=summary_raw["total_trials"],
        overall_pass_rate=summary_raw["overall_pass_rate"],
        pass_at_k=summary_raw["pass_at_k"],
        pass_to_the_k=summary_raw["pass_to_the_k"],
        g_pass_at_k=summary_raw["g_pass_at_k"],
        total_cost=summary_raw["total_cost"],
        total_duration=summary_raw["total_duration"],
        avg_tokens_per_scenario=summary_raw["avg_tokens_per_scenario"],
        score_summaries={},
    )

    results: list[ScenarioResult] = []
    for r in data.get("results", []):
        trials: list[TrialResult] = []
        for t in r.get("trials", []):
            tu = t.get("token_usage", {})
            trials.append(TrialResult(
                trial_number=t["trial_number"],
                output=t.get("output"),
                scores=[],
                passed=t["passed"],
                token_usage=TokenUsage(
                    input_tokens=tu.get("input_tokens", 0),
                    output_tokens=tu.get("output_tokens", 0),
                    total_tokens=tu.get("total_tokens", 0),
                    estimated_cost=tu.get("estimated_cost", 0.0),
                    model=tu.get("model", "unknown"),
                    provider=tu.get("provider", "unknown"),
                ),
                duration=t.get("duration", 0.0),
            ))
        results.append(ScenarioResult(
            scenario_id=r["scenario_id"],
            trials=trials,
            aggregated_scores={},
            pass_at_k=r.get("pass_at_k", 0.0),
            pass_to_the_k=r.get("pass_to_the_k", 0.0),
            g_pass_at_k=r.get("g_pass_at_k", 0.0),
        ))

    return EvaluationRun(
        id=data["id"],
        name=data["name"],
        created_at=data["created_at"],
        completed_at=data.get("completed_at"),
        status=data["status"],
        results=results,
        summary=summary,
    )
