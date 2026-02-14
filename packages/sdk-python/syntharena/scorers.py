"""Built-in scorers for SynthArena Python SDK."""

from __future__ import annotations

from typing import Any, Callable, Awaitable

from syntharena.types import ScorerResult


# Scorer type: async function that takes context dict and returns ScorerResult
ScorerFn = Callable[[dict[str, Any]], Awaitable[ScorerResult]]


async def task_completion(ctx: dict[str, Any]) -> ScorerResult:
    """Check if the task produced non-null, non-error output."""
    output = ctx.get("output")
    has_output = output is not None

    return ScorerResult(
        name="task_completion",
        score=1.0 if has_output else 0.0,
        passed=has_output,
        reason=None if has_output else "No output produced",
    )


async def exact_match(ctx: dict[str, Any]) -> ScorerResult:
    """Check if output exactly matches expected."""
    expected = ctx.get("expected")
    output = ctx.get("output")

    if expected is None:
        return ScorerResult(name="exact_match", score=0.0, passed=False, reason="No expected value")

    matches = output == expected
    return ScorerResult(
        name="exact_match",
        score=1.0 if matches else 0.0,
        passed=matches,
        reason=None if matches else "Output does not match expected",
    )


def cost_threshold(max_cost: float) -> ScorerFn:
    """Fail if estimated cost exceeds threshold."""

    async def scorer(ctx: dict[str, Any]) -> ScorerResult:
        token_usage = ctx.get("token_usage", {})
        cost = token_usage.get("estimated_cost", 0.0) if isinstance(token_usage, dict) else 0.0
        passed = cost <= max_cost

        return ScorerResult(
            name="cost_threshold",
            score=1.0 if passed else max(0.0, 1.0 - (cost - max_cost) / max_cost),
            passed=passed,
            reason=None if passed else f"Cost ${cost:.4f} exceeds threshold ${max_cost:.4f}",
            metadata={"actual_cost": cost, "max_cost": max_cost},
        )

    return scorer


def contains(*substrings: str) -> ScorerFn:
    """Check if stringified output contains specific substrings."""

    async def scorer(ctx: dict[str, Any]) -> ScorerResult:
        output = ctx.get("output", "")
        output_str = str(output)
        found = [s for s in substrings if s in output_str]
        score = len(found) / len(substrings) if substrings else 0.0

        return ScorerResult(
            name="contains",
            score=score,
            passed=score == 1.0,
            reason=None if score == 1.0 else f"Missing: {', '.join(s for s in substrings if s not in output_str)}",
        )

    return scorer


def token_threshold(
    max_input: int | None = None,
    max_output: int | None = None,
    max_total: int | None = None,
) -> ScorerFn:
    """Fail if token usage exceeds limits."""

    async def scorer(ctx: dict[str, Any]) -> ScorerResult:
        token_usage = ctx.get("token_usage", {})
        if not isinstance(token_usage, dict):
            return ScorerResult(name="token_threshold", score=1.0, passed=True)

        violations: list[str] = []
        input_tokens = token_usage.get("input_tokens", 0)
        output_tokens = token_usage.get("output_tokens", 0)
        total_tokens = token_usage.get("total_tokens", 0)

        if max_input and input_tokens > max_input:
            violations.append(f"Input tokens {input_tokens} > {max_input}")
        if max_output and output_tokens > max_output:
            violations.append(f"Output tokens {output_tokens} > {max_output}")
        if max_total and total_tokens > max_total:
            violations.append(f"Total tokens {total_tokens} > {max_total}")

        passed = len(violations) == 0
        return ScorerResult(
            name="token_threshold",
            score=1.0 if passed else 0.0,
            passed=passed,
            reason="; ".join(violations) if violations else None,
        )

    return scorer


PolicyRule = Callable[[dict[str, Any]], bool]


def policy_adherence(
    rules: list[tuple[str, PolicyRule, str]],
) -> ScorerFn:
    """Check agent actions comply with domain-specific policies.

    Inspired by tau-bench (Sierra Research).

    Args:
        rules: List of (name, check_fn, severity) tuples.
               check_fn takes scorer context dict and returns True if rule passes.
               severity is "error" or "warning".
    """

    async def scorer(ctx: dict[str, Any]) -> ScorerResult:
        violations: list[tuple[str, str]] = []
        for name, check_fn, severity in rules:
            try:
                if not check_fn(ctx):
                    violations.append((name, severity))
            except Exception:
                violations.append((name, "error"))

        errors = [v for v in violations if v[1] == "error"]
        passed = len(errors) == 0
        score = max(0.0, 1.0 - len(violations) / len(rules)) if rules else 1.0

        return ScorerResult(
            name="policy_adherence",
            score=score,
            passed=passed,
            reason="; ".join(f"[{s}] {n}" for n, s in violations) if violations else None,
            metadata={
                "total_rules": len(rules),
                "errors": len(errors),
                "warnings": len(violations) - len(errors),
                "violated_rules": [n for n, _ in violations],
            },
        )

    return scorer


def latency_threshold(max_duration_ms: float) -> ScorerFn:
    """Fail if task duration exceeds the threshold (in ms)."""

    async def scorer(ctx: dict[str, Any]) -> ScorerResult:
        trace = ctx.get("trace", [])
        duration = 0.0
        if isinstance(trace, list):
            for span in trace:
                if isinstance(span, dict):
                    start = span.get("start_time", 0)
                    end = span.get("end_time", 0)
                    duration += end - start

        passed = duration <= max_duration_ms
        score = 1.0 if passed else max(0.0, 1.0 - (duration - max_duration_ms) / max_duration_ms)

        return ScorerResult(
            name="latency_threshold",
            score=score,
            passed=passed,
            reason=None if passed else f"Duration {duration:.0f}ms exceeds threshold {max_duration_ms:.0f}ms",
            metadata={"actual_duration": duration, "max_duration": max_duration_ms},
        )

    return scorer


def safety_check(
    max_tool_calls: int = 100,
    blocked_patterns: list[str] | None = None,
) -> ScorerFn:
    """Check for safety violations: excessive tool calls, blocked patterns in output/trace."""
    import re

    compiled = [re.compile(p) for p in (blocked_patterns or [])]

    async def scorer(ctx: dict[str, Any]) -> ScorerResult:
        violations: list[str] = []
        trace = ctx.get("trace", [])

        if isinstance(trace, list):
            tool_calls = [s for s in trace if isinstance(s, dict) and s.get("type") == "tool_invocation"]
            if len(tool_calls) > max_tool_calls:
                violations.append(f"Excessive tool calls: {len(tool_calls)} > {max_tool_calls}")

            for span in trace:
                if isinstance(span, dict):
                    attr_str = str(span.get("attributes", ""))
                    for pattern in compiled:
                        if pattern.search(attr_str):
                            violations.append(f"Blocked pattern in span {span.get('name', '?')}: {pattern.pattern}")

        output_str = str(ctx.get("output", ""))
        for pattern in compiled:
            if pattern.search(output_str):
                violations.append(f"Blocked pattern in output: {pattern.pattern}")

        passed = len(violations) == 0
        return ScorerResult(
            name="safety_check",
            score=1.0 if passed else 0.0,
            passed=passed,
            reason="; ".join(violations) if violations else None,
            metadata={"violation_count": len(violations)},
        )

    return scorer


def state_diff(
    expected_keys: list[str],
    collateral_keys: list[str] | None = None,
) -> ScorerFn:
    """Compare final environment state against expected state, detect collateral damage."""

    async def scorer(ctx: dict[str, Any]) -> ScorerResult:
        output = ctx.get("output")
        expected = ctx.get("expected")

        if not isinstance(output, dict) or expected is None:
            return ScorerResult(name="state_diff", score=0.0, passed=False, reason="Missing expected or output state")

        mismatches: list[str] = []
        for key in expected_keys:
            out_val = output.get(key)
            exp_val = expected.get(key) if isinstance(expected, dict) else None
            if out_val != exp_val:
                mismatches.append(f"{key}: got {out_val!r}, expected {exp_val!r}")

        collateral: list[str] = []
        if collateral_keys and isinstance(expected, dict):
            for key in collateral_keys:
                if key in output and key not in expected:
                    collateral.append(f"Unexpected change to {key}: {output[key]!r}")

        issues = mismatches + collateral
        total = len(expected_keys) + len(collateral_keys or [])
        passed = len(issues) == 0
        score = max(0.0, 1.0 - len(issues) / total) if total > 0 else 1.0

        return ScorerResult(
            name="state_diff",
            score=score,
            passed=passed,
            reason="; ".join(issues) if issues else None,
            metadata={"mismatches": len(mismatches), "collateral_damage": len(collateral)},
        )

    return scorer


AssertionFn = Callable[[Any], bool]


def no_regression(
    assertions: list[tuple[str, AssertionFn]],
) -> ScorerFn:
    """Verify agent doesn't break existing functionality.

    Inspired by SWE-bench pass-to-pass validation.

    Args:
        assertions: List of (name, check_fn) tuples.
                    check_fn takes the output and returns True if assertion holds.
    """

    async def scorer(ctx: dict[str, Any]) -> ScorerResult:
        output = ctx.get("output")
        failures: list[str] = []

        for name, check_fn in assertions:
            try:
                if not check_fn(output):
                    failures.append(name)
            except Exception as e:
                failures.append(f"{name} (threw: {e})")

        passed = len(failures) == 0
        score = max(0.0, 1.0 - len(failures) / len(assertions)) if assertions else 1.0

        return ScorerResult(
            name="no_regression",
            score=score,
            passed=passed,
            reason=f"Regressions detected: {', '.join(failures)}" if failures else None,
            metadata={
                "total_assertions": len(assertions),
                "failed": len(failures),
                "failed_assertions": failures,
            },
        )

    return scorer
