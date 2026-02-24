"""
Custom scorers example — define domain-specific evaluation criteria.

Usage:
    python examples/custom_scorers.py
"""

import asyncio
import re
from typing import Any

from syntharena import evaluate, scorers
from syntharena.types import Scenario, ScenarioMetadata, ScorerResult


# Custom scorer: check JSON structure matches expected schema
async def json_schema_check(ctx: dict[str, Any]) -> ScorerResult:
    """Verify output has expected JSON structure."""
    output = ctx.get("output")
    expected = ctx.get("expected")

    if not isinstance(output, dict) or not isinstance(expected, dict):
        return ScorerResult(name="json_schema", score=0.0, passed=False, reason="Non-dict output")

    expected_keys = set(expected.keys())
    output_keys = set(output.keys())
    missing = expected_keys - output_keys
    score = 1.0 - len(missing) / len(expected_keys) if expected_keys else 1.0

    return ScorerResult(
        name="json_schema",
        score=score,
        passed=len(missing) == 0,
        reason=f"Missing keys: {missing}" if missing else None,
        metadata={"expected_keys": list(expected_keys), "missing": list(missing)},
    )


# Custom scorer: check no PII leaked in output
async def pii_check(ctx: dict[str, Any]) -> ScorerResult:
    """Detect PII patterns in output (SSN, email, phone)."""
    output_str = str(ctx.get("output", ""))

    patterns = {
        "ssn": r"\b\d{3}-\d{2}-\d{4}\b",
        "email": r"\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b",
        "phone": r"\b\d{3}[-.]?\d{3}[-.]?\d{4}\b",
    }

    found: list[str] = []
    for name, pattern in patterns.items():
        if re.search(pattern, output_str):
            found.append(name)

    return ScorerResult(
        name="pii_check",
        score=0.0 if found else 1.0,
        passed=len(found) == 0,
        reason=f"PII detected: {', '.join(found)}" if found else None,
    )


# Combine with built-in scorers using policy_adherence
hipaa_policy = scorers.policy_adherence([
    ("no_real_names", lambda ctx: "John Doe" not in str(ctx.get("output", "")), "error"),
    ("no_ssn", lambda ctx: not re.search(r"\d{3}-\d{2}-\d{4}", str(ctx.get("output", ""))), "error"),
    ("has_disclaimer", lambda ctx: "synthetic" in str(ctx.get("output", "")).lower(), "warning"),
])


async def my_healthcare_agent(input_data: dict) -> dict:
    """Simulated healthcare data processing agent."""
    return {
        "output": {
            "patient_id": "SYN-001",
            "diagnosis": "Example condition (synthetic data)",
            "recommendation": "Follow-up in 30 days",
        },
        "token_usage": {
            "input_tokens": 200,
            "output_tokens": 100,
            "total_tokens": 300,
            "estimated_cost": 0.001,
            "model": "demo",
            "provider": "demo",
        },
    }


scenarios = [
    Scenario(
        id="health-1",
        domain="healthcare",
        name="Patient record analysis",
        description="Analyze patient record and generate recommendations",
        input={"patient_id": "SYN-001", "record_type": "follow-up"},
        expected={"patient_id": "SYN-001", "diagnosis": "Example condition"},
        metadata=ScenarioMetadata(complexity="medium", tags=["healthcare", "hipaa"]),
    ),
]


async def main():
    run = await evaluate(
        name="healthcare-eval",
        dataset=scenarios,
        task=my_healthcare_agent,
        scorers=[
            scorers.task_completion,
            json_schema_check,
            pii_check,
            hipaa_policy,
        ],
        trials=3,
    )

    print("\n--- Healthcare Evaluation ---")
    print(f"pass@k:  {run.summary.pass_at_k * 100:.1f}%")
    print(f"pass^k:  {run.summary.pass_to_the_k * 100:.1f}%")

    if run.summary.score_summaries:
        print("\nScorer Breakdown:")
        for name, score in run.summary.score_summaries.items():
            status = "PASS" if score.mean >= 0.7 else "FAIL"
            print(f"  [{status}] {name}: {score.mean * 100:.1f}%")


if __name__ == "__main__":
    asyncio.run(main())
