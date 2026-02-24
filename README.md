# SynthArena

Pre-deployment simulation platform for AI agents. Generate realistic test scenarios, run agents in sandboxed environments, evaluate performance with statistical rigor, and catch regressions before production.

## Why SynthArena

Teams ship AI agents without systematic testing because no tooling exists for it. Unit tests don't capture real-world complexity. Manual QA doesn't scale. Production monitoring catches problems too late.

SynthArena fills the gap:

- **Scenario Generation** — LLM-based distillation creates thousands of domain-specific test cases
- **Sandboxed Execution** — Mock websites, APIs, databases, and conversational partners
- **Statistical Evaluation** — pass@k (capability) and pass^k (reliability) metrics with LLM-as-judge grading
- **Adversarial Testing** — Automated edge case and attack scenario generation
- **Replay & Regression** — Re-run agents against identical scenarios after code changes
- **Cost Modeling** — Estimate token spend before production deployment

## Quick Start

### Prerequisites

- Node.js 18+, Python 3.9+, Docker, pnpm 9.15+

### Install & Run

```bash
git clone https://github.com/asquitt/synth-arena.git
cd synth-arena
cp .env.example .env    # Set ANTHROPIC_API_KEY, DATABASE_URL, etc.
pnpm install
docker compose up -d    # Postgres, Redis, ClickHouse, MinIO
pnpm dev                # API (3001), Web (3000), Worker
```

### Run Your First Evaluation

```bash
# CLI: evaluate 100 web-scraping scenarios
pnpm cli run --domain web-scraping --scenarios 100

# Compare two agents head-to-head
pnpm cli arena --agents agent-a,agent-b --scenarios 50

# Replay a previous run for regression testing
pnpm cli replay --trace-id <id>
```

### SDK Usage

**Python:**
```python
from syntharena import SynthArenaClient

client = SynthArenaClient(base_url="http://localhost:3001", api_key="...")
run = client.evaluate(
    domain="web-scraping",
    agent=my_agent_fn,
    scenarios=100,
    scorers=["task_completion", "cost_threshold"],
    trials=3,
)
print(f"pass@3: {run.pass_at_k}, pass^3: {run.pass_hat_k}")
```

**TypeScript:**
```typescript
import { evaluate, TaskCompletion, CostThreshold } from '@syntharena/sdk';

const results = await evaluate({
  name: 'my-eval',
  dataset: scenarios,
  task: async (input) => await myAgent.run(input),
  scorers: [TaskCompletion, CostThreshold(0.50)],
  trials: 3,
});
```

## Architecture

```
Client / CLI / SDK
       │
       ▼
  Hono REST API ──► Redis Streams (job queue)
       │                    │
       ▼                    ▼
  PostgreSQL         Background Worker
  (config, results)  (evaluation execution)
       │                    │
       ▼                    ▼
  ClickHouse         Docker Sandbox
  (traces, analytics) (mock environments)
       │
       ▼
  MinIO / S3
  (synthetic datasets)
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| API | TypeScript, Hono, Zod |
| Dashboard | Next.js 15, React 19, Tailwind CSS |
| Evaluation Engine | TypeScript (core scoring, grading, arena) |
| SDKs | Python (`syntharena`) + TypeScript (`@syntharena/sdk`) |
| Event Bus | Redis Streams |
| Config DB | PostgreSQL |
| Trace Storage | ClickHouse (16.8x faster than PG for trace search at scale) |
| Blob Storage | MinIO / S3-compatible |
| Sandbox | Docker + seccomp (dev), Firecracker microVMs (production) |
| Build | pnpm workspaces + Turbo |

### Project Structure

```
synth-arena/
├── apps/
│   ├── api/                # Hono REST API (9 route groups, middleware, worker)
│   ├── web/                # Next.js 15 dashboard (arena, evaluations, scenarios, traces, cost)
│   └── cli/                # CLI tool (11 commands: run, arena, replay, generate, evaluate, etc.)
│
├── packages/
│   ├── core/               # Evaluation engine (scorers, graders, arena, compliance, red-team)
│   ├── scenarios/          # Scenario generation pipeline (3-stage: generate → curate → validate)
│   ├── sandbox/            # Mock environments (websites, APIs, databases, user simulator)
│   ├── replay/             # Regression testing + adversarial scenario generation
│   ├── cost/               # Cost modeling, optimization, threshold assertions
│   ├── sdk-ts/             # TypeScript SDK
│   ├── sdk-python/         # Python SDK (pip install syntharena)
│   └── shared/             # Shared types and utilities
│
├── domains/                # Domain-specific templates (5 domains, 1,050 pre-generated scenarios)
│   ├── web-scraping/       # E-commerce, blog scraping
│   ├── government/         # SAM.gov, RFP solicitations
│   ├── healthcare/         # Patient records, HIPAA-safe
│   ├── legal/              # Visa petitions, case scenarios
│   └── energy/             # Grid demand, utility data
│
└── docker/                 # Docker Compose (API, web, worker, Postgres, Redis, ClickHouse, MinIO)
```

## Key Features

### Scenario Generation

LLM-based 3-stage pipeline: generate → curate → validate. Built-in quality metrics for fidelity, diversity, and privacy. Scenario evolution strategies (in-depth, in-breadth, elimination) for expanding coverage.

**1,050 pre-generated scenarios** across 5 domains with configurable complexity levels.

### Evaluation & Scoring

- **Code-based graders** — Deterministic checks (string match, regex, JSON schema)
- **LLM-as-judge** — Semantic evaluation with bias calibration
- **State-diff grading** — Compare expected vs. actual environment state changes
- **Conversation scoring** — Multi-turn interaction quality metrics
- **pass@k** — Capability metric (succeeds at least once in k trials)
- **pass^k** — Reliability metric (succeeds every time in k trials)

### Arena Mode

Head-to-head agent comparison using Bradley-Terry ranking. Compare agents across identical scenarios with statistical significance testing.

### Sandbox Environments

| Environment | Description |
|-------------|-------------|
| Mock Websites | Realistic HTML with auth, pagination, dynamic content |
| Mock APIs | REST/GraphQL with configurable responses, latency, errors |
| Mock Databases | Pre-populated with synthetic domain data |
| User Simulator | LLM-powered conversational partner for chat agents |

### Adversarial Testing

7 categories: input perturbation, prompt injection, tool misuse, state confusion, resource exhaustion, data exfiltration, multi-turn manipulation. Includes OWASP and NIST red-team presets.

### Cost Modeling

Token pre-estimation, historical cost modeling, optimization recommendations, and threshold assertions. Supports Claude, GPT, and Gemini pricing models with prompt caching optimization.

### Regression Testing

Deterministic trace replay with semantic diff detection across 4 dimensions: behavioral changes, outcome changes, cost changes, and safety changes. GitHub Action available for CI integration.

### Compliance Reporting

Generate reports mapped to EU AI Act, NIST AI RMF, and ISO 42001 frameworks.

## CLI Reference

| Command | Description |
|---------|-------------|
| `pnpm cli run` | Generate and evaluate scenarios |
| `pnpm cli arena` | Head-to-head agent comparison |
| `pnpm cli replay` | Replay a previous trace |
| `pnpm cli generate-scenarios` | Generate scenarios only |
| `pnpm cli evaluate-traces` | Score existing traces |
| `pnpm cli cost-estimate` | Estimate token costs |
| `pnpm cli audit-compliance` | Generate compliance report |
| `pnpm cli list-domains` | Show available domains |

## Testing

```bash
pnpm test              # All 686 tests across packages
pnpm typecheck         # TypeScript strict mode
pnpm build             # Full build

# Python SDK
cd packages/sdk-python && pytest tests/   # 65 tests
```

| Package | Tests |
|---------|:-----:|
| core | 100+ |
| scenarios | 54 |
| sandbox | 79 |
| cost | 21 |
| replay | 33 |
| sdk-ts | 23 |
| sdk-python | 65 |
| cli | 51 |
| api | 18+ |
| **Total** | **686** |

## Deployment

### Docker Compose

```bash
docker compose up -d   # Full stack: API, web, worker, Postgres, Redis, ClickHouse, MinIO
```

### Services

| Service | Port |
|---------|------|
| API | 3001 |
| Dashboard | 3000 |
| PostgreSQL | 5432 |
| Redis | 6379 |
| ClickHouse | 8123 |
| MinIO | 9000 |

## Performance Targets

- Scenario generation: 1,000 scenarios in <60s
- Sandbox spin-up: <500ms (Docker), <200ms (Firecracker)
- Evaluation throughput: 100 scenarios/minute per worker
- Trace query: <1s for any trace up to 100M records (ClickHouse)

## License

Proprietary. All rights reserved.
