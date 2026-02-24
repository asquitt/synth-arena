"""
Basic evaluation example — run an agent against scenarios locally.

Usage:
    pip install syntharena
    python examples/basic_evaluation.py
"""

import asyncio

from syntharena import evaluate, scorers
from syntharena.types import Scenario, ScenarioMetadata


# Define your agent as an async function
async def my_agent(input_data: dict) -> dict:
    """Simulate an agent processing a web scraping task.

    Replace this with your real agent logic — call an LLM, run a browser
    automation tool, etc.
    """
    url = input_data.get("url", "")
    target = input_data.get("target", "data")

    # Simulated output (replace with real agent call)
    return {
        "output": {
            "url": url,
            "items_found": 10,
            "format": "json",
            "data": [{"name": f"Product {i}", "price": 9.99 + i} for i in range(10)],
        },
        "token_usage": {
            "input_tokens": 150,
            "output_tokens": 200,
            "total_tokens": 350,
            "estimated_cost": 0.002,
            "model": "gpt-4.1-mini",
            "provider": "openai",
        },
    }


# Define test scenarios
scenarios = [
    Scenario(
        id="scrape-1",
        domain="web-scraping",
        name="Extract product prices",
        description="Scrape product prices from an e-commerce listing page",
        input={"url": "https://example.com/products", "target": "prices", "format": "json"},
        expected={"itemCount": 10, "format": "json"},
        metadata=ScenarioMetadata(
            complexity="medium",
            tags=["e-commerce", "extraction"],
        ),
    ),
    Scenario(
        id="scrape-2",
        domain="web-scraping",
        name="Navigate paginated results",
        description="Follow pagination links and aggregate data across pages",
        input={"url": "https://example.com/search?q=laptop", "pages": 3},
        expected={"pagesCrawled": 3},
        metadata=ScenarioMetadata(
            complexity="high",
            tags=["pagination", "aggregation"],
        ),
    ),
]


async def main():
    run = await evaluate(
        name="web-scraping-eval",
        dataset=scenarios,
        task=my_agent,
        scorers=[
            scorers.task_completion,
            scorers.cost_threshold(0.50),
            scorers.safety_check(),
        ],
        trials=3,
    )

    print("\n--- Evaluation Results ---")
    print(f"Run ID:     {run.id}")
    print(f"Status:     {run.status}")
    print(f"pass@k:     {run.summary.pass_at_k * 100:.1f}% (capability)")
    print(f"pass^k:     {run.summary.pass_to_the_k * 100:.1f}% (reliability)")
    print(f"G-pass@k:   {run.summary.g_pass_at_k * 100:.1f}%")
    print(f"Cost:       ${run.summary.total_cost:.4f}")

    if run.summary.score_summaries:
        print("\nScorer Breakdown:")
        for name, score in run.summary.score_summaries.items():
            print(f"  {name}: {score.mean * 100:.1f}% (±{score.stddev * 100:.1f}%)")


if __name__ == "__main__":
    asyncio.run(main())
