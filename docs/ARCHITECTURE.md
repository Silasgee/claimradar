# AssetRadar — Technical Blueprint & Architecture Document

> **Status:** Draft v1.0 — Architecture baseline for the next 6 months
> **Audience:** Engineering, Product, Security, DevOps
> **Author:** Principal Architect
> **Scope:** MVP through multi-chain scale. No implementation code — this is the map the team builds from.

---

## Table of Contents

1. [Product Requirements Document (PRD)](#1-product-requirements-document-prd)
2. [Functional Requirements](#2-functional-requirements)
3. [Non-Functional Requirements](#3-non-functional-requirements)
4. [System Architecture](#4-system-architecture)
5. [High-Level Architecture Diagram](#5-high-level-architecture-diagram)
6. [Recommended Tech Stack](#6-recommended-tech-stack)
7. [Database Schema](#7-database-schema)
8. [API Design](#8-api-design)
9. [Connector / Plugin Architecture](#9-connector--plugin-architecture)
10. [Folder Structure](#10-folder-structure)
11. [Background Job Architecture](#11-background-job-architecture)
12. [Authentication Strategy](#12-authentication-strategy)
13. [Caching Strategy](#13-caching-strategy)
14. [Rate Limiting Strategy](#14-rate-limiting-strategy)
15. [Error Handling Strategy](#15-error-handling-strategy)
16. [Logging & Monitoring Plan](#16-logging--monitoring-plan)
17. [Security Considerations](#17-security-considerations)
18. [Deployment Architecture](#18-deployment-architecture)
19. [CI/CD Strategy](#19-cicd-strategy)
20. [Testing Strategy](#20-testing-strategy)
21. [Development Roadmap & Milestones](#21-development-roadmap--milestones)
22. [Risks, Assumptions & Dependencies](#22-risks-assumptions--dependencies)

---

## 1. Product Requirements Document (PRD)

### 1.1 Problem Statement

Billions of dollars in Web3 assets go unclaimed every year: airdrops expire, staking
rewards accrue silently, vesting cliffs pass unnoticed, and refunds from failed token
sales are never withdrawn. The information exists **on-chain and in protocol APIs**, but
it is fragmented across dozens of chains and hundreds of protocols, each with its own
claim mechanism. No wallet or aggregator gives a user a single, trustworthy answer to the
question: **"What can this address claim right now?"**

### 1.2 Product Vision

AssetRadar is a read-only discovery platform. A user pastes **any public wallet address**
and receives a consolidated, ranked list of claimable assets across every supported chain
and protocol, with enough context (amount, USD value, expiry, claim link, risk flags) to
act — but AssetRadar **never** holds keys, signs transactions, or executes claims in the
MVP. Trust is the product; being non-custodial and read-only is a feature, not a limitation.

### 1.3 Goals

| #   | Goal                                          | Success Metric                                                                            |
| --- | --------------------------------------------- | ----------------------------------------------------------------------------------------- |
| G1  | Give any address a complete claimables report | ≥ 90% coverage of a curated "top 50 protocols" benchmark set                              |
| G2  | Be trustworthy                                | Zero custody, zero signing, no false "you have $X" claims beyond a stated confidence band |
| G3  | Be fast                                       | P95 cached scan < 2s; first fresh scan < 30s                                              |
| G4  | Be extensible                                 | A new protocol connector ships in < 1 engineer-day once the SDK is stable                 |
| G5  | Be economically viable                        | Cost per fresh scan < $0.05 at 10k scans/day                                              |

### 1.4 Non-Goals (MVP)

- **No transaction execution / claiming.** Read-only. (Revisit post-PMF; see roadmap.)
- **No custody of funds or private keys — ever.**
- **No portfolio tracking / P&L.** We surface _claimable_ assets, not holdings.
- **No tax reporting.**
- **No mobile native apps** (responsive web first).

### 1.5 Target Users & Personas

- **The Forgetful DeFi User** — active across many protocols, loses track of small claims.
- **The Airdrop Hunter** — farms airdrops, wants to know eligibility/claim windows early.
- **The Returning User** — was active in 2021–2022, wants to know if anything is waiting.
- **The Analyst / Fund** — checks many addresses (drives our future API/bulk product).

### 1.6 Key User Stories

- _As a visitor_, I paste an address and see all claimable assets ranked by USD value, so I know what's worth acting on.
- _As a user_, I see **why** an item is claimable and a **direct, verified link** to the official claim page, so I can act safely.
- _As a user_, I see an **expiry countdown** on time-limited claims, so I don't miss deadlines.
- _As a returning user_, I save/watch an address and get **notified** when new claimables appear.
- _As a cautious user_, I see **risk flags** (unverified contract, possible phishing lookalike) so I don't get scammed.

### 1.7 Trust & Safety Product Principles

1. **Read-only by default.** No wallet connection required to scan.
2. **Never fabricate value.** Every item carries a `confidence` and a `source`. Estimated values are labeled as estimates.
3. **Anti-phishing is core UX.** We only ever link to allow-listed official claim URLs, and we warn users that AssetRadar will never ask them to connect a wallet to "verify" or "unlock" a claim.
4. **Explainability.** Every claimable shows the connector, contract, and method that produced it.

---

## 2. Functional Requirements

### 2.1 Core

- **FR-1 Address input & validation.** Accept EVM (`0x…`, checksummed) and Solana (base58) addresses; validate format and reject obviously invalid input. Support ENS/other name resolution (resolve to address before scanning).
- **FR-2 Multi-chain scan.** On scan, fan out to all connectors relevant to the address's supported chains and aggregate results.
- **FR-3 Claimable categorization.** Classify each result into: `airdrop`, `staking_reward`, `vesting`, `presale_allocation`, `governance_reward`, `nft_claim`, `refund`, `other`.
- **FR-4 Result enrichment.** For each claimable: token symbol/name, raw amount, decimals, USD value (via price oracle), expiry/claim window, official claim URL, source connector, confidence score, risk flags.
- **FR-5 Ranking & filtering.** Rank by USD value by default; allow sort/filter by chain, category, expiry, value.
- **FR-6 Result caching & freshness.** Show cached results instantly with a "last scanned" timestamp and a "rescan" action.
- **FR-7 Scan lifecycle.** A scan is an async job with states: `queued → running → partial → complete | failed`. UI streams partial results as connectors return.

### 2.2 Accounts & Persistence (post-MVP-core)

- **FR-8 Optional accounts.** Users can sign up (email or SIWE) to save addresses and history.
- **FR-9 Watchlists.** Save addresses; scheduled rescans.
- **FR-10 Notifications.** Email/web-push when a new claimable appears or an expiry nears.

### 2.3 Connector Management (internal)

- **FR-11 Connector registry.** A registry lists all connectors, supported chains, categories, health, and enable/disable flags.
- **FR-12 Connector health.** Each connector self-reports last success, error rate, latency; unhealthy connectors are auto-degraded (see §15).
- **FR-13 Feature flags.** Connectors and chains can be toggled per environment without deploy.

### 2.4 Admin / Ops

- **FR-14 Allow-list management.** Admins manage the official-claim-URL allow-list and risk flags.
- **FR-15 Manual re-index.** Admins can force cache invalidation for a connector or address.
- **FR-16 Observability dashboards.** Per-connector coverage, error, latency, and cost metrics.

---

## 3. Non-Functional Requirements

| Category            | Requirement                                                                                                          | Rationale                                                 |
| ------------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| **Performance**     | P95 cached read < 2s; fresh scan P95 < 30s; connector fan-out with per-connector timeout ≤ 8s                        | Perceived speed; unbounded fan-out kills UX               |
| **Scalability**     | Handle 10k daily scans at MVP, design headroom to 1M/day; horizontally scalable stateless API + worker pool          | "Thousands of users" mandate; avoid re-architecture       |
| **Availability**    | 99.5% API availability MVP → 99.9% post-scale; graceful degradation (partial results) when a connector/chain is down | External RPCs/indexers fail constantly                    |
| **Consistency**     | Eventual consistency acceptable for claimables; cached data must carry explicit freshness timestamps                 | On-chain truth changes slowly for most claimables         |
| **Maintainability** | New connector < 1 dev-day; connectors isolated, independently testable                                               | Core scaling lever of the whole product                   |
| **Security**        | Non-custodial; no PII beyond email; secrets in a vault; least-privilege everywhere                                   | Regulatory + trust surface                                |
| **Cost**            | < $0.05 per fresh scan; caching + batching to control RPC/indexer spend                                              | RPC/indexer cost is the dominant variable cost            |
| **Observability**   | Structured logs, traces across fan-out, per-connector metrics                                                        | Debugging a 200-connector fan-out is impossible otherwise |
| **Portability**     | Cloud-agnostic core (containers + Postgres + Redis); avoid deep proprietary lock-in                                  | Negotiating leverage; DR                                  |
| **Accessibility**   | WCAG 2.1 AA on the web app                                                                                           | Broad reach, legal hygiene                                |

---

## 4. System Architecture

### 4.1 Architectural Style

**Modular monolith backend + isolated connector plugins + async worker tier.**

We deliberately **do not** start with microservices. The decisive complexity in AssetRadar
is not service decomposition — it's the **connector fan-out** and **data aggregation**. A
modular monolith (clear module boundaries, one deployable) gives us:

- Fast iteration and simple local dev.
- One transactional database, no distributed-transaction pain early.
- A clean seam (the **Connector SDK**) that is the _real_ extension point.

The async work (scanning) is offloaded to a **worker tier** consuming from a queue, so the
API stays responsive and scans scale independently. When a module (e.g., the connector
runtime, or notifications) proves it needs independent scaling, its boundary is already
clean enough to extract into a service. **This is the "monolith-first, extract when
proven" principle — decision explained because premature microservices is the most common
way teams of this size stall.**

### 4.2 Logical Components

1. **Web App (Next.js)** — SSR/ISR frontend + thin BFF routes.
2. **API Gateway / Core API** — REST/tRPC; auth, validation, rate limiting, scan orchestration entrypoint.
3. **Scan Orchestrator** — turns a scan request into a set of per-connector jobs, tracks aggregate state, streams partials.
4. **Connector Runtime** — loads connectors from the registry, executes them in isolation with per-connector timeout/retry/circuit-breaker.
5. **Connectors (plugins)** — one per protocol; conform to the Connector SDK interface.
6. **Chain Access Layer** — shared, provider-abstracted access to RPCs, indexers (The Graph, subgraphs), and third-party APIs, with failover and rate limiting.
7. **Price/Enrichment Service** — token metadata + USD valuation (CoinGecko/DefiLlama/on-chain oracles) with caching.
8. **Queue + Workers** — async execution of scan jobs and scheduled rescans.
9. **Data Stores** — Postgres (source of truth), Redis (cache + queue + rate limit), object storage (raw payload archive for debugging/replay).
10. **Notification Service** — email/web-push for watchlists.
11. **Admin/Ops plane** — registry, allow-list, feature flags, dashboards.

### 4.3 Request Flow (fresh scan)

1. Client `POST /v1/scans { address }`.
2. Core API validates address, resolves ENS, checks Redis for a fresh cached report → if fresh, return `200` with cached report + `cached: true`.
3. Otherwise create a `scan` row (`queued`), enqueue a **scan job**, return `202` + `scanId` + SSE/WebSocket channel.
4. Orchestrator worker fans out one **connector task** per applicable connector onto the queue.
5. Each connector task runs in the Connector Runtime → Chain Access Layer → external RPC/indexer → normalized `Claimable[]`.
6. Results are enriched (price/metadata), risk-flagged, persisted, and pushed to the client channel as **partial results**.
7. When all tasks settle (success/timeout/fail), scan → `complete` (or `partial` if some connectors failed); final report cached in Redis + persisted in Postgres.

### 4.4 Key Architectural Decisions (ADRs — summarized)

- **ADR-1: Direct on-chain reads vs. indexers.** Use **direct RPC reads** for deterministic, contract-specific claim checks (e.g., `merkleClaim(address)` → `isClaimed`, `claimable(address)` view functions, vesting `releasable(address)`). Use **indexers/subgraphs/APIs** for _discovery_ problems that require scanning history or large sets (e.g., "which of 500 airdrops was this address eligible for", event-log aggregation, NFT enumeration). **Rule of thumb, per connector:** if answering the question requires iterating over historical events or an unknown set, use an indexer; if it's a bounded set of known contracts with view functions, read on-chain directly. Each connector declares which it uses (§9).
- **ADR-2: Fan-out isolation.** Every connector runs behind a timeout + circuit breaker so one slow/broken protocol never degrades the whole scan.
- **ADR-3: Normalized claimable schema.** All connectors emit the same `Claimable` DTO; the core knows nothing protocol-specific. This is what keeps the core stable as connectors multiply.
- **ADR-4: Cache-first reads.** Claimables change slowly; aggressive TTL caching is the primary cost and latency lever.

---

## 5. High-Level Architecture Diagram

```
                                   ┌─────────────────────────────────────────┐
                                   │                CLIENTS                    │
                                   │   Web (Next.js)   ·   Future: Public API  │
                                   └───────────────────┬───────────────────────┘
                                                       │ HTTPS (REST/tRPC + SSE/WS)
                                                       ▼
┌───────────────────────────────────────────────────────────────────────────────────────┐
│                                   EDGE / CDN / WAF                                        │
│                       (TLS, DDoS, static assets, edge cache)                             │
└───────────────────────────────────────────┬─────────────────────────────────────────────┘
                                             ▼
┌───────────────────────────────────────────────────────────────────────────────────────┐
│                                  CORE API (stateless, N replicas)                        │
│   Auth · Validation · Rate Limit · Scan Orchestration entrypoint · Read APIs             │
└───┬───────────────────────────┬───────────────────────────┬────────────────────────────┘
    │                           │                           │
    │ enqueue scan              │ read/write                │ cache get/set
    ▼                           ▼                           ▼
┌──────────────┐        ┌──────────────┐            ┌──────────────┐
│  QUEUE       │        │  POSTGRES    │            │   REDIS      │
│ (Redis/SQS)  │        │  (source of  │            │ cache · rate │
│  scan tasks  │        │   truth)     │            │ limit · pub  │
└──────┬───────┘        └──────────────┘            └──────────────┘
       │ consume
       ▼
┌───────────────────────────────────────────────────────────────────────────────────────┐
│                              WORKER TIER (autoscaled)                                     │
│                                                                                          │
│   ┌────────────────────┐     ┌──────────────────────────────────────────────────────┐   │
│   │ Scan Orchestrator  │────▶│                CONNECTOR RUNTIME                      │   │
│   │  fan-out / gather  │     │  timeout · retry · circuit-breaker · per-connector    │   │
│   └────────────────────┘     │  concurrency · health tracking                        │   │
│                              │   ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ...      │   │
│                              │   │Conn:   │ │Conn:   │ │Conn:   │ │Conn:   │          │   │
│                              │   │Uniswap │ │Airdrop │ │Vesting │ │Solana  │          │   │
│                              │   │airdrop │ │Merkle  │ │Sablier │ │Jito    │          │   │
│                              │   └────┬───┘ └────┬───┘ └────┬───┘ └────┬───┘          │   │
│                              └────────┼──────────┼──────────┼──────────┼──────────────┘   │
│                                       ▼          ▼          ▼          ▼                   │
│                              ┌─────────────────────────────────────────────────────┐     │
│                              │              CHAIN ACCESS LAYER                       │     │
│                              │  provider abstraction · failover · rate limit · cache│     │
│                              └───┬─────────────┬─────────────┬─────────────┬─────────┘     │
└──────────────────────────────────┼─────────────┼─────────────┼─────────────┼──────────────┘
                                    ▼             ▼             ▼             ▼
                            ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐
                            │ EVM RPCs   │ │ Indexers / │ │ Price APIs │ │ Solana RPC │
                            │ (Alchemy,  │ │ Subgraphs  │ │ (CoinGecko,│ │ (Helius,   │
                            │  Infura,   │ │ (The Graph)│ │  DefiLlama)│ │  Triton)   │
                            │  own node) │ │            │ │            │ │            │
                            └────────────┘ └────────────┘ └────────────┘ └────────────┘

           ┌──────────────────────────┐        ┌──────────────────────────┐
           │  NOTIFICATION SERVICE    │        │   ADMIN / OPS PLANE       │
           │ email · web-push (cron)  │        │ registry · allow-list ·   │
           └──────────────────────────┘        │ flags · dashboards        │
                                               └──────────────────────────┘

   OBSERVABILITY (cross-cutting): OpenTelemetry traces · structured logs · Prometheus metrics · Sentry
```

---

## 6. Recommended Tech Stack

| Layer                               | Choice                                                                                  | Why (decision explained)                                                                                                                                                                                                                                                       |
| ----------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Language (backend + connectors)** | **TypeScript (Node.js, LTS)**                                                           | The Web3 tooling ecosystem (viem, ethers, @solana/web3.js, The Graph clients) is TS-first. One language across web + API + connectors lets us share the `Claimable` types and lowers the barrier to writing connectors — directly serving the "<1 dev-day per connector" goal. |
| **Runtime/framework (API)**         | **NestJS** (or Fastify + tRPC)                                                          | NestJS gives module boundaries, DI, and a plugin-friendly structure that maps cleanly onto the connector registry. DI makes connectors testable in isolation. If we prefer end-to-end typesafety with the frontend, **tRPC on Fastify** is the lighter alternative.            |
| **Frontend**                        | **Next.js (App Router) + React + TypeScript**                                           | SSR/ISR for fast first paint and SEO on shareable scan pages; React Server Components reduce client JS; Vercel-friendly but self-hostable.                                                                                                                                     |
| **Styling/UI**                      | **Tailwind CSS + shadcn/ui**                                                            | Fast, consistent, accessible primitives; low bespoke-CSS overhead.                                                                                                                                                                                                             |
| **Blockchain access (EVM)**         | **viem** (primary), ethers as fallback                                                  | viem is typesafe, tree-shakeable, fast, with first-class multicall (critical for batching claim-checks — see caching/cost).                                                                                                                                                    |
| **Blockchain access (Solana)**      | **@solana/web3.js + Anchor clients**                                                    | Standard; Anchor IDLs let us decode program accounts for staking/vesting.                                                                                                                                                                                                      |
| **Indexing**                        | **The Graph (hosted/decentralized) + protocol subgraphs; Alchemy/Helius enhanced APIs** | Discovery-class queries need indexers; don't reinvent. Where no subgraph exists, use provider "enhanced" APIs (token balances, NFT enumeration) or a lightweight self-hosted indexer (Ponder).                                                                                 |
| **Datastore (source of truth)**     | **PostgreSQL**                                                                          | Relational integrity for scans/claimables/users; JSONB for connector-specific payloads; mature, cheap, portable.                                                                                                                                                               |
| **ORM**                             | **Prisma** (or Drizzle)                                                                 | Typesafe schema + migrations; Drizzle if we want lighter/SQL-closer.                                                                                                                                                                                                           |
| **Cache / rate-limit / pub-sub**    | **Redis**                                                                               | One battle-tested primitive serving cache, rate limiting (token bucket), and SSE fan-out pub/sub.                                                                                                                                                                              |
| **Queue**                           | **BullMQ (Redis)** MVP → **SQS/SNS** at scale                                           | BullMQ is trivial to run locally and gives retries/backoff/priorities. If Redis queue throughput becomes a bottleneck, swap the transport behind the queue interface for SQS.                                                                                                  |
| **Object storage**                  | **S3-compatible (S3 / R2 / MinIO)**                                                     | Archive raw connector payloads for debugging & deterministic replay of scans. R2 has no egress fees (cost).                                                                                                                                                                    |
| **Auth**                            | **Auth.js (NextAuth) + SIWE**                                                           | Email + Sign-In-With-Ethereum without building auth from scratch.                                                                                                                                                                                                              |
| **Infra/orchestration**             | **Docker + Kubernetes** (or ECS/Fly.io early)                                           | Stateless API + autoscaled workers need an orchestrator. Start on a managed platform (Fly.io/Render/ECS) to defer k8s ops cost; k8s when scale justifies it.                                                                                                                   |
| **IaC**                             | **Terraform**                                                                           | Reproducible, reviewable infra; portable across clouds.                                                                                                                                                                                                                        |
| **Observability**                   | **OpenTelemetry + Prometheus/Grafana + Loki + Sentry**                                  | Distributed traces are essential for fan-out debugging; Sentry for exceptions.                                                                                                                                                                                                 |
| **CI/CD**                           | **GitHub Actions + Turborepo**                                                          | Monorepo-aware caching; connectors as packages.                                                                                                                                                                                                                                |

> **Trade-off note:** TypeScript over Go/Rust. Go/Rust would give better raw throughput and safer concurrency for the fan-out engine. We choose TS because **connector authoring velocity and ecosystem fit dominate** at this stage; the fan-out engine is I/O-bound (network), where Node's event loop is adequate. We isolate any future CPU-bound hotspot (e.g., a self-hosted indexer) as a separate service potentially in Go/Rust.

---

## 7. Database Schema

PostgreSQL. Core tables below (types abbreviated; `id` = UUID v7 for time-sortable keys).

### 7.1 Entity overview

```
users ──< watchlist_addresses >── addresses ──< scans ──< claimables
                                                  │
connectors ──< connector_runs >──────────────────┘
chains ──< connectors
tokens ──< claimables
```

### 7.2 Tables

**`addresses`** — normalized wallet addresses (dedup across users/scans).

| col                            | type        | notes                              |
| ------------------------------ | ----------- | ---------------------------------- |
| id                             | uuid PK     |                                    |
| chain_namespace                | text        | `eip155` / `solana` (CAIP-2 style) |
| address                        | text        | checksummed / canonical            |
| ens_name                       | text null   | last resolved name                 |
| first_seen_at, last_scanned_at | timestamptz |                                    |
|                                |             | UNIQUE(chain_namespace, address)   |

**`chains`** — supported chains.
| col | type | notes |
| id | int PK | |
| caip2 | text | e.g. `eip155:1`, `eip155:8453`, `solana:mainnet` |
| name, native_symbol | text | |
| is_enabled | bool | feature flag |

**`connectors`** — registry (mirrors code registry; DB row for health/flags).
| col | type | notes |
| id | text PK | slug e.g. `arbitrum-airdrop-merkle` |
| display_name | text | |
| category | enum | airdrop/staking_reward/vesting/… |
| supported_chain_ids | int[] | |
| access_mode | enum | `onchain` / `indexer` / `api` / `hybrid` |
| version | text | semver |
| is_enabled | bool | |
| health_status | enum | healthy/degraded/down |
| last_success_at, error_rate, p95_latency_ms | metrics snapshot |

**`scans`** — one scan of one address.
| col | type | notes |
| id | uuid PK | |
| address_id | uuid FK | |
| status | enum | queued/running/partial/complete/failed |
| requested_by | uuid null FK users | null = anonymous |
| total_usd_value | numeric(38,2) | denormalized sum |
| started_at, completed_at | timestamptz | |
| cache_expires_at | timestamptz | |

**`connector_runs`** — per-connector execution within a scan (for observability & partials).
| col | type | notes |
| id | uuid PK | |
| scan_id | uuid FK | |
| connector_id | text FK | |
| status | enum | success/timeout/failed/skipped |
| latency_ms | int | |
| error_code | text null | |
| items_found | int | |

**`tokens`** — token metadata cache.
| col | type | notes |
| id | uuid PK | |
| chain_id | int FK | |
| contract_address | text null | null for native |
| symbol, name | text | |
| decimals | int | |
| logo_url | text | |
| price_usd | numeric | cached; refreshed by price job |
| price_updated_at | timestamptz | |
| | | UNIQUE(chain_id, contract_address) |

**`claimables`** — the core deliverable.
| col | type | notes |
| id | uuid PK | |
| scan_id | uuid FK | |
| address_id | uuid FK | |
| connector_id | text FK | provenance |
| chain_id | int FK | |
| category | enum | |
| token_id | uuid null FK tokens | |
| amount_raw | numeric(78,0) | uint256-safe |
| amount_decimal | numeric(38,18) | |
| usd_value | numeric(38,2) null | |
| claim_url | text | must be allow-listed |
| contract_address | text | source contract |
| claim_method | text | e.g. `claim(uint256,bytes32[])` |
| expires_at | timestamptz null | claim window end |
| confidence | enum | confirmed/likely/estimated |
| risk_flags | text[] | e.g. `unverified_contract` |
| raw_payload | jsonb | connector-specific detail |
| discovered_at | timestamptz | |

**`users`**, **`watchlist_addresses`**, **`notifications`** — accounts & alerts (post-MVP-core).

**`allowlisted_claim_urls`** — anti-phishing allow-list (domain/URL → connector).

### 7.3 Schema decisions explained

- **`numeric(78,0)` for `amount_raw`.** uint256 exceeds bigint; store raw as exact numeric to avoid precision loss, plus a decimal for display/sort.
- **JSONB `raw_payload`.** Connectors evolve fast; JSONB lets us store protocol-specific detail without schema churn while keeping the normalized columns stable for querying/ranking.
- **`connector_runs` separate from `claimables`.** We must record that a connector ran and found _nothing_ (or failed) — that's how partial results and coverage metrics work.
- **`addresses` deduped.** Same address scanned by many users; one canonical row enables shared caching and watchlists.
- **CAIP-2 chain identifiers.** Standard, chain-agnostic identifiers future-proof multi-VM support (EVM + Solana + others).

---

## 8. API Design

REST (versioned) for the public surface; internal orchestration over the queue. tRPC optionally for the Next.js↔API boundary for typesafety. All responses envelope-wrapped.

### 8.1 Conventions

- Base: `/v1`. Versioned via URL.
- Auth: `Authorization: Bearer <jwt>` (optional for anonymous scans; required for accounts).
- Idempotency: `Idempotency-Key` header on scan creation.
- Errors: RFC 9457 `application/problem+json` (see §15).
- Pagination: cursor-based (`?cursor=&limit=`).

### 8.2 Endpoints

| Method | Path                                 | Purpose                                                                                                                             |
| ------ | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `POST` | `/v1/scans`                          | Start (or return cached) scan. Body `{ address, chains?, force? }`. Returns `202 {scanId, status, channel}` or `200` cached report. |
| `GET`  | `/v1/scans/{scanId}`                 | Poll scan status + results (supports partial).                                                                                      |
| `GET`  | `/v1/scans/{scanId}/stream`          | **SSE** stream of partial results and status transitions.                                                                           |
| `GET`  | `/v1/addresses/{address}/claimables` | Latest cached claimables for an address (fast path).                                                                                |
| `GET`  | `/v1/claimables/{id}`                | Single claimable detail incl. `raw_payload` (auth-gated for full detail).                                                           |
| `GET`  | `/v1/connectors`                     | Public list of supported protocols/chains/categories (marketing + transparency).                                                    |
| `POST` | `/v1/watchlist`                      | (auth) Add address to watchlist.                                                                                                    |
| `GET`  | `/v1/watchlist`                      | (auth) List watched addresses + latest summaries.                                                                                   |
| `POST` | `/v1/auth/siwe/nonce` · `/verify`    | SIWE login.                                                                                                                         |
| `GET`  | `/v1/health` · `/v1/ready`           | Liveness/readiness.                                                                                                                 |
| `GET`  | `/internal/metrics`                  | Prometheus (network-restricted).                                                                                                    |

### 8.3 Example: create scan

Request:

```
POST /v1/scans
Idempotency-Key: 6f1a…
{ "address": "0xAbc…", "force": false }
```

Response (fresh):

```
202 Accepted
{
  "scanId": "018f…",
  "status": "queued",
  "channel": "/v1/scans/018f…/stream",
  "cached": false
}
```

Response (cache hit):

```
200 OK
{
  "scanId": "018e…",
  "status": "complete",
  "cached": true,
  "scannedAt": "2026-07-10T12:00:00Z",
  "totalUsdValue": 1423.55,
  "claimables": [ { "id":"…","category":"airdrop","token":{"symbol":"ARB"},
    "amountDecimal":"250.0","usdValue":312.5,"expiresAt":"2026-08-01T00:00:00Z",
    "claimUrl":"https://arbitrum.foundation/claim","connectorId":"arbitrum-airdrop-merkle",
    "confidence":"confirmed","riskFlags":[] } ]
}
```

### 8.4 Streaming model

Fresh scans return `202` + an SSE channel. Events: `scan.status`, `connector.started`,
`claimable.found`, `connector.finished`, `scan.completed`. This lets the UI render results
progressively as connectors return — critical when a full fan-out may take up to 30s but
the first high-value result lands in 2–3s.

---

## 9. Connector / Plugin Architecture

**This is the heart of the system.** Every protocol integration is an isolated connector
conforming to one interface, discovered via a registry, executed by a runtime that provides
isolation, and emitting a normalized `Claimable[]`. The core never contains protocol logic.

### 9.1 The Connector Contract (conceptual — no implementation)

Each connector is a package exporting a definition with:

- **Metadata:** `id`, `displayName`, `category`, `supportedChains` (CAIP-2), `accessMode` (`onchain | indexer | api | hybrid`), `version`, `officialClaimUrlTemplate` (allow-listed).
- **`supports(address, chain) → boolean`** — cheap pre-filter so we don't fan out irrelevant connectors (e.g., an Arbitrum airdrop connector skips Solana addresses).
- **`scan(ctx, address) → Promise<Claimable[]>`** — the actual check. Receives a **capabilities context** (`ctx`), never raw global clients.
- **`healthcheck(ctx) → Promise<HealthStatus>`** — optional; verifies upstream reachability.

### 9.2 The Capabilities Context (`ctx`) — dependency injection & isolation

Connectors **never** create their own RPC clients, HTTP clients, or caches. The runtime
injects a scoped `ctx` exposing:

- `ctx.chain(caip2)` → a rate-limited, failover-backed **read-only** client (viem/solana) from the Chain Access Layer.
- `ctx.indexer(name)` → typed subgraph/indexer client.
- `ctx.http` → an outbound HTTP client with timeout, retry, and per-connector rate limiting.
- `ctx.price(token)` → cached USD price lookup.
- `ctx.cache` → namespaced cache (keys auto-prefixed with connector id + version).
- `ctx.logger` / `ctx.tracer` → connector-scoped structured logging + tracing span.
- `ctx.config` → connector-specific config/secrets (from vault), never global env.

**Why DI via ctx:** it makes connectors (a) trivially unit-testable with mocked ctx, (b)
impossible to bypass rate limits / caching / observability, and (c) sandboxable — the
runtime, not the connector, controls all outbound I/O. This is the single most important
maintainability decision in the doc.

### 9.3 The Normalized Output — `Claimable`

Every connector returns the same shape (maps to §7 `claimables`): `category`, `chain`,
`token` (contract/symbol/decimals), `amountRaw`, `claimUrl`, `contractAddress`,
`claimMethod`, `expiresAt?`, `confidence`, `riskFlags[]`, `rawPayload`. USD valuation is
added by the enrichment stage, **not** the connector (connectors shouldn't each reinvent
pricing).

### 9.4 Registry & Discovery

- Connectors are packages under `packages/connectors/*` exporting a definition.
- A **registry module** auto-collects them at build/boot and syncs metadata into the `connectors` DB table.
- The **runtime** selects, for a given address, the set of connectors whose `supports()` passes, respecting `is_enabled` feature flags and chain enablement.

### 9.5 Execution Isolation (Connector Runtime)

For each connector task the runtime enforces:

- **Timeout** (per-connector, default 8s).
- **Retry with backoff** on transient/network errors only (idempotent reads → safe to retry).
- **Circuit breaker** per connector: after an error-rate threshold, trip → mark `degraded/down`, skip for a cooldown, surface partial results.
- **Concurrency limits** per connector and per upstream provider (protect shared RPC quotas).
- **Bulkhead:** connector failures/exceptions are caught and recorded as `connector_runs.failed`; they never bubble up to fail the whole scan.

### 9.6 `accessMode` guidance (on-chain vs indexer — per the brief)

| Situation                                                                                      | Mode                                  | Example                                                                                                     |
| ---------------------------------------------------------------------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Bounded set of known contracts with view functions returning per-address claimable amounts     | **`onchain`** (batched via multicall) | Merkle airdrop `isClaimed(index)`, Sablier `withdrawableAmountOf(streamId)`, staking `earned(address)`      |
| Need to discover _which_ streams/positions/NFTs an address has, or aggregate historical events | **`indexer`**                         | "all Sablier streams where recipient = address", governance reward epochs, NFT enumeration                  |
| Protocol exposes an official eligibility/claim API                                             | **`api`**                             | Some airdrops publish a signed-eligibility endpoint                                                         |
| Discovery via indexer, then confirm live claimable via on-chain read                           | **`hybrid`**                          | Find candidate streams via subgraph, then read `withdrawableAmountOf` on-chain for the exact current amount |

**Decision rule (stated for reviewers):** prefer on-chain reads for _correctness and
trust_ whenever the set is bounded (on-chain is the ground truth and cannot be stale);
use indexers only for _discovery_ over unbounded/historical data; use `hybrid` to get
discovery breadth + on-chain accuracy on the final number. Never present an indexer-only
number as `confirmed` if it could be stale — mark it `likely`.

### 9.7 Versioning & Safety

- Connectors are **semver'd**; cache keys include connector version so a connector bugfix auto-invalidates stale cache.
- New/experimental connectors ship behind a feature flag and in **shadow mode** (run, record, don't surface) until coverage/accuracy is validated against the benchmark set.
- Connectors declare their **claim URL** which must exist in the allow-list; a connector emitting a non-allow-listed URL fails validation in CI.

---

## 10. Folder Structure

Monorepo (Turborepo + pnpm workspaces). Connectors are first-class packages.

```
assetradar/
├── apps/
│   ├── web/                      # Next.js frontend + BFF routes
│   │   ├── app/                  # App Router pages (scan, results, watchlist)
│   │   ├── components/
│   │   └── lib/
│   ├── api/                      # NestJS/Fastify core API (stateless)
│   │   ├── src/modules/
│   │   │   ├── scans/            # scan endpoints + orchestration entry
│   │   │   ├── claimables/
│   │   │   ├── connectors/       # registry sync, health, admin
│   │   │   ├── auth/             # SIWE + email (Auth.js)
│   │   │   ├── watchlist/
│   │   │   └── health/
│   │   └── main.ts
│   └── worker/                   # queue consumers (orchestrator + connector tasks)
│       └── src/
│           ├── orchestrator/     # fan-out / gather / partials
│           ├── runtime/          # connector runtime: timeout, breaker, bulkhead
│           └── schedulers/       # rescans, price refresh, notifications
├── packages/
│   ├── connector-sdk/            # Connector interface, ctx types, Claimable DTO, test kit
│   ├── connectors/               # ONE folder per protocol connector
│   │   ├── arbitrum-airdrop-merkle/
│   │   ├── sablier-vesting/
│   │   ├── uniswap-governance/
│   │   ├── solana-jito-staking/
│   │   └── ...                   # each: definition, supports(), scan(), tests, fixtures
│   ├── chain-access/             # provider abstraction, failover, multicall, rate limit
│   ├── enrichment/               # price/token metadata, USD valuation
│   ├── risk/                     # anti-phishing allow-list, risk flagging
│   ├── db/                       # Prisma schema, migrations, repositories
│   ├── cache/                    # Redis wrappers, key conventions, TTL policy
│   ├── queue/                    # BullMQ/SQS abstraction (transport-swappable)
│   ├── observability/            # OTel setup, logger, metrics helpers
│   └── shared/                   # types, errors, config, validation (zod)
├── infra/
│   ├── terraform/                # cloud infra as code
│   ├── k8s/ (or fly/, ecs/)      # deployment manifests
│   └── docker/                   # Dockerfiles, compose for local
├── docs/
│   ├── assetradar/ARCHITECTURE.md
│   └── adr/                      # architecture decision records
├── .github/workflows/           # CI/CD
├── turbo.json
└── package.json
```

**Why this layout:** the `connector-sdk` + `packages/connectors/*` split makes the
extension point physically obvious. A new integration = a new folder implementing one
interface + fixtures + tests, nothing else. `chain-access`, `enrichment`, `risk`, `cache`,
`queue` are shared packages so connectors stay thin. `apps/*` are deployables; `packages/*`
are libraries. This maps 1:1 onto the logical architecture in §4.

---

## 11. Background Job Architecture

Scanning is inherently async and I/O-bound; the API must never block on fan-out.

### 11.1 Job types

- **`scan.orchestrate`** — turns a scan request into per-connector tasks, tracks aggregate state.
- **`scan.connector`** — runs one connector for one address (the fan-out unit).
- **`enrichment.price-refresh`** — periodic token price refresh (cron).
- **`watchlist.rescan`** — scheduled rescans of watched addresses (cron, staggered).
- **`notify.dispatch`** — send email/web-push when new claimables/expiries detected.
- **`connector.healthcheck`** — periodic upstream health probing.

### 11.2 Topology

- **Queue:** BullMQ on Redis (MVP). Named queues per job type with independent concurrency and priority. Interactive `scan.connector` jobs get higher priority than scheduled rescans so user-facing latency wins under load.
- **Workers:** stateless, horizontally autoscaled on queue depth. Separate worker deployments (or queue routing) for interactive vs. batch work so a nightly rescan storm can't starve live scans.
- **Fan-out/gather:** orchestrator enqueues N `scan.connector` jobs with a shared `scanId`, then a **gather** step (flow/parent-child job, e.g. BullMQ Flows) completes the scan when all children settle or a global scan deadline (e.g., 30s) elapses → mark `partial`.
- **Idempotency:** jobs keyed by `(scanId, connectorId)`; re-delivery is safe because connector reads are idempotent and writes upsert.
- **Retries/backoff:** exponential backoff on transient errors; a poisoned job lands in a **dead-letter queue** with full context for replay.
- **Scheduling:** cron via BullMQ repeatable jobs (or a `pg-cron`/dedicated scheduler) for rescans, price refresh, health probes.

### 11.3 Scale path

Redis/BullMQ handles well into the low-millions of jobs/day. If queue throughput or
multi-region needs outgrow it, the `packages/queue` abstraction lets us swap the transport
to **SQS/SNS** (or Kafka for a stream model) without touching orchestrator/connector logic
— decision explained: we hide the broker behind an interface precisely to defer this
choice.

---

## 12. Authentication Strategy

### 12.1 Principles

- **Anonymous scanning is first-class.** No login required to scan an address (it's public data). Auth is only for persistence (watchlists, history, notifications) and the future API product.
- **Non-custodial.** Auth never touches private keys. SIWE proves address _ownership_ for personalization only; we never request signing of transactions.

### 12.2 Mechanisms

- **Anonymous:** issue a short-lived anonymous session token (for rate-limit attribution + SSE channel binding). No PII.
- **Email accounts:** Auth.js (NextAuth) with magic-link / OAuth providers. Passwords avoided (magic-link/OAuth reduces credential-handling surface).
- **Sign-In-With-Ethereum (EIP-4361):** nonce → wallet signature → verify → session. Lets users prove they own an address to unlock personalized watchlists without email.
- **Sessions:** short-lived JWT access token + rotating refresh token (httpOnly, secure, SameSite cookies for web). API keys (future public API) are hashed at rest, scoped, and rate-limited per key.

### 12.3 Authorization

- Role-based: `anonymous`, `user`, `admin`. Admin plane (allow-list, flags, re-index) behind `admin` + SSO + audit logging.
- Resource ownership checks on watchlists/history.

### 12.4 Abuse controls

- Rate limits keyed by IP + anonymous session + account (§14).
- CAPTCHA / proof-of-work challenge on scan creation if abuse detected (protect expensive RPC/indexer spend).

---

## 13. Caching Strategy

Caching is the **primary lever for both latency and cost** (RPC/indexer calls are the
dominant variable cost). Multi-layer:

| Layer                                 | What                                            | TTL / policy                                                                    | Rationale                                                                             |
| ------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| **L0 CDN/edge**                       | Static assets, public `/connectors`, SSR shells | minutes–hours (ISR)                                                             | Offload the obvious.                                                                  |
| **L1 Scan report cache (Redis)**      | Full aggregated report per `(address)`          | **default 6–12h**, per-connector overridable                                    | Claimables change slowly; most repeat scans of the same address should be free.       |
| **L2 Connector result cache (Redis)** | Per-connector `Claimable[]` per address         | per-connector TTL (fast-moving staking rewards shorter, static airdrops longer) | Lets a partial rescan reuse healthy connectors; version-keyed so bugfixes invalidate. |
| **L3 Chain-read cache (Redis)**       | Individual RPC/indexer read results             | short (30s–5m) + block-aware                                                    | Dedupe identical reads within/across concurrent scans.                                |
| **L4 Token/price cache**              | Token metadata (long) + price (1–5m)            | metadata days; price minutes                                                    | Prices move; metadata doesn't.                                                        |
| **L5 In-process/request memo**        | Multicall batching, per-request memoization     | request lifetime                                                                | Collapse duplicate reads within one scan.                                             |

### 13.1 Key conventions & invalidation

- Keys namespaced: `cr:v{schemaVer}:scan:{addr}`, `cr:conn:{connId}:v{connVer}:{addr}`, etc.
- **Version-keyed invalidation:** bumping a connector's semver changes its cache key prefix → instant, safe invalidation of just that connector's cache. Same for schema version.
- **`force` rescan** bypasses L1/L2, still uses L3/L4 within the run.
- **Stale-while-revalidate:** serve cached report immediately with a freshness timestamp, trigger a background rescan if past a soft-TTL — best of both latency and freshness.
- **Multicall batching** (viem) collapses dozens of per-address view calls into one RPC round-trip → major cost/latency win for `onchain` connectors.

### 13.2 Trade-off

Freshness vs. cost. We bias to cost/latency with explicit, user-visible "last scanned"
timestamps and a one-click rescan, rather than always-fresh (which would make the product
too expensive at scale). Time-sensitive categories (staking rewards) get shorter TTLs.

---

## 14. Rate Limiting Strategy

Two distinct concerns: **inbound** (protect us from users) and **outbound** (respect
upstream provider quotas).

### 14.1 Inbound (API)

- **Algorithm:** token-bucket in Redis (sliding-window fallback), keyed by IP + anonymous session + account id + API key.
- **Tiers:** anonymous (e.g., N scans/hour), authenticated (higher), API tiers (paid). Read endpoints (cached claimables) get generous limits; expensive `POST /scans` (fresh) gets tight limits.
- **Cost-based limiting:** a fresh scan that fans out to 200 connectors "costs" more than a cache hit; charge scan-creation against a stricter bucket. Return `429` + `Retry-After` + `problem+json`.
- **Abuse escalation:** progressive challenges (CAPTCHA/PoW) and temporary bans on anomalous patterns (address-enumeration scraping).

### 14.2 Outbound (providers)

- The **Chain Access Layer** owns a per-provider rate limiter + concurrency cap so the aggregate of all connectors/workers never exceeds Alchemy/Helius/The-Graph quotas. This is why connectors must go through `ctx` — they physically cannot bypass it.
- **Global backpressure:** when a provider nears its quota or returns `429`, the layer throttles and shifts to failover providers; if all are saturated, scans queue rather than error.
- **Per-connector concurrency** prevents one connector from monopolizing a shared provider.

---

## 15. Error Handling Strategy

### 15.1 Principles

- **Partial success is success.** A scan where 190/200 connectors succeed returns results + a `partial` flag listing which connectors failed — never a blanket failure.
- **Fail isolated, never global.** The bulkhead in the runtime guarantees one connector's exception can't fail the scan.
- **Distinguish error classes:** `transient` (network/timeout/429 → retry), `permanent` (bad address, contract reverted deterministically → don't retry), `degraded` (upstream down → circuit-break), `bug` (unexpected exception → alert).

### 15.2 Mechanisms

- **Typed error taxonomy** in `packages/shared/errors` with stable `error_code`s.
- **API errors:** RFC 9457 `problem+json` with `type`, `title`, `status`, `code`, `traceId`. Never leak stack traces or provider internals to clients.
- **Retries:** exponential backoff + jitter on transient only; capped attempts; then dead-letter.
- **Circuit breakers** per connector and per provider (open/half-open/closed) with cooldown.
- **Timeouts** at every boundary (connector, RPC call, whole scan) — no unbounded waits.
- **Graceful degradation ladder:** provider primary → failover provider → cached-only → skip connector (record `connector_run.failed`) → surface partial.
- **Idempotent writes:** upserts keyed by `(scanId, connectorId)` so retried jobs don't duplicate claimables.

### 15.3 User-facing

The UI shows successful claimables plus an unobtrusive "some sources couldn't be checked
(retry)" affordance with the specific connectors, preserving trust (we don't silently drop
coverage) without alarming users.

---

## 16. Logging & Monitoring Plan

### 16.1 Logging

- **Structured JSON logs** (pino) with correlation IDs: `traceId`, `scanId`, `connectorId`, `address` (hashed/truncated for privacy in logs).
- **Levels & sampling:** info for lifecycle, warn for degradations, error for bugs; high-volume debug logs sampled.
- **PII discipline:** wallet addresses are public but treated as sensitive-adjacent; never log secrets/tokens; email hashed in logs.
- **Aggregation:** shipped to Loki/ELK; retention tiered (hot 14–30d, cold archive).

### 16.2 Tracing

- **OpenTelemetry** end-to-end: a scan is one trace; each `scan.connector` is a span with upstream RPC/indexer child spans. **This is non-negotiable** — debugging a 200-way fan-out without distributed tracing is impossible.

### 16.3 Metrics (Prometheus/Grafana)

- **RED per connector:** Rate, Errors, Duration (p50/p95/p99).
- **Coverage:** % connectors succeeding per scan; benchmark-set coverage.
- **Business:** scans/day, cache-hit ratio, total claimable USD surfaced, unique addresses.
- **Cost:** RPC/indexer calls per scan, $ per scan, provider quota utilization.
- **Queue health:** depth, wait time, DLQ size, worker saturation.

### 16.4 Alerting & SLOs

- **SLOs:** scan-success ≥ 99%, P95 fresh-scan < 30s, API availability ≥ 99.5%.
- **Alerts** (PagerDuty/Opsgenie): connector error-rate spikes, provider quota > 80%, DLQ growth, cache-hit collapse, latency SLO burn-rate, price-oracle staleness.
- **Sentry** for exception aggregation with release tracking.
- **Synthetic canary:** a scheduled scan of known benchmark addresses validates coverage/accuracy continuously; regressions page.

---

## 17. Security Considerations

### 17.1 Trust & custody

- **Non-custodial, read-only.** No private keys, no signing, no fund movement — removes the entire custody threat class. This must remain an invariant.

### 17.2 Anti-phishing (product-critical)

- **Claim-URL allow-list.** Every `claimUrl` surfaced must be in `allowlisted_claim_urls`; CI fails a connector that emits a non-allow-listed URL. Prevents AssetRadar from becoming a phishing vector.
- **Explicit user warnings:** "AssetRadar never asks you to connect a wallet to unlock a claim." Educate against the exact scam pattern our product could be impersonated by.
- **Risk flags** on unverified contracts / lookalike tokens.

### 17.3 Application security

- **Input validation everywhere** (zod); strict address validation; reject/escape to prevent injection.
- **Output encoding** and CSP on the web app; XSS/CSRF protections (SameSite cookies, CSRF tokens on state-changing routes).
- **Secrets management:** provider keys in a vault (AWS Secrets Manager / Vault), never in env files in the repo; rotated; injected at runtime; connectors get only their scoped secrets via `ctx.config`.
- **Dependency & supply-chain:** SCA (Dependabot/Snyk), lockfile integrity, provenance for connector packages, SBOM. Connectors are code — a malicious connector is a supply-chain risk, so connector PRs get mandatory review + sandboxed I/O (all outbound via `ctx`).
- **SSRF protection:** `ctx.http` blocks internal/metadata IP ranges — connectors must not be able to reach internal services.
- **Least privilege:** workers get read-only RPC keys; DB roles scoped per service; network policies isolate tiers.

### 17.4 Data & privacy

- Minimal PII (email only, optional). Addresses are public but we offer no reverse "who owns this" enrichment. GDPR/CCPA: data export/delete for accounts. Rate-limit to prevent mass-scraping/enumeration of addresses.

### 17.5 Infra & ops

- TLS everywhere; WAF + DDoS at the edge; audit logs on the admin plane; MFA/SSO for admin; regular pen-tests; least-privilege IAM via Terraform-reviewed policies.

---

## 18. Deployment Architecture

### 18.1 Environments

`local (docker-compose)` → `preview (per-PR ephemeral)` → `staging` → `production`. Config
via env + vault; **feature flags** decouple connector/chain rollout from deploys.

### 18.2 Topology

- **Stateless tiers** (web, api, workers) as containers, horizontally autoscaled.
  - **API:** autoscale on CPU/RPS.
  - **Workers:** autoscale on **queue depth** (interactive and batch pools separate).
- **Stateful/managed:** managed Postgres (primary + read replica for read-heavy claimable queries), managed Redis (HA, persistence for queue), S3-compatible object storage.
- **Edge:** CDN + WAF in front of web + API.
- **Networking:** private subnets for DB/Redis; API/web in public-facing tier behind LB; egress via NAT with allow-listed provider endpoints.

### 18.3 Platform choice & path

- **Start managed** (Fly.io / Render / AWS ECS Fargate) to minimize ops while pre-PMF — decision explained: k8s ops cost isn't justified at MVP.
- **Graduate to Kubernetes (EKS/GKE)** when we need fine-grained autoscaling, multi-region, and richer traffic control. `infra/terraform` + containerized services make this migration mechanical, not a rewrite.

### 18.4 Resilience

- Multi-AZ for DB/Redis; automated backups + PITR for Postgres; DR runbook with RPO/RTO targets.
- Blue-green / rolling deploys with health-gated cutover; DB migrations backward-compatible (expand/contract pattern) so deploys are zero-downtime.
- Provider failover configured in the Chain Access Layer so no single RPC vendor is a hard dependency.

---

## 19. CI/CD Strategy

- **Monorepo CI (GitHub Actions + Turborepo remote caching):** only affected packages build/test on a PR — keeps connector-heavy repo CI fast.
- **PR pipeline:** typecheck → lint → unit tests → connector contract tests → integration tests (against forked-chain / recorded fixtures) → build → security scans (SCA, secret scan, SAST) → ephemeral preview deploy.
- **Connector gate:** a new/changed connector must pass the **connector conformance suite** (implements interface, emits valid `Claimable`, claim URL allow-listed, deterministic against recorded fixtures) before merge.
- **Main pipeline:** on merge → build/push images (signed, SBOM) → deploy staging → run smoke + synthetic benchmark scan → manual/auto gate → deploy production (blue-green) → post-deploy canary + auto-rollback on SLO burn.
- **DB migrations** run as a gated, backward-compatible step (expand/contract).
- **Feature-flag-driven rollout:** new connectors go live in shadow mode via flags, then progressive enablement — decoupled from image deploys.
- **Security in CI:** Dependabot, Snyk/Trivy image scan, gitleaks secret scan, CodeQL SAST; fail the build on high-severity.

---

## 20. Testing Strategy

| Level                            | What                                                                                            | Tooling / approach                                                                             |
| -------------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| **Unit**                         | Pure logic: ranking, enrichment, risk flagging, individual connector `scan()` with mocked `ctx` | Vitest/Jest; connectors testable in isolation because all I/O is injected                      |
| **Connector conformance**        | Every connector satisfies the SDK contract + emits schema-valid, allow-listed output            | Shared test-kit in `connector-sdk`; runs in CI on every connector                              |
| **Fixture/replay**               | Connectors run against **recorded** RPC/indexer responses (deterministic)                       | Recorded fixtures + forked-chain snapshots; the `raw_payload` archive enables real-scan replay |
| **Integration**                  | API ↔ queue ↔ worker ↔ DB ↔ Redis end-to-end for scan lifecycle                                 | docker-compose test stack; forked chains (Anvil) for on-chain connectors                       |
| **Contract (API)**               | OpenAPI/tRPC schema conformance for clients                                                     | schema tests; consumer-driven                                                                  |
| **E2E**                          | Web flow: enter address → stream results → view detail                                          | Playwright (Chromium available in env)                                                         |
| **Load/perf**                    | Fan-out under 10k+ concurrent scans; queue saturation; cache-hit behavior                       | k6/Artillery against staging                                                                   |
| **Accuracy/regression (golden)** | Benchmark addresses with **known** claimables; assert coverage & values within tolerance        | Synthetic canary + CI golden-set; catches connector drift when protocols change                |
| **Security**                     | SAST/DAST, dependency & secret scanning, SSRF/allow-list tests                                  | CI + periodic pen-test                                                                         |

**Testing philosophy:** connectors are where correctness lives and where external reality
drifts (protocols upgrade contracts, subgraphs change). The **golden benchmark set +
fixture replay + shadow mode** are the defenses that let us ship connectors fast _without_
eroding trust — the core product risk.

---

## 21. Development Roadmap & Milestones

### M0 — Foundations (Weeks 1–3)

- Monorepo, CI/CD skeleton, IaC baseline, observability wiring.
- Define **Connector SDK** (interface, `ctx`, `Claimable` DTO), DB schema, queue abstraction.
- Chain Access Layer for EVM (viem + multicall + one provider + failover stub).
- **Exit:** end-to-end "hello scan" with one trivial connector, streamed to a bare UI.

### M1 — MVP Vertical Slice, Ethereum only (Weeks 4–8)

- 5–8 real connectors across categories (a Merkle airdrop, Sablier vesting, a staking-rewards, a governance-rewards, an NFT-claim).
- Scan orchestration + fan-out isolation (timeout/breaker/bulkhead), partial results, SSE streaming.
- Enrichment (price/metadata), ranking, caching (L1–L5), anti-phishing allow-list.
- Web app: address input, streamed ranked results, claimable detail, risk flags.
- **Exit:** anonymous user scans an ETH address and gets a trustworthy, fast, ranked report. Golden benchmark set green.

### M2 — Multi-chain EVM + Hardening (Weeks 9–13)

- Add Base, Arbitrum, Optimism, Polygon, BNB via chain config + connector `supportedChains`.
- Indexer integration (The Graph/subgraphs) for discovery-class connectors; `hybrid` mode.
- Rate limiting (inbound + outbound), cost dashboards, circuit-breaker tuning, autoscaling on queue depth.
- **Exit:** 20–30 connectors, 5+ EVM chains, cost/scan within target, SLOs met under load test.

### M3 — Accounts, Watchlists & Notifications (Weeks 14–17)

- Auth (email + SIWE), watchlists, scheduled rescans, email/web-push notifications for new claimables/expiries.
- Admin plane: registry UI, allow-list/flag management, manual re-index.
- **Exit:** returning users get alerted when new claimables appear.

### M4 — Solana + Non-EVM Generalization (Weeks 18–22)

- Solana chain access (@solana/web3.js/Anchor), 5–8 Solana connectors (Jito/staking/airdrops).
- Prove the connector abstraction holds across VMs (validates ADR-3).
- **Exit:** cross-VM scanning in one report; connector authoring guide published.

### M5 — Scale, Public API & Polish (Weeks 23–26)

- Public API product (API keys, tiered rate limits, docs), bulk/analyst features.
- Perf hardening to 100k+ scans/day; read replicas; multi-region readiness; k8s migration if warranted.
- **Exit:** 50+ connectors, public API GA-ready, ops runbooks complete.

> **Cross-cutting throughout:** every milestone adds connectors behind flags/shadow mode,
> expands the golden benchmark set, and keeps the connector-authoring time budget (<1
> dev-day) honest.

---

## 22. Risks, Assumptions & Dependencies

### 22.1 Key Risks & Mitigations

| Risk                                                              | Impact   | Likelihood | Mitigation                                                                                                                                |
| ----------------------------------------------------------------- | -------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **RPC/indexer cost explosion** at scale                           | High     | High       | Aggressive multi-layer caching, multicall batching, cost dashboards + alerts, cost-based rate limiting, self-hosted indexer for hot paths |
| **Provider outages / rate-limit hits**                            | High     | High       | Multi-provider failover in Chain Access Layer, circuit breakers, partial results, backpressure                                            |
| **Connector drift** (protocols upgrade contracts/subgraphs)       | High     | High       | Golden benchmark set + synthetic canary + shadow mode + version-keyed cache invalidation; connectors owned/monitored per-health           |
| **False positives/negatives erode trust**                         | Critical | Medium     | `confidence` bands, on-chain confirmation for final numbers (`hybrid`), explainability, never fabricate value                             |
| **AssetRadar abused as phishing lure / impersonated**             | Critical | Medium     | Claim-URL allow-list enforced in CI, user education, risk flags, no wallet-connect-to-verify pattern                                      |
| **Malicious/buggy connector** (supply chain)                      | High     | Low        | Mandatory review, sandboxed I/O via `ctx`, SSRF guard, conformance suite, SBOM/SCA                                                        |
| **Fan-out latency > user patience**                               | Medium   | Medium     | Streamed partial results, per-connector timeouts, cache-first, prioritize high-value connectors                                           |
| **Regulatory reclassification** (are we giving financial advice?) | Medium   | Low        | Read-only, non-custodial, "informational only" disclaimers, legal review before claim-execution feature                                   |
| **Scope creep into claiming/custody**                             | High     | Medium     | Explicit MVP non-goal; gate any signing feature behind a separate security/legal track                                                    |

### 22.2 Assumptions

- Target claimables are discoverable via public RPC/indexers/APIs (no privileged data needed).
- Address input is public data; scanning it raises no consent issue.
- Most repeat traffic is re-scans of the same addresses (validates cache-first economics).
- Protocol contracts for a given connector are stable enough that a golden-set canary catches breakage quickly.
- Third-party providers (Alchemy/Helius/The Graph/CoinGecko/DefiLlama) remain available on commercial terms.

### 22.3 External Dependencies

- **RPC providers:** Alchemy/Infura (EVM), Helius/Triton (Solana) — with a self-hosted-node fallback path.
- **Indexers:** The Graph (subgraphs), Ponder (self-host option), provider enhanced APIs.
- **Pricing:** CoinGecko / DefiLlama / on-chain oracles.
- **Auth/email:** Auth.js providers, transactional email (Postmark/SES), web-push.
- **Infra:** cloud (AWS/GCP), managed Postgres/Redis, object storage (S3/R2), CDN/WAF (Cloudflare).
- **Observability:** Sentry, Grafana stack (or Datadog).

### 22.4 Open Questions (to resolve early)

1. **Claim execution roadmap** — do we ever move to write/claim flows? That changes custody, security, and legal posture fundamentally. Keep as a hard gate.
2. **Self-hosted indexing** — at what scan volume does self-hosting (Ponder/own nodes) beat provider costs? Instrument to find the crossover.
3. **Monetization** — free scans + paid API/watchlist tiers? Affects rate-limit tiers and cost model.
4. **Eligibility data licensing** — some airdrop eligibility lives in off-chain lists; sourcing/licensing terms per protocol.

---

_End of blueprint v1.0. Next step per M0: ratify the Connector SDK interface and `Claimable`
DTO in `packages/connector-sdk` and stand up the "hello scan" vertical slice — every later
decision hangs off that contract._
