"""
API client example — run evaluations via the SynthArena API server.

Usage:
    # Start the API server first:
    #   cd synth-arena && pnpm dev
    #
    # Then run:
    python examples/api_client.py
"""

import asyncio

from syntharena import SynthArenaClient


async def main():
    async with SynthArenaClient(
        api_url="http://localhost:3001",
        # api_key="sa_your_api_key",  # Required in production
    ) as client:
        # Check health
        health = await client.health()
        print(f"API Status: {health['status']}")

        # Run evaluation via API
        print("\nStarting evaluation...")
        run = await client.create_evaluation(
            name="api-test-eval",
            domain="web-scraping",
            scenario_count=5,
            trials=3,
        )

        print(f"Run ID:   {run['id']}")
        print(f"Status:   {run['status']}")
        summary = run.get("summary", {})
        print(f"pass@k:   {summary.get('passAtK', 0) * 100:.1f}%")
        print(f"Cost:     ${summary.get('totalCost', 0):.4f}")

        # Stream evaluation with real-time progress
        print("\nStarting streamed evaluation...")
        async for event in client.stream_evaluation(
            name="streamed-eval",
            domain="government",
            scenario_count=10,
            trials=2,
        ):
            event_type = event.get("type", "unknown")
            if event_type == "scenario_complete":
                idx = event.get("scenarioIndex", 0)
                total = event.get("totalScenarios", 0)
                print(f"  Progress: {idx}/{total}")
            elif event_type == "run_complete":
                print(f"  Complete! Run ID: {event.get('runId')}")

        # Compare two runs
        runs = await client.list_evaluations()
        if len(runs) >= 2:
            report = await client.compare_runs(runs[0]["id"], runs[1]["id"])
            print(f"\nRegression check: {'PASS' if not report.get('hasRegressions') else 'FAIL'}")

        # Estimate costs before a big run
        estimate = await client.estimate_cost(
            model="claude-sonnet-4-20250514",
            scenario_count=1000,
            trials_per_scenario=3,
        )
        print(f"\nCost estimate for 1000 scenarios: ${estimate['estimate']['totalCost']:.2f}")


if __name__ == "__main__":
    asyncio.run(main())
