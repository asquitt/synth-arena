# SynthArena Grand Plan

> **Pre-deployment simulation platform for AI agents**
> Last updated: February 14, 2026

---

## Table of Contents

1. [Strategic Thesis](#1-strategic-thesis)
2. [Market Landscape](#2-market-landscape)
3. [The Gap We Own](#3-the-gap-we-own)
4. [Product Vision](#4-product-vision)
5. [Architecture](#5-architecture)
6. [Core Modules](#6-core-modules)
7. [Technology Stack](#7-technology-stack)
8. [Moat Expansion](#8-moat-expansion)
9. [Go-to-Market](#9-go-to-market)
10. [Build Roadmap](#10-build-roadmap)
11. [Risk Analysis](#11-risk-analysis)
12. [Portfolio Synergies](#12-portfolio-synergies)

---

## 1. Strategic Thesis

### The Problem

**95% of generative AI pilots at companies are failing** (MIT, Aug 2025). **40%+ of agentic AI projects will be canceled by end of 2027** (Gartner). The root cause is identical: teams cannot systematically test agents before deployment.

The industry has solved observability (89% adoption) but NOT evaluation (52% adoption). Teams can see what their agents do, but they cannot judge whether the outcomes are good -- especially before production.

### The Insight

Every agent in our portfolio (Orbitr, GovTech Sniper, Reactivation Agent, Immigration Associate, Grid Pulse) needs realistic test environments. No tool exists that generates domain-specific synthetic scenarios AND evaluates agent performance AND estimates costs -- all before a single production API call.

The market has three separate tool categories that should be one:
1. **Synthetic data generation** (Gretel, Mostly AI, Tonic AI)
2. **Agent evaluation** (Braintrust, Galileo, DeepEval)
3. **Sandbox execution** (E2B, Daytona, agent-infra/sandbox)

SynthArena converges all three into a unified pre-deployment simulation platform.

### Why Now

- **Regulatory pressure**: EU AI Act enforcement August 2, 2026 (6 months away) with 7% global turnover penalties. Enterprises MUST demonstrate testing.
- **Consolidation signal**: Four acquisitions in 12 months (Gretel->NVIDIA, YData->KPMG, Humanloop->Anthropic, Langfuse->ClickHouse) prove the space is validated but fragmented.
- **Aaru's $1B valuation**: Series A at $1B for agent-based market research simulation proves investor appetite for simulation platforms.
- **Agent adoption inflection**: 57% of LangChain survey respondents have agents in production. Testing infrastructure demand is explosive.
- **Portfolio leverage**: We have 5+ domain agents that serve as both customers and proof points.

---

## 2. Market Landscape

### Market Size

| Segment | 2025 | 2030 Projection | CAGR |
|---------|------|-----------------|------|
| Synthetic Data | $500M-$2B | $2.67B-$8.79B | 30-46% |
| AI Agent Market | $7-8B | $50-93B | 44-46% |
| MLOps/LLMOps | $2.2B | $35.4B | 41.3% |
| AI Governance | $750M | $5.64B | 40% |

Enterprises pay **$500K-$5M annually** for domain-specific synthetic datasets. TAM for specialized synthetic data is estimated at **$60-90B through 2030** (Gartner projects 70% of AI training data will be synthetic by 2030).

### Competitive Map

#### Synthetic Data Players
| Company | Status | What They Do | What They Don't Do |
|---------|--------|-------------|-------------------|
| Gretel AI | Acquired by NVIDIA (Mar 2025) | Privacy-safe synthetic data generation | No agent evaluation, no simulation |
| Mostly AI | Active ($31M raised) | Tabular synthetic data | No agent testing, no scenario generation |
| Tonic AI | Active ($47M raised) | Database masking + test data | No LLM agent scenarios |
| Aaru | Active ($1B valuation) | Human behavior simulation for market research | Not agent testing infrastructure |

#### Evaluation Players
| Company | Status | What They Do | What They Don't Do |
|---------|--------|-------------|-------------------|
| Braintrust | Active ($45M, $150M val) | Eval loops, CI/CD integration | No synthetic scenario generation, no sandbox |
| Arize AI | Active ($131M raised) | Observability + Phoenix OSS | Post-hoc monitoring, not pre-deployment |
| Galileo | Active ($68M raised) | Hallucination detection, agent evals | No simulation environments |
| Patronus AI | Active ($40M raised) | Adversarial testing, benchmarks | No domain-specific synthetic data |
| DeepEval/Confident AI | Active (OSS-first) | 14+ eval metrics, CI/CD | Framework only, no platform |

#### Simulation Players
| Company | Status | What They Do | What They Don't Do |
|---------|--------|-------------|-------------------|
| E2B | Active | Cloud sandboxes for code execution | No evaluation, no synthetic data |
| Daytona | Active | Fast sandbox spin-up | Development environments, not agent testing |
| Maxim AI | Active | Simulation + evaluation + observability | Closest competitor -- but no domain-specific synthetic data generation |

### Key Insight from Competitive Analysis

**Maxim AI** is the closest competitor but lacks domain-specific synthetic data generation and portfolio integration. **No player** offers the full stack: generate realistic domain scenarios + simulate environments + evaluate performance + estimate costs + regression test -- all in one platform.

### Open Source Landscape

| Tool | Focus | Gap We Fill |
|------|-------|-------------|
| Promptfoo | Prompt testing, red-teaming | Config-driven, no simulation environments |
| DeepEval | Eval metrics library | No scenario generation, no sandboxing |
| RAGAS | RAG evaluation | RAG-specific, not general agent testing |
| Arize Phoenix | Observability, tracing | Post-hoc, not pre-deployment |
| OpenAI Evals | Eval framework | OpenAI-centric, no synthetic environments |
| Bloom (Anthropic) | Behavioral eval generation | Safety-focused, not domain simulation |

---

## 3. The Gap We Own

### The Convergence Gap

```
Current market:

[Synthetic Data Gen] ---- gap ---- [Agent Evaluation] ---- gap ---- [Sandbox Execution]
   (Gretel, Mostly AI)              (Braintrust, Galileo)           (E2B, Daytona)

SynthArena fills the center:

[Scenario Generation] --> [Simulated Environments] --> [Agent Evaluation] --> [Cost Modeling]
         ^                         ^                          ^                    ^
         |                         |                          |                    |
    Domain-specific           Sandboxed,                 Outcome-based        Pre-deployment
    realistic data         deterministically              with pass@k           token cost
                             reproducible                 and pass^k           estimation
```

### Why This Gap Exists

1. **Synthetic data companies** came from privacy/compliance (GDPR/CCPA) -- they generate data for training, not testing
2. **Eval companies** came from MLOps -- they measure after execution, not simulate before
3. **Sandbox companies** came from DevOps -- they provide isolation, not domain-specific scenarios

SynthArena is the first platform designed from the ground up for **pre-deployment agent simulation**.

---

## 4. Product Vision

### One-Liner

**"Test your AI agents against millions of realistic scenarios before they touch production."**

### Core Value Propositions

1. **Scenario Generation**: Create millions of domain-specific test scenarios using LLM-based distillation + statistical synthesis
2. **Simulated Environments**: Sandboxed fake websites, APIs, databases, and user interactions for agents to operate against
3. **Evaluation Benchmarks**: Standardized + custom tests to compare agent performance with pass@k and pass^k reliability metrics
4. **Adversarial Testing**: Automated generation of edge cases, failure modes, and attack scenarios (feeds RedTeam AI)
5. **Replay & Regression**: Re-run agents against identical scenarios after code changes, detect behavioral drift
6. **Cost Modeling**: Estimate token spend and API costs before running agents live

### User Personas

| Persona | Pain Point | SynthArena Value |
|---------|-----------|-----------------|
| **Agent Developer** | "I can't test my agent without burning real API credits and risking real data" | Sandboxed simulation with realistic synthetic data |
| **ML/AI Team Lead** | "We ship agent updates with no regression testing -- we just hope it works" | Automated replay and behavioral comparison |
| **VP Engineering** | "We can't prove our agents are reliable to leadership or compliance" | Evaluation reports with pass@k/pass^k reliability metrics |
| **Security Engineer** | "I need to find edge cases that break our agents before attackers do" | Adversarial scenario generation + integration with RedTeam AI |
| **Product Manager** | "A single agent run costs $5-50 -- we can't afford to test at scale" | Cost estimation before execution + model routing optimization |

### Product Modes

#### 1. Arena Mode (Competitive Evaluation)
Head-to-head comparison of agent implementations against identical scenarios. Bradley-Terry (Elo-like) ranking. Inspired by LMArena's proven format.

#### 2. Forge Mode (Scenario Generation)
Generate millions of domain-specific test scenarios. Configure domain (healthcare, government, e-commerce, web scraping), complexity distribution, edge case density, and adversarial injection rate.

#### 3. Sandbox Mode (Simulated Environments)
Spin up isolated environments with fake websites, APIs, databases, and user simulators. Agents operate freely within the sandbox. All actions are traced and evaluable.

#### 4. Regression Mode (Replay Testing)
Re-execute agent traces from previous runs against the same scenarios after code changes. Semantic diff of outcomes. Automated pass/fail with configurable thresholds.

#### 5. Audit Mode (Compliance Reporting)
Generate compliance-ready evaluation reports for EU AI Act, NIST AI RMF, ISO 42001. Includes test coverage metrics, failure mode analysis, and reliability statistics.

---

## 5. Architecture

### High-Level Architecture

```
                                    +------------------+
                                    |   SynthArena UI  |
                                    |   (Next.js/React)|
                                    +--------+---------+
                                             |
                                    +--------v---------+
                                    |    API Gateway    |
                                    |   (Hono/Express)  |
                                    +--------+---------+
                                             |
                    +------------------------+------------------------+
                    |                        |                        |
          +---------v--------+    +---------v--------+    +---------v--------+
          |  Scenario Engine |    | Simulation Engine |    | Evaluation Engine|
          |  (Generation)    |    | (Sandbox Mgmt)    |    | (Scoring/Grading)|
          +---------+--------+    +---------+--------+    +---------+--------+
                    |                        |                        |
                    v                        v                        v
          +------------------+    +------------------+    +------------------+
          | LLM Providers    |    | Sandbox Pool     |    | Trace Store      |
          | (Claude, GPT,    |    | (Firecracker/    |    | (ClickHouse)     |
          |  local models)   |    |  Docker)         |    |                  |
          +------------------+    +------------------+    +------------------+
                                             |
                                    +--------v---------+
                                    |    Event Bus     |
                                    | (Redis Streams)  |
                                    +------------------+
```

### Data Flow

```
1. SCENARIO GENERATION
   User defines domain config --> Scenario Engine generates test cases
   --> Synthetic data stored in S3 --> Quality validation (fidelity, diversity, privacy)

2. SIMULATION EXECUTION
   Scenario loaded --> Sandbox spun up (Firecracker/Docker)
   --> Agent deployed into sandbox --> Agent interacts with synthetic environment
   --> All actions traced via OpenTelemetry --> Traces stored in ClickHouse

3. EVALUATION
   Traces loaded --> Graders applied (code-based + LLM-as-judge)
   --> Scores computed (pass@k, pass^k, cost, latency, safety)
   --> Results stored in PostgreSQL --> Reports generated

4. REGRESSION
   Previous trace loaded --> Same scenario replayed with new agent version
   --> Semantic diff of outcomes --> Degradation detected --> Alert/report
```

### Isolation Model (Tiered Sandboxes)

| Tier | Technology | Startup Time | Use Case |
|------|-----------|-------------|----------|
| **Tier 1: MicroVM** | Firecracker | <125ms | Untrusted agent code, customer agents |
| **Tier 2: Container** | Docker + seccomp | <100ms | Platform evaluation workers |
| **Tier 3: OS Sandbox** | Bubblewrap/seatbelt | Instant | Trusted internal tools |

Pre-warmed pools reduce cold start by 90% (Google Kubernetes Agent Sandbox pattern).

### Event Architecture

Every agent action is recorded as an immutable event (event sourcing):
- LLM calls (prompt, response, token counts, latency, cost)
- Tool invocations (name, parameters, result, duration)
- Decision gates (branching logic, selected path)
- Environment interactions (API calls to synthetic services, DOM interactions)
- State transitions (environment state before/after)

This enables: replay, regression, debugging, cost attribution, and compliance auditing.

---

## 6. Core Modules

### Module 1: Scenario Engine

**Purpose**: Generate millions of domain-specific test scenarios.

**Generation Pipeline** (three-stage, based on academic research):
1. **Generate**: LLM-based distillation with task specification, conditional prompting, in-context learning
2. **Curate**: Heuristic filtering, sample re-weighting, label enhancement (curation > volume)
3. **Validate**: Fidelity (distribution match), utility (downstream performance), privacy (membership inference resistance)

**Domain Templates**:

| Domain | Scenario Types | Synthetic Data |
|--------|---------------|----------------|
| Web Scraping (Orbitr) | E-commerce sites, blogs, SERPs, social profiles | Mock websites with realistic HTML, pagination, auth, rate limiting |
| Government (GovTech) | RFP listings, SAM.gov contracts, NAICS codes | Fake solicitations with realistic deadlines, requirements, attachments |
| Healthcare (Reactivation) | Patient records, appointment histories, insurance data | HIPAA-safe synthetic patient profiles with realistic demographics |
| Legal (Immigration) | Visa petitions, case histories, RFE responses | Synthetic O-1/H-1B applications with varying qualification profiles |
| Energy (Grid Pulse) | Demand response signals, grid load data, pricing | Time-series synthetic utility data with realistic patterns |

**Quality Metrics**:
- Pairwise Correlation Difference (PCD) for distributional fidelity
- Jensen-Shannon divergence for categorical distributions
- Train-on-Synthetic, Test-on-Real (TSTR) for utility validation
- Membership inference attack resistance for privacy

**Evolution Types** (to increase difficulty and diversity):
- **In-depth**: Increase scenario complexity (multi-step, ambiguous, adversarial)
- **In-breadth**: Diversify across domains, edge cases, cultural contexts
- **Elimination**: Remove redundant or trivially solvable scenarios

### Module 2: Simulation Engine

**Purpose**: Spin up and manage sandboxed environments where agents operate against synthetic targets.

**Environment Types**:

| Type | Description | Implementation |
|------|-------------|---------------|
| **Mock Website** | Full HTML/CSS/JS website with realistic content, pagination, auth, CSRF | Caddy reverse proxy -> static site generator + dynamic API |
| **Mock API** | REST/GraphQL endpoints returning synthetic data with realistic latency/errors | Express/Hono mock server with configurable behavior |
| **Mock Database** | Pre-populated database with synthetic records | PostgreSQL/SQLite with generated data |
| **User Simulator** | LLM-powered simulated human (for conversational agents) | Claude/GPT with persona prompts + behavioral constraints |
| **Browser Environment** | Full Chrome instance for computer-use agents | Playwright-controlled headless Chrome in sandbox |

**Sandbox Lifecycle**:
```
create(config) --> provision(environment) --> deploy(agent) --> execute(scenario)
    --> collect(traces) --> evaluate(results) --> teardown(sandbox)
```

**Deterministic Replay**:
- All random seeds captured and reproducible
- Network responses recorded and replayable
- Time-sensitive operations use virtual clock
- Environment state snapshots at each step

### Module 3: Evaluation Engine

**Purpose**: Score agent performance using multi-layered grading.

**Grader Types** (based on Anthropic and OpenAI methodology):

| Grader Type | When to Use | Speed | Reliability |
|-------------|------------|-------|-------------|
| **Code-based** | Deterministic state checks (DB updated, file created, API called) | Fast | Highest |
| **LLM-as-judge** | Rubric-based quality assessment (tone, completeness, accuracy) | Slow | Moderate (calibration required) |
| **State-diff** | Compare end-state vs expected state + check for collateral damage | Fast | High |
| **Human** | Gold standard calibration, ambiguous cases | Slowest | Highest |
| **Arena (pairwise)** | Compare two agent implementations head-to-head | Moderate | High (Bradley-Terry) |

**Reliability Metrics**:
- **pass@k**: Probability of at least one success in k trials (capability measure)
- **pass^k**: Probability of all k trials succeeding (reliability measure)
- These diverge significantly -- both matter for production deployment

**Evaluation Dimensions**:

| Dimension | Metrics |
|-----------|---------|
| Task Completion | Success rate, goal completion, partial credit |
| Cost | Token consumption (input/output), API calls, total spend |
| Latency | Time-to-completion, time per step, tool call latency |
| Safety | Content policy violations, data leakage, injection resistance |
| Efficiency | Steps taken vs. optimal path, tool selection accuracy |
| Consistency | Variance across multiple runs of same scenario |

**Anti-Bias Measures** (for LLM-as-judge):
- Randomize output positions to counter position bias
- Multiple judge runs with score averaging
- Calibration against human-labeled gold standard
- Avoid using same model family as both agent and judge

### Module 4: Adversarial Engine

**Purpose**: Generate edge cases and attack scenarios for stress testing.

**Integration with RedTeam AI**:
- Adversarial scenarios generated here feed directly into RedTeam AI's 200+ attack pattern library
- RedTeam AI's attack categories inform scenario generation priorities

**Adversarial Categories**:
1. **Input perturbation**: Typos, encoding issues, Unicode edge cases, empty inputs
2. **Prompt injection**: Direct injection, indirect injection via synthetic content
3. **Tool misuse**: Agents calling tools with malicious parameters, excessive tool calls
4. **State confusion**: Contradictory information, temporal inconsistencies
5. **Resource exhaustion**: Scenarios designed to trigger infinite loops or excessive API calls
6. **Data exfiltration**: Synthetic content containing bait credentials/PII to test agent handling
7. **Multi-turn manipulation**: Gradually escalating requests across conversation turns

### Module 5: Replay & Regression Engine

**Purpose**: Re-run agents against identical scenarios after code changes.

**Workflow**:
```
1. Baseline run captured (golden trajectory)
2. Agent code updated
3. Same scenarios replayed with new agent version
4. Semantic diff of:
   - Task completion rate (pass@k / pass^k)
   - Cost per scenario
   - Latency distribution
   - Safety violations
   - Tool usage patterns
5. Degradation detected --> Alert with specific failing scenarios
6. Results stored for trend analysis
```

**Regression Types**:
- **Behavioral**: Did the agent's decisions change? (may be acceptable)
- **Outcome**: Did the agent's success rate change? (rarely acceptable to decrease)
- **Cost**: Did the agent become more expensive? (often a side effect of model updates)
- **Safety**: Did new safety violations appear? (never acceptable)

### Module 6: Cost Modeling Engine

**Purpose**: Estimate token spend before running agents live.

**Estimation Approaches**:
1. **Tokenizer pre-estimation**: Run prompts through provider tokenizers to count input tokens
2. **Historical modeling**: Track actual usage per agent type/task, project forward
3. **Trace analysis**: Analyze agent code structure to estimate LLM calls, tool chains, context sizes
4. **Simulation sampling**: Run 10-50 representative scenarios, extrapolate to full evaluation scale

**Cost Optimization Recommendations** (generated per evaluation):
- Model routing suggestions (use cheaper models for simple subtasks)
- Prompt caching opportunities (90% reduction on Anthropic, 50% on OpenAI)
- Context window optimization (RAG vs. full context)
- Batch API usage for non-real-time evaluations (50% discount on OpenAI)

**Cost Assertions** (as evaluation criteria):
```yaml
# Fail evaluation if any scenario exceeds cost threshold
assert:
  - type: cost
    threshold: 0.50  # $0.50 per scenario max
  - type: token_count
    max_input: 100000
    max_output: 10000
```

---

## 7. Technology Stack

### Core Platform

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| **API** | TypeScript + Hono | Fast, lightweight, edge-compatible |
| **Frontend** | Next.js 15 + React 19 + Tailwind | SSR for dashboard, RSC for data-heavy views |
| **Agent SDKs** | Python (primary) + TypeScript | Most agent code is Python; TS for Node agents |
| **Evaluation Engine** | TypeScript | Following promptfoo's proven 10.5k-star pattern |
| **Sandbox Orchestration** | Go | Systems-level performance for container management |
| **Event Bus** | Redis Streams | Low-latency event streaming, built-in persistence |

### Data Layer

| Use Case | Technology | Rationale |
|----------|-----------|-----------|
| **Config/metadata** | PostgreSQL | ACID, complex queries, relational data |
| **Trace storage** | ClickHouse | 16.8x faster than PG for full-text trace search at 10M+ records |
| **Synthetic data** | S3-compatible (MinIO/R2) | Blob storage for large datasets |
| **Caching/queues** | Redis | Fast reads, pub/sub, job queues |
| **Real-time analytics** | ClickHouse materialized views | Pre-aggregated dashboards |

### Sandbox Infrastructure

| Component | Technology |
|-----------|-----------|
| **MicroVM isolation** | Firecracker (AWS open source) |
| **Container isolation** | Docker + seccomp profiles |
| **Mock web servers** | Caddy + generated static sites |
| **Mock APIs** | Hono-based mock servers with configurable responses |
| **Browser instances** | Playwright-controlled headless Chrome |
| **Orchestration** | Kubernetes + custom CRDs for sandbox lifecycle |

### Evaluation Tooling

| Component | Technology |
|-----------|-----------|
| **Code graders** | TypeScript functions with standardized scorer interface |
| **LLM-as-judge** | Multi-provider (Claude, GPT) with bias calibration |
| **Trace format** | OpenTelemetry-compatible spans |
| **Report generation** | React-PDF for compliance reports |
| **Arena ranking** | Bradley-Terry model (Elo-like) |

---

## 8. Moat Expansion

### Moat Layer 1: Portfolio Data Flywheel

Every agent in our portfolio generates real-world traces that improve scenario generation:
- Orbitr's web scraping patterns inform mock website generation
- GovTech's RFP interactions improve government scenario realism
- Reactivation Agent's call logs enhance conversational scenario quality
- RedTeam AI's attack patterns feed adversarial scenario generation
- AI Trace's observability data calibrates cost models

**No competitor has access to this multi-domain operational data.**

### Moat Layer 2: Domain Template Library

Each domain template (healthcare, government, e-commerce, legal, energy) is a defensible asset:
- Templates encode domain expertise (HIPAA constraints, FAR regulations, utility grid patterns)
- Templates improve with usage (community contributions, customer feedback)
- New domains can be templated by customers (self-serve) or by us (professional services)

### Moat Layer 3: Evaluation Benchmark Network Effects

As more teams use SynthArena to evaluate agents:
- Benchmark datasets grow and improve
- Comparative data enables industry-wide benchmarking ("your agent is in the 90th percentile for healthcare accuracy")
- Arena mode creates public leaderboards that attract more participants
- Network effects compound -- more data = better scenarios = more accurate evaluation = more users

### Moat Layer 4: Compliance Certification

If SynthArena becomes the standard evaluation tool for EU AI Act compliance:
- Switching costs become enormous (auditors expect specific report formats)
- Certification badges (tested on SynthArena) become industry expectations
- Integration with RedTeam AI's existing compliance reports (OWASP, NIST, ISO 42001) creates a unified compliance story

### Moat Layer 5: Agent Hub Integration

Agent Hub's registry + SynthArena's evaluation = the "npm + CI/CD for agents":
- Every agent registered in Agent Hub gets automated SynthArena evaluation
- Trust scores in Agent Hub are backed by SynthArena test results
- Delegation contracts in Agent Hub reference SynthArena evaluation thresholds

---

## 9. Go-to-Market

### Phase 1: Internal Dogfooding (Months 1-2)

Use SynthArena to test our own portfolio agents:
- Orbitr: Test against 1,000+ mock websites with varying complexity
- GovTech: Test against synthetic SAM.gov listings
- Reactivation Agent: Test against synthetic patient scenarios

This produces real evaluation data we can showcase.

### Phase 2: Developer Tool Launch (Months 3-4)

**Target**: Individual agent developers and small teams

- Open-source core evaluation engine (following DeepEval/promptfoo pattern)
- Free tier: 100 scenarios/month, 10 evaluation runs
- Self-hosted option for privacy-sensitive users
- CLI-first experience: `synth-arena run --domain healthcare --scenarios 1000`

### Phase 3: Platform Launch (Months 5-7)

**Target**: AI/ML teams at mid-market companies

- Web UI with dashboard, scenario builder, evaluation explorer
- Team features: shared scenarios, collaborative evaluation, RBAC
- API for CI/CD integration (run evaluations on every PR)
- Domain template marketplace

### Phase 4: Enterprise (Months 8-12)

**Target**: Regulated industries (healthcare, finance, government)

- SOC 2 compliance
- EU AI Act evaluation reports
- On-premise deployment option
- SLA with guaranteed evaluation throughput
- Professional services for custom domain templates

### Pricing Model

| Tier | Price | Includes |
|------|-------|---------|
| **OSS/Free** | $0 | Core eval engine, 100 scenarios/mo, community support |
| **Pro** | $99/mo | 10K scenarios/mo, 5 domains, sandbox execution, replay |
| **Team** | $499/mo | 100K scenarios/mo, unlimited domains, Arena mode, RBAC |
| **Enterprise** | Custom | Unlimited, compliance reports, on-prem, SLA, custom domains |

### Distribution Channels

1. **Open source** -> GitHub stars -> developer adoption -> team upgrade
2. **Portfolio integration** -> Every agent we ship includes SynthArena eval
3. **Agent Hub marketplace** -> Agents listed must show SynthArena scores
4. **Content marketing** -> Publish evaluation methodology papers, benchmarks
5. **Conference presence** -> Demos at AI/ML conferences

---

## 10. Build Roadmap

### Phase 0: Foundation (Days 1-14)

**Deliverables**: Project scaffolding, core evaluation loop, CLI

| Task | Verification |
|------|-------------|
| Initialize monorepo (pnpm workspaces) | `pnpm build` succeeds |
| Core evaluation SDK (TypeScript) | Run eval on test agent, get scores |
| CLI tool (`synth-arena run`) | Generate + evaluate 10 scenarios from CLI |
| PostgreSQL schema for results | Schema migration runs cleanly |
| Basic code-based graders | 5 built-in graders produce correct scores |

### Phase 1: Scenario Generation (Days 15-30)

**Deliverables**: LLM-based scenario generation, domain templates, quality validation

| Task | Verification |
|------|-------------|
| LLM-based scenario generation pipeline | Generate 1,000 scenarios for web scraping domain |
| Domain template system (web, government, healthcare) | 3 templates produce realistic scenarios |
| Scenario quality validation (fidelity, diversity) | Quality metrics within acceptable ranges |
| Scenario evolution (in-depth, in-breadth, elimination) | Scenarios increase in complexity across iterations |
| S3 storage for generated datasets | Datasets persist and load correctly |

### Phase 2: Sandbox Execution (Days 31-50)

**Deliverables**: Sandboxed agent execution, mock environments, tracing

| Task | Verification |
|------|-------------|
| Docker-based sandbox with seccomp profiles | Agent runs in isolation, cannot access host |
| Mock website generator (static sites with realistic HTML) | Orbitr agent scrapes mock site successfully |
| Mock API server (configurable responses, latency, errors) | Agent handles various API responses correctly |
| OpenTelemetry tracing integration | Full trace captured for every agent run |
| ClickHouse trace storage | Traces queryable and searchable |
| User simulator (LLM-powered conversational partner) | Conversational agent completes multi-turn scenario |

### Phase 3: Evaluation & Arena (Days 51-65)

**Deliverables**: Multi-layered evaluation, Arena mode, cost modeling

| Task | Verification |
|------|-------------|
| LLM-as-judge graders with bias calibration | Scores correlate with human judgments |
| State-diff evaluation (expected vs actual state) | Correct detection of collateral damage |
| pass@k and pass^k reliability metrics | Metrics correctly computed across N trials |
| Arena mode (head-to-head with Bradley-Terry ranking) | Two agents compared, Elo rankings produced |
| Cost modeling engine (tokenizer pre-estimation) | Cost estimates within 20% of actual |
| Cost assertions in evaluation config | Evaluation fails when cost exceeds threshold |

### Phase 4: Regression & Adversarial (Days 66-80)

**Deliverables**: Replay testing, adversarial generation, RedTeam AI integration

| Task | Verification |
|------|-------------|
| Trace replay engine (deterministic re-execution) | Same scenario produces same environment behavior |
| Semantic diff (behavioral, outcome, cost, safety) | Regressions detected and reported |
| Adversarial scenario generation (7 categories) | Edge cases generated across all categories |
| RedTeam AI integration (attack pattern import) | 200+ attack patterns importable as scenarios |
| Regression CI/CD integration | GitHub Action runs regression on PR |

### Phase 5: Platform & Launch (Days 81-90)

**Deliverables**: Web UI, API, documentation, launch

| Task | Verification |
|------|-------------|
| Web dashboard (Next.js) | Scenario builder, evaluation explorer, Arena leaderboard |
| REST API with OpenAPI spec | All endpoints documented and testable |
| Python SDK (`pip install syntharena`) | `syntharena.evaluate(agent, scenarios)` works |
| TypeScript SDK (`npm install syntharena`) | Same functionality in TS |
| Documentation site | Getting started guide, API reference, domain template docs |
| Docker Compose for self-hosted deployment | `docker compose up` runs full platform |

---

## 11. Risk Analysis

### Technical Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Synthetic data quality insufficient for realistic testing | Medium | High | Multi-stage validation pipeline, human review for domain templates, TSTR benchmarking |
| LLM-as-judge bias produces unreliable evaluations | Medium | Medium | Calibration against human labels, position bias mitigation, ensemble judging |
| Sandbox escape by customer agents | Low | Critical | Firecracker microVMs with dedicated kernel, network proxy isolation, no host filesystem access |
| Model collapse in recursive synthetic generation | Low | Medium | Always mix synthetic with seed data, entropy-based selection, diversity metrics |
| Cost of running evaluations exceeds value | Medium | High | Aggressive prompt caching (90% savings), model routing, batch APIs |

### Market Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Major cloud provider launches competing service | High | High | Move fast, build domain expertise moat, open-source core for adoption |
| Anthropic/OpenAI build evaluation into their platforms | High | Medium | Platform-agnostic (support all providers), focus on simulation not just eval |
| Consolidation eliminates independent market | Medium | Medium | Position for acquisition OR as infrastructure layer under larger platforms |
| Enterprises build in-house instead of buying | Medium | Medium | Open-source core reduces build-vs-buy friction, monetize on platform features |

### Execution Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| 90-day timeline too aggressive for full platform | High | Medium | Prioritize CLI + evaluation engine + 1 domain; web UI can follow |
| Portfolio agents not ready to be test customers | Medium | Medium | Start with Orbitr (most mature); others follow as they ship |
| Domain template creation takes longer than expected | Medium | Medium | Start with web scraping (we know it best from Orbitr) |

---

## 12. Portfolio Synergies

### SynthArena as Force Multiplier

```
                        +------------------+
                        |   SynthArena     |
                        | (Test Everything)|
                        +--------+---------+
                                 |
          +----------+-----------+----------+-----------+
          |          |           |          |           |
     +----v---+ +---v----+ +---v----+ +---v----+ +---v----+
     | Orbitr | |GovTech | |React.  | |Immig.  | | Grid   |
     | Agent  | |Sniper  | |Agent   | |Assoc.  | | Pulse  |
     +--------+ +--------+ +--------+ +--------+ +--------+
          |                     |
     +----v---+            +---v----+
     |RedTeam |            |  AI    |
     |  AI    |            | Trace  |
     +--------+            +--------+
```

| Portfolio Product | SynthArena Integration |
|-------------------|----------------------|
| **Orbitr** | Mock websites for testing scraping agents; regression testing for SEO changes |
| **GovTech Sniper** | Synthetic SAM.gov listings for RFP automation testing |
| **Reactivation Agent** | Synthetic patient scenarios for outbound call testing |
| **Immigration Associate** | Synthetic visa applications for petition automation testing |
| **Grid Pulse** | Synthetic demand response signals for optimization testing |
| **RedTeam AI** | Adversarial scenarios generated by SynthArena; attack patterns imported from RedTeam |
| **AI Trace** | Observability data from SynthArena runs; cost model calibration from production traces |
| **Agent Hub** | Trust scores backed by SynthArena evaluations; automated testing for registered agents |
| **AgentGuard** | Sandbox execution runtime shared; security policy testing |
| **AgentSettle** | Simulated agent-to-agent transactions for settlement protocol testing |
| **QueryShield** | Synthetic SQL injection attempts for middleware testing |

### Bidirectional Data Flow

1. **Production -> Simulation**: AI Trace captures real agent failures -> SynthArena generates scenarios reproducing those failures -> Regression tests prevent recurrence
2. **Simulation -> Security**: SynthArena discovers edge cases -> RedTeam AI catalogs as attack patterns -> AgentGuard implements runtime protections
3. **Evaluation -> Registry**: SynthArena scores agents -> Agent Hub displays trust levels -> Delegation decisions reference scores

---

## Appendix A: Key Research Sources

### Academic Papers
- "On LLMs-Driven Synthetic Data Generation, Curation, and Evaluation: A Survey" (arXiv 2406.15126)
- "Simulating Environments with Reasoning Models" (arXiv 2511.01824) -- LLMs as environment simulators
- "Model Collapse: Is It Inevitable?" (arXiv 2404.01413)
- "LLM-as-a-Judge Survey" (arXiv 2411.15594) -- 12 bias types identified

### Industry Reports
- MIT: 95% of AI pilots failing (Aug 2025)
- Gartner: 40%+ agentic projects canceled by 2027
- Gartner: 70% of AI training data synthetic by 2030
- LangChain State of Agent Engineering: 89% observability, 52% evaluation adoption
- Cisco: 26.1% of agent skills contain vulnerabilities

### Platform References
- Anthropic Bloom: Behavioral evaluation generation framework
- Anthropic Sandbox Runtime: OS-level agent isolation
- OpenAI Evals: Agent evaluation framework with trace grading
- Meta ARE/GAIA2: Scalable agent evaluation environments
- Apple ToolSandbox: Stateful conversational tool-use evaluation
- Braintrust: Evaluation SDK architecture + Brainstore database
- Promptfoo: Declarative evaluation configuration

### Market Data
- Synthetic data market: $500M-$2B (2025) -> $8.79B (2030)
- AI agent market: $7-8B (2025) -> $50-93B (2030)
- Key acquisitions: Gretel->NVIDIA, YData->KPMG, Humanloop->Anthropic, Langfuse->ClickHouse
- Aaru: $1B valuation at Series A for simulation platform
