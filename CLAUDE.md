# ClaimRadar — agent notes

Read-only Web3 platform for discovering forgotten/unclaimed on-chain assets by
wallet address. It is NOT a portfolio tracker — optimize for claim discovery.
Milestones 0 (foundation), 1 (scan engine), 2 (Ethereum connector), and 3
(Discovery Engine) are complete.

## Commands

- `npm run dev` / `npm run build` / `npm run start`
- `npm run lint` · `npm run lint:fix` · `npm run format`
- `npm run typecheck` (strict TS) · `npm run test` (Vitest)
- `npm run prisma:generate` — required before typecheck/build on a fresh clone
- `docker compose up -d db redis` — local Postgres + Redis

## Architecture rules

- Every protocol integration is a connector in `connectors/<protocol>/` implementing the
  `Connector` interface from `connectors/connector.ts`. Core code never contains
  protocol-specific logic.
- Connectors get ALL capabilities via the injected `ConnectorContext` (logger, cache,
  config, clock, signal). Never read `process.env` or call `new Date()` inside a
  connector.
- `config/env.ts` is the only place `process.env` is read. `lib/errors` is the only error
  vocabulary. API routes must be wrapped with `createApiHandler` (lib/api/handler.ts).
- Domain enums in `types/index.ts` mirror the Prisma enums — keep them in sync.
- Prisma 7: connection URL lives in `prisma.config.ts` (CLI) and the pg driver adapter in
  `db/client.ts` (runtime), not in schema.prisma. Generated client output:
  `db/generated/` (gitignored).

- Connectors are executed ONLY through `ConnectorRuntime` (lib/scan) — never call
  `connector.scan()` directly outside tests. `ScanService` is the pipeline entrypoint;
  its `execute → normalize → merge` order is a contract (see docs/SCAN-ENGINE.md).
- `ConnectorRuntime.execute()` never throws; failures are `ConnectorRunResult` values.
  Keep it that way — partial success is the product's core failure semantic.
- Chain access ONLY via `ctx.chain(chain)` (lib/chain) — connectors never build viem
  clients. Batch bounded read-sets into one multicall; never hit public RPCs in tests
  (mock at the transport level — tests/ethereum-rpc.ts). See docs/CHAIN-ACCESS.md.
- MockConnector is tests-only; `createDefaultRegistry()` holds production connectors.
- Discovery Engine (lib/discovery) sits ABOVE the Scan Engine and reuses its
  `ConnectorRuntime.runIsolated()`. Layering is strict: chain access (lib/chain) →
  discovery connectors (business logic, connectors/discovery/*) → DiscoveryEngine →
  Ranking. Discovery connectors emit the canonical `Claim`; the engine treats them as
  untrusted (validates, re-derives stable id, stamps provenance, enforces claim-URL
  allow-list). Never repair invalid claims — drop them. See docs/DISCOVERY_ENGINE.md,
  docs/CLAIM_MODEL.md, docs/CONNECTOR_SDK.md.

## Docs

Full blueprint: `docs/ARCHITECTURE.md`. Scan engine: `docs/SCAN-ENGINE.md`.
Update them when architecture changes.
