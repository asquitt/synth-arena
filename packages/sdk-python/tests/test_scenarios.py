"""Tests for syntharena.scenarios module."""

import json
import tempfile
from pathlib import Path

import pytest

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
from syntharena.types import Scenario, ScenarioMetadata


def _make_scenario(
    id: str = "s1",
    domain: str = "web-scraping",
    name: str = "Test scenario",
    description: str = "A test scenario",
    complexity: str = "medium",
    tags: list[str] | None = None,
) -> Scenario:
    return Scenario(
        id=id,
        domain=domain,
        name=name,
        description=description,
        input={"type": "url", "url": "https://example.com"},
        metadata=ScenarioMetadata(
            complexity=complexity,
            tags=tags or [domain],
            generated_at="2026-01-01T00:00:00Z",
            generator_version="test",
        ),
        expected={"success": True},
    )


class TestLoadSaveScenarios:
    def test_roundtrip(self, tmp_path: Path) -> None:
        scenarios = [_make_scenario(id="s1"), _make_scenario(id="s2", description="Second")]
        file = tmp_path / "scenarios.json"

        save_scenarios(scenarios, file)
        loaded = load_scenarios(file)

        assert len(loaded) == 2
        assert loaded[0].id == "s1"
        assert loaded[1].id == "s2"

    def test_load_missing_file(self) -> None:
        with pytest.raises(FileNotFoundError):
            load_scenarios("/nonexistent/path.json")

    def test_load_invalid_json(self, tmp_path: Path) -> None:
        file = tmp_path / "bad.json"
        file.write_text('{"not": "an array"}')

        with pytest.raises(ValueError, match="Expected JSON array"):
            load_scenarios(file)

    def test_save_creates_parent_dirs(self, tmp_path: Path) -> None:
        nested = tmp_path / "a" / "b" / "scenarios.json"
        save_scenarios([_make_scenario()], nested)
        assert nested.exists()


class TestGenerateScenarios:
    def test_generates_correct_count(self) -> None:
        config = GenerationConfig(domain="web-scraping", count=5, seed=42)
        scenarios = generate_scenarios(config)
        assert len(scenarios) == 5

    def test_deterministic_with_seed(self) -> None:
        config = GenerationConfig(domain="web-scraping", count=3, seed=42)
        run1 = generate_scenarios(config)
        run2 = generate_scenarios(config)
        assert [s.description for s in run1] == [s.description for s in run2]

    def test_uses_domain_templates(self) -> None:
        config = GenerationConfig(domain="web-scraping", count=10, seed=1)
        scenarios = generate_scenarios(config)
        # web-scraping templates have url input_type
        assert all(s.input.get("type") == "url" for s in scenarios)

    def test_unknown_domain_uses_defaults(self) -> None:
        config = GenerationConfig(domain="unknown-domain", count=3, seed=1)
        scenarios = generate_scenarios(config)
        assert len(scenarios) == 3
        assert all(s.domain == "unknown-domain" for s in scenarios)

    def test_custom_complexity_distribution(self) -> None:
        config = GenerationConfig(
            domain="web-scraping",
            count=20,
            seed=99,
            complexity_distribution={"high": 1.0},
        )
        scenarios = generate_scenarios(config)
        assert all(s.metadata.complexity == "high" for s in scenarios)

    def test_custom_tags(self) -> None:
        config = GenerationConfig(
            domain="web-scraping",
            count=2,
            seed=1,
            tags=["custom", "test"],
        )
        scenarios = generate_scenarios(config)
        assert scenarios[0].metadata.tags == ["custom", "test"]


class TestValidateScenarios:
    def test_valid_scenarios(self) -> None:
        scenarios = [
            _make_scenario(id="s1", description="First"),
            _make_scenario(id="s2", description="Second"),
        ]
        report = validate_scenarios(scenarios)
        assert report.valid is True
        assert report.total == 2
        assert report.passed == 2
        assert len(report.errors) == 0

    def test_duplicate_ids(self) -> None:
        scenarios = [
            _make_scenario(id="same"),
            _make_scenario(id="same"),
        ]
        report = validate_scenarios(scenarios)
        assert report.valid is False
        assert any("duplicate id" in e for e in report.errors)

    def test_missing_domain(self) -> None:
        s = _make_scenario()
        s.domain = ""
        report = validate_scenarios([s])
        assert report.valid is False

    def test_low_diversity_warning(self) -> None:
        scenarios = [_make_scenario(id=f"s{i}") for i in range(10)]
        # All have the same description
        report = validate_scenarios(scenarios)
        assert any("Low diversity" in w for w in report.warnings)

    def test_single_complexity_warning(self) -> None:
        scenarios = [_make_scenario(id=f"s{i}", description=f"Desc {i}") for i in range(10)]
        report = validate_scenarios(scenarios)
        assert any("complexity" in w.lower() for w in report.warnings)


class TestFilterScenarios:
    def test_filter_by_domain(self) -> None:
        scenarios = [
            _make_scenario(id="s1", domain="web-scraping"),
            _make_scenario(id="s2", domain="healthcare"),
        ]
        result = filter_scenarios(scenarios, domain="healthcare")
        assert len(result) == 1
        assert result[0].domain == "healthcare"

    def test_filter_by_complexity(self) -> None:
        scenarios = [
            _make_scenario(id="s1", complexity="low"),
            _make_scenario(id="s2", complexity="high"),
        ]
        result = filter_scenarios(scenarios, complexity="high")
        assert len(result) == 1
        assert result[0].metadata.complexity == "high"

    def test_filter_by_tags(self) -> None:
        scenarios = [
            _make_scenario(id="s1", tags=["web", "scraping"]),
            _make_scenario(id="s2", tags=["health"]),
        ]
        result = filter_scenarios(scenarios, tags=["web"])
        assert len(result) == 1

    def test_max_count(self) -> None:
        scenarios = [_make_scenario(id=f"s{i}") for i in range(10)]
        result = filter_scenarios(scenarios, max_count=3)
        assert len(result) == 3

    def test_combined_filters(self) -> None:
        scenarios = [
            _make_scenario(id="s1", domain="web-scraping", complexity="high"),
            _make_scenario(id="s2", domain="web-scraping", complexity="low"),
            _make_scenario(id="s3", domain="healthcare", complexity="high"),
        ]
        result = filter_scenarios(scenarios, domain="web-scraping", complexity="high")
        assert len(result) == 1
        assert result[0].id == "s1"


class TestDeduplicateScenarios:
    def test_removes_exact_duplicates(self) -> None:
        scenarios = [
            _make_scenario(id="s1", description="Same description"),
            _make_scenario(id="s2", description="Same description"),
            _make_scenario(id="s3", description="Different one"),
        ]
        result = deduplicate_scenarios(scenarios)
        assert len(result) == 2

    def test_case_insensitive(self) -> None:
        scenarios = [
            _make_scenario(id="s1", description="Hello World"),
            _make_scenario(id="s2", description="hello world"),
        ]
        result = deduplicate_scenarios(scenarios)
        assert len(result) == 1

    def test_preserves_order(self) -> None:
        scenarios = [
            _make_scenario(id="first", description="A"),
            _make_scenario(id="second", description="A"),
        ]
        result = deduplicate_scenarios(scenarios)
        assert result[0].id == "first"

    def test_no_duplicates_returns_all(self) -> None:
        scenarios = [
            _make_scenario(id="s1", description="A"),
            _make_scenario(id="s2", description="B"),
        ]
        result = deduplicate_scenarios(scenarios)
        assert len(result) == 2
