# ClaimRadar — agent notes

Read-only Web3 platform for discovering claimable assets by wallet address.
Milestone 0 (foundation) is complete; no blockchain integrations exist yet.

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

## Docs

Full blueprint: `docs/ARCHITECTURE.md`. Update it when architecture changes.
