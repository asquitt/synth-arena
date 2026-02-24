"""Scenario generation and management for SynthArena."""

from __future__ import annotations

import json
import random
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from syntharena.types import Scenario, ScenarioMetadata


@dataclass
class GenerationConfig:
    """Configuration for scenario generation."""
    domain: str
    count: int = 10
    complexity_distribution: dict[str, float] | None = None
    seed: int | None = None
    tags: list[str] | None = None


@dataclass
class QualityReport:
    """Report on scenario quality validation."""
    valid: bool
    total: int
    passed: int
    errors: list[str]
    warnings: list[str]
    diversity_score: float


def load_scenarios(path: str | Path) -> list[Scenario]:
    """Load scenarios from a JSON file.

    Args:
        path: Path to JSON file containing scenario array.

    Returns:
        List of parsed Scenario objects.

    Raises:
        FileNotFoundError: If the file doesn't exist.
        ValueError: If the JSON structure is invalid.
    """
    file_path = Path(path)
    if not file_path.exists():
        raise FileNotFoundError(f"Scenario file not found: {path}")

    data = json.loads(file_path.read_text(encoding="utf-8"))
    if not isinstance(data, list):
        raise ValueError(f"Expected JSON array, got {type(data).__name__}")

    return [_parse_scenario(item) for item in data]


def save_scenarios(scenarios: list[Scenario], path: str | Path) -> None:
    """Save scenarios to a JSON file.

    Args:
        scenarios: List of Scenario objects to save.
        path: Output file path.
    """
    file_path = Path(path)
    file_path.parent.mkdir(parents=True, exist_ok=True)

    data = [_serialize_scenario(s) for s in scenarios]
    file_path.write_text(json.dumps(data, indent=2), encoding="utf-8")


def generate_scenarios(config: GenerationConfig) -> list[Scenario]:
    """Generate synthetic scenarios for a domain.

    Uses template-based generation with optional randomization.
    For LLM-based generation, use the API or CLI instead.

    Args:
        config: Generation configuration.

    Returns:
        List of generated Scenario objects.
    """
    rng = random.Random(config.seed)
    complexity_dist = config.complexity_distribution or {
        "low": 0.3,
        "medium": 0.5,
        "high": 0.2,
    }

    templates = _get_domain_templates(config.domain)
    scenarios: list[Scenario] = []

    for i in range(config.count):
        complexity = _weighted_choice(complexity_dist, rng)
        template = rng.choice(templates) if templates else _default_template(config.domain)

        scenario = Scenario(
            id=str(uuid.uuid4()),
            domain=config.domain,
            name=f"{config.domain}-scenario-{i + 1}",
            description=template.get("description", f"Generated scenario {i + 1}"),
            input=_generate_input(template, complexity, rng),
            metadata=ScenarioMetadata(
                complexity=complexity,
                tags=config.tags or [config.domain],
                generated_at="",
                generator_version="sdk-python-0.1.0",
            ),
            expected=template.get("expected"),
        )
        scenarios.append(scenario)

    return scenarios


def validate_scenarios(scenarios: list[Scenario]) -> QualityReport:
    """Validate a set of scenarios for quality and diversity.

    Checks:
        - Required fields are present
        - IDs are unique
        - Complexity distribution is balanced
        - No duplicate descriptions

    Args:
        scenarios: List of scenarios to validate.

    Returns:
        QualityReport with validation results.
    """
    errors: list[str] = []
    warnings: list[str] = []
    ids_seen: set[str] = set()

    for i, s in enumerate(scenarios):
        if not s.id:
            errors.append(f"Scenario {i}: missing id")
        elif s.id in ids_seen:
            errors.append(f"Scenario {i}: duplicate id '{s.id}'")
        ids_seen.add(s.id)

        if not s.domain:
            errors.append(f"Scenario {i}: missing domain")
        if not s.name:
            errors.append(f"Scenario {i}: missing name")
        if not s.input:
            warnings.append(f"Scenario {i}: empty input")

    # Check diversity
    descriptions = [s.description for s in scenarios]
    unique_descriptions = len(set(descriptions))
    diversity = unique_descriptions / len(descriptions) if descriptions else 0.0

    if diversity < 0.5:
        warnings.append(f"Low diversity: {diversity:.1%} unique descriptions")

    complexities = [s.metadata.complexity for s in scenarios]
    complexity_counts = {c: complexities.count(c) for c in set(complexities)}
    if len(complexity_counts) == 1 and len(scenarios) > 5:
        warnings.append(f"All scenarios have '{complexities[0]}' complexity")

    passed = len(scenarios) - len(errors)

    return QualityReport(
        valid=len(errors) == 0,
        total=len(scenarios),
        passed=passed,
        errors=errors,
        warnings=warnings,
        diversity_score=diversity,
    )


def filter_scenarios(
    scenarios: list[Scenario],
    domain: str | None = None,
    complexity: str | None = None,
    tags: list[str] | None = None,
    max_count: int | None = None,
) -> list[Scenario]:
    """Filter scenarios by criteria.

    Args:
        scenarios: Full list of scenarios.
        domain: Filter by domain name.
        complexity: Filter by complexity level.
        tags: Filter by any matching tag.
        max_count: Maximum scenarios to return.

    Returns:
        Filtered list of scenarios.
    """
    result = scenarios

    if domain:
        result = [s for s in result if s.domain == domain]
    if complexity:
        result = [s for s in result if s.metadata.complexity == complexity]
    if tags:
        tag_set = set(tags)
        result = [s for s in result if tag_set.intersection(s.metadata.tags)]
    if max_count is not None:
        result = result[:max_count]

    return result


def deduplicate_scenarios(scenarios: list[Scenario]) -> list[Scenario]:
    """Remove duplicate scenarios based on description similarity.

    Simple approach: exact description dedup. For fuzzy dedup, use the API.

    Returns:
        Deduplicated list preserving first occurrence order.
    """
    seen: set[str] = set()
    unique: list[Scenario] = []

    for s in scenarios:
        key = s.description.strip().lower()
        if key not in seen:
            seen.add(key)
            unique.append(s)

    return unique


# ─── Internal helpers ────────────────────────────────────────

def _parse_scenario(data: dict[str, Any]) -> Scenario:
    meta_raw = data.get("metadata", {})
    return Scenario(
        id=data["id"],
        domain=data["domain"],
        name=data["name"],
        description=data["description"],
        input=data["input"],
        metadata=ScenarioMetadata(
            complexity=meta_raw.get("complexity", "medium"),
            tags=meta_raw.get("tags", []),
            generated_at=meta_raw.get("generatedAt", ""),
            generator_version=meta_raw.get("generatorVersion", ""),
            seed_id=meta_raw.get("seedId"),
        ),
        expected=data.get("expected"),
    )


def _serialize_scenario(s: Scenario) -> dict[str, Any]:
    result: dict[str, Any] = {
        "id": s.id,
        "domain": s.domain,
        "name": s.name,
        "description": s.description,
        "input": s.input,
        "metadata": {
            "complexity": s.metadata.complexity,
            "tags": s.metadata.tags,
            "generatedAt": s.metadata.generated_at,
            "generatorVersion": s.metadata.generator_version,
        },
    }
    if s.expected:
        result["expected"] = s.expected
    if s.metadata.seed_id:
        result["metadata"]["seedId"] = s.metadata.seed_id
    return result


def _weighted_choice(
    distribution: dict[str, float],
    rng: random.Random,
) -> str:
    items = list(distribution.keys())
    weights = [distribution[k] for k in items]
    return rng.choices(items, weights=weights, k=1)[0]


def _get_domain_templates(domain: str) -> list[dict[str, Any]]:
    """Return basic templates for known domains."""
    templates: dict[str, list[dict[str, Any]]] = {
        "web-scraping": [
            {"description": "Scrape product listings from e-commerce page", "input_type": "url"},
            {"description": "Extract pricing data from comparison table", "input_type": "url"},
            {"description": "Navigate paginated search results", "input_type": "url"},
        ],
        "government": [
            {"description": "Search SAM.gov for contract opportunities", "input_type": "query"},
            {"description": "Parse RFP document for requirements", "input_type": "document"},
        ],
        "healthcare": [
            {"description": "Process patient intake form", "input_type": "form"},
            {"description": "Extract lab results from clinical report", "input_type": "document"},
        ],
    }
    return templates.get(domain, [])


def _default_template(domain: str) -> dict[str, Any]:
    return {"description": f"Generic {domain} task", "input_type": "generic"}


def _generate_input(
    template: dict[str, Any],
    complexity: str,
    rng: random.Random,
) -> dict[str, Any]:
    input_type = template.get("input_type", "generic")
    base_input: dict[str, Any] = {
        "type": input_type,
        "complexity": complexity,
    }

    if input_type == "url":
        base_input["url"] = f"https://example.com/{rng.randint(1000, 9999)}"
    elif input_type == "query":
        base_input["query"] = f"test-query-{rng.randint(100, 999)}"
    elif input_type == "document":
        base_input["content"] = f"Sample document content {rng.randint(1, 100)}"
    elif input_type == "form":
        base_input["fields"] = {"name": "test", "email": "test@example.com"}

    return base_input
