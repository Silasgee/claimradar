# AssetRadar

> Discover forgotten Web3 assets by scanning any public wallet address.

AssetRadar is a production-grade, **read-only** Web3 platform. A user enters a public
wallet address and the platform checks multiple chains and protocols for unclaimed
airdrops, claimable staking rewards, vesting schedules, presale allocations, governance
rewards, NFT claims, refunds, and other forgotten on-chain assets.

**Current state: MVP — a usable product.** The full engine stack (Milestones 0–3) plus a
production-quality web app: paste a wallet address, watch a live scan, and get a ranked,
explainable list of claim opportunities. Dark-first, responsive, accessible; Lighthouse
100/100/100/100 (performance / accessibility / best-practices / SEO). See
[docs/UI.md](docs/UI.md) for the frontend architecture and the blueprint/engine docs below:

- [docs/UI.md](docs/UI.md) — frontend architecture, scanning flow, screens
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — full technical blueprint
- [docs/DISCOVERY_ENGINE.md](docs/DISCOVERY_ENGINE.md) — the Discovery Engine (heart of the product)
- [docs/CLAIM_MODEL.md](docs/CLAIM_MODEL.md) — the canonical Claim specification
- [docs/CONNECTOR_SDK.md](docs/CONNECTOR_SDK.md) — the permanent discovery-connector contract
- [docs/SCAN-ENGINE.md](docs/SCAN-ENGINE.md) — the isolated-execution engine
- [docs/CHAIN-ACCESS.md](docs/CHAIN-ACCESS.md) — how connectors query chains

---

## Vision

Billions of dollars in Web3 assets go unclaimed: airdrops expire, rewards accrue silently,
vesting cliffs pass unnoticed. The information is public but fragmented across dozens of
chains and hundreds of protocols. AssetRadar answers one question in one place: **"What can
this address claim right now?"** — without ever holding keys, signing transactions, or
executing claims. Trust is the product.

## Architecture summary

- **Modular monolith** (Next.js App Router) with a strict internal seam: the
  **Connector SDK**. Every protocol integration is an isolated connector implementing one
  shared interface; the core knows nothing protocol-specific.
- **Connectors receive all capabilities via dependency injection** (`ConnectorContext`:
  logger, cache, config, clock, cancellation) — they never create clients or read global
  state, which makes them deterministic, unit-testable, and impossible to run outside the
  runtime's rate limits and observability.
- **Normalized output**: every connector emits the same `Claimable` shape, so the scan
  pipeline, API, and database stay stable as connectors multiply.
- **PostgreSQL** (Prisma) is the source of truth; **Redis** backs caching (and, later,
  queues). Both are consumed through thin abstractions (`db/client.ts`, `lib/cache`).
- **Structured logging** (pino) with request ids and durations on every API request;
  **typed errors** (`lib/errors`) map centrally to HTTP responses.

```
Request → app/api (route handlers, wrapped: request-id, logging, error mapping)
             │
             ▼
     ConnectorRegistry ── forRequest() ──► Connector(s) ── ConnectorContext (DI)
             │                                   │
             ▼                                   ▼
        PostgreSQL (Prisma)                Redis (CacheStore)
```

## Folder structure

```
app/                # Next.js App Router: pages + API routes
  page.tsx          # landing (hero, scan form, sections)
  scan/ results/    # scan progress + results experiences
  api/              # scan, connectors, health, internal/metrics
components/         # UI: site chrome, home/scan/results sections, ui/ primitives
config/             # environment validation (zod) — the only place process.env is read
connectors/         # Connector SDK: interface, context, errors, registry + connectors
  ethereum/         # EthereumConnector: native ETH + curated ERC-20 balances (viem)
  discovery/        # discovery connectors (business logic): merkle-distributor
  mock/             # deterministic MockConnector (tests only)
db/                 # Prisma client singleton (+ generated client, gitignored)
docs/               # architecture blueprint and technical docs
lib/                # shared infrastructure
  api/              # route handler wrapper (request id, logging, error mapping)
  cache/            # CacheStore abstraction + Redis/in-memory implementations
  chain/            # Chain Access Layer: provider-abstracted viem clients
  discovery/        # Discovery Engine: SDK, claim model, ranking, security, metrics
  errors/           # typed AppError hierarchy
  logger.ts         # structured pino logging
  metrics/          # shared duration-stats primitive
  scan/             # Claim Scan Engine: ScanService, ConnectorRuntime, metrics
prisma/             # schema + migrations
scripts/            # dev utilities (screenshots)
tests/              # unit + component tests (Vitest; component tests use jsdom)
types/              # core domain vocabulary (Chain, Claim/Claimable, requests, …)
```

Planned-but-not-yet-present folders from the blueprint: `workers/` (background jobs) and
`utils/` arrive with the milestones that need them — empty folders are noise.

## Requirements

- Node.js ≥ 22 (see `.nvmrc`)
- Docker + Docker Compose (for PostgreSQL and Redis)

## Installation

```bash
git clone https://github.com/Silasgee/assetradar.git
cd assetradar
npm install
cp .env.example .env
```

## Local development

Option A — everything in Docker:

```bash
docker compose up
# app: http://localhost:3000  ·  health: http://localhost:3000/api/health
```

Option B — backing services in Docker, app on the host (fastest feedback loop):

```bash
docker compose up -d db redis
npm run prisma:migrate   # apply migrations to the local database
npm run dev
```

## Environment variables

All environment access goes through `config/env.ts`, which validates on server startup and
fails fast with a precise message. See [.env.example](.env.example) for the template.

| Variable           | Required | Description                                     |
| ------------------ | -------- | ----------------------------------------------- |
| `NODE_ENV`         | no       | `development` (default) · `test` · `production` |
| `DATABASE_URL`     | yes      | PostgreSQL connection string                    |
| `REDIS_URL`        | yes      | Redis connection string                         |
| `LOG_LEVEL`        | no       | `fatal`…`trace`, default `info`                 |
| `ETHEREUM_RPC_URL` | no       | Mainnet RPC; public default for dev only        |

Never commit `.env` — it is gitignored. Deployed environments use a secret manager.

## Scripts

| Script                    | Purpose                           |
| ------------------------- | --------------------------------- |
| `npm run dev`             | Start the dev server (hot reload) |
| `npm run build`           | Production build                  |
| `npm run start`           | Serve the production build        |
| `npm run lint`            | ESLint                            |
| `npm run lint:fix`        | ESLint with autofix               |
| `npm run format`          | Prettier (write)                  |
| `npm run test`            | Vitest (single run)               |
| `npm run test:watch`      | Vitest (watch mode)               |
| `npm run typecheck`       | Strict TypeScript check           |
| `npm run prisma:generate` | Generate the Prisma client        |
| `npm run prisma:migrate`  | Create/apply migrations (dev)     |

## Development workflow

1. Branch from `main`.
2. Make changes. Pre-commit hooks (Husky + lint-staged) run ESLint and Prettier on staged
   files automatically.
3. `npm run typecheck && npm run test` locally.
4. Open a PR — CI runs lint, format check, typecheck, tests, and a production build. All
   must pass before merge.

### Adding a connector (from Milestone 1 onward)

1. Create `connectors/<protocol>/` implementing the `Connector` interface.
2. All I/O goes through the injected `ConnectorContext` — no direct clients, no
   `process.env`, no `new Date()`.
3. Register it in `createDefaultRegistry()` (`connectors/index.ts`).
4. Add a deterministic unit test under `tests/`.

The `MockConnector` (`connectors/mock/`) is the reference implementation.

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — the full technical blueprint (PRD,
  system architecture, roadmap, risks) this codebase follows.
