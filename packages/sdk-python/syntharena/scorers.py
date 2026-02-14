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
