# SynthArena - Project Instructions

## Project Overview

SynthArena is a pre-deployment simulation platform for AI agents. It generates realistic domain-specific test scenarios, runs agents in sandboxed environments, evaluates performance with multi-layered grading, and estimates costs -- all before production.

**Reference**: See `GRAND_PLAN.md` for full strategic context, competitive analysis, and roadmap.

## Tech Stack

- **Monorepo**: pnpm workspaces
- **API**: TypeScript + Hono (edge-compatible, lightweight)
- **Frontend**: Next.js 15 + React 19 + Tailwind CSS
- **Evaluation Engine**: TypeScript (core scoring, grading, trace analysis)
- **Agent SDKs**: Python (`syntharena`) + TypeScript (`@syntharena/sdk`)
- **Sandbox Orchestration**: Go (container/microVM lifecycle management)
- **Event Bus**: Redis Streams
- **Databases**: PostgreSQL (config/metadata), ClickHouse (traces/analytics), S3/MinIO (synthetic datasets)
- **Sandbox**: Docker + seccomp (dev), Firecracker microVMs (production)
- **Tracing**: OpenTelemetry-compatible spans

## Project Structure

```
synth-arena/
├── apps/
│   ├── api/              # Hono API server
│   ├── web/              # Next.js dashboard
│   └── cli/              # CLI tool (synth-arena run)
├── packages/
│   ├── core/             # Evaluation engine, graders, scoring
│   ├── scenarios/        # Scenario generation pipeline
│   ├── sandbox/          # Sandbox lifecycle management
│   ├── replay/           # Trace replay and regression engine
│   ├── cost/             # Cost modeling and estimation
│   ├── sdk-python/       # Python SDK
│   ├── sdk-ts/           # TypeScript SDK
│   └── shared/           # Shared types, utils, constants
├── domains/              # Domain template definitions
│   ├── web-scraping/     # Mock websites, e-commerce scenarios
│   ├── government/       # SAM.gov, RFP scenarios
│   ├── healthcare/       # Patient records, HIPAA-safe data
│   ├── legal/            # Visa petitions, case scenarios
│   └── energy/           # Grid demand, utility data
├── docker/               # Dockerfiles, compose configs
├── docs/                 # Documentation site content
└── tests/                # Integration and E2E tests
```

## Key Commands

```bash
# Development
pnpm install              # Install all dependencies
pnpm dev                  # Start all services in dev mode
pnpm build                # Build all packages
pnpm typecheck            # TypeScript type checking (npx tsc --noEmit)

# CLI
pnpm cli run --domain web-scraping --scenarios 100    # Generate and evaluate
pnpm cli arena --agents agent-a,agent-b --scenarios 50  # Head-to-head comparison
pnpm cli replay --trace-id <id>                        # Replay a previous run

# Testing (targeted only -- never run full suites)
pnpm test:core            # Core evaluation engine tests
pnpm test:scenarios       # Scenario generation tests

# Database
pnpm db:migrate           # Run PostgreSQL migrations
pnpm db:seed              # Seed with sample data

# Docker
docker compose up -d      # Start all services
docker compose ps         # Check service health
```

## Architecture Principles

1. **Event-sourced traces**: Every agent action is an immutable event. This enables replay, regression, debugging, and compliance auditing.
2. **Tiered sandboxing**: Docker + seccomp for dev/test, Firecracker microVMs for untrusted agent code.
3. **Outcome-based evaluation**: Grade on what happened (state changes), not how (step sequences). Agents find valid alternative paths.
4. **Two reliability metrics**: Always compute both `pass@k` (capability) and `pass^k` (reliability).
5. **Curation > Volume**: For synthetic data, a smaller curated dataset outperforms a larger unfiltered one.
6. **Platform-agnostic**: Support all LLM providers (Claude, GPT, Gemini, local models). Never lock in.

## Evaluation SDK Interface

The core evaluation interface follows the Braintrust/promptfoo pattern:

```typescript
// Core scorer interface
type Scorer = (ctx: {
  input: unknown;
  output: unknown;
  expected?: unknown;
  metadata?: Record<string, unknown>;
}) => Promise<{ name: string; score: number; metadata?: Record<string, unknown> }>;

// Evaluation run
const results = await evaluate({
  dataset: scenarios,
  task: async (input) => await myAgent.run(input),
  scorers: [TaskCompletion, CostThreshold(0.50), SafetyCheck],
});
```

```python
# Python SDK
from syntharena import evaluate, scorers

results = await evaluate(
    dataset=scenarios,
    task=my_agent.run,
    scorers=[scorers.task_completion, scorers.cost_threshold(0.50)],
)
```

## Domain Template Structure

Each domain template defines:

```typescript
interface DomainTemplate {
  name: string;                    // e.g., "web-scraping"
  description: string;
  scenarioGenerators: Generator[]; // LLM prompts for generating scenarios
  environmentConfig: EnvConfig;    // Mock services to spin up
  graders: Scorer[];               // Domain-specific evaluation criteria
  seedData: SeedDataConfig;        // Base data for generation
  constraints: Constraint[];       // Domain rules (HIPAA, FAR, etc.)
}
```

## Code Conventions

- **TypeScript**: Strict mode, no `any`, interfaces for all data shapes
- **Python SDK**: Type hints on all functions, dataclasses for data containers
- **Go (sandbox)**: Standard Go project layout, context-aware functions
- **Naming**: camelCase (TS variables), PascalCase (types/classes), snake_case (Python), SCREAMING_SNAKE (constants)
- **Errors**: Specific error types, never swallow errors, always include context
- **Tests**: Colocated with source (`foo.test.ts` next to `foo.ts`)

## Database Schema Conventions

- All tables have `id` (UUID), `created_at`, `updated_at`
- Index all foreign keys and frequently filtered columns
- Use composite indexes for common query patterns
- ClickHouse tables use `MergeTree` engine with `ORDER BY` on query patterns

## API Design

- RESTful with OpenAPI spec
- All endpoints return `{ data, error, metadata }` envelope
- Pagination via cursor-based tokens (not offset)
- Rate limiting per API key
- Versioned: `/api/v1/...`

## Security Rules

- Never store real customer data in synthetic datasets
- Sandbox environments must have no host filesystem access
- Network isolation: whitelist-only for sandboxed agents
- All synthetic PII must be flagged as synthetic in metadata
- Evaluation traces containing customer agent code are encrypted at rest

## Integration Points

| System | Integration |
|--------|------------|
| **RedTeam AI** | Import 200+ attack patterns as adversarial scenarios |
| **AI Trace** | Import production traces for failure reproduction |
| **Agent Hub** | Export evaluation scores as trust metrics |
| **AgentGuard** | Share sandbox runtime, import security policies |
| **CI/CD** | GitHub Action for regression testing on PRs |

## Performance Targets

- Scenario generation: 1,000 scenarios in <60 seconds
- Sandbox spin-up: <500ms (Docker), <200ms (Firecracker with pre-warming)
- Evaluation throughput: 100 scenarios/minute per worker
- Trace query: <1s for any trace in ClickHouse (up to 100M traces)
- API response: p99 <200ms for non-evaluation endpoints

## When Implementing Features

1. **Check GRAND_PLAN.md** for the module spec and roadmap phase
2. **Start with types** -- define interfaces/types before implementation
3. **Write the scorer first** -- evaluation criteria before the feature
4. **Test with real agent code** -- use Orbitr or another portfolio agent as the test customer
5. **Trace everything** -- emit OpenTelemetry spans for all operations
6. **Estimate cost impact** -- any new LLM call should include cost tracking
