# Frontend / MVP UI

The web app turns the Discovery Engine into a product: paste a wallet, watch a live scan,
get a ranked, explainable list of claim opportunities. Built with the Next.js App Router,
Tailwind CSS, and hand-authored shadcn/ui primitives. Dark-first, responsive, accessible.

**Lighthouse (desktop, production build):** Performance 100 · Accessibility 100 · Best
Practices 100 · SEO 100.

---

## Running locally

```bash
npm install
cp .env.example .env
docker compose up -d db redis   # optional; only needed for real chain scans
npm run dev                     # http://localhost:3000
```

The homepage, scan flow, and results all work against the real API. A live scan reads
Ethereum mainnet through the Chain Access Layer, so set `ETHEREUM_RPC_URL` to a reachable
provider for real results; without network access a scan surfaces the "data source
unavailable" state by design.

Production build:

```bash
npm run build && npm run start
```

Screenshots of every screen/state can be regenerated with `node scripts/screenshots.mjs`
against a running server (uses the preinstalled Chromium via Playwright).

---

## Scanning flow

```
  /  (landing)
   │  paste address → client-side EIP-55 validation
   ▼
  /scan?address=0x…            (client)
   │  POST /api/scan  ─────────────►  Discovery Engine (real business logic)
   │  live progress: connectors, progress bar, ETA, cancel (AbortController)
   │  • success  → cache report in sessionStorage + push localStorage history
   │  • failure  → typed error state (invalid / timeout / rpc / rate-limited)
   ▼
  /results?scan=<id>            (client)
      summary cards · protocol/chain breakdowns · ranked claim table
      (expand a row for provenance) · export JSON · rescan
```

- **No business logic on the client.** The engine is the single source of truth; the UI
  only maps HTTP + report outcomes to states (`lib/api/scan-client.ts`).
- **No auth, no server session.** The current report lives in `sessionStorage`; recent-scan
  summaries live in `localStorage` (`lib/history.ts`).
- **Cancellation is real** — the scan page aborts the in-flight `fetch`.

## API endpoints (MVP)

| Method | Route             | Purpose                                                        |
| ------ | ----------------- | -------------------------------------------------------------- |
| `POST` | `/api/scan`       | Validate + rate-limit, run the Discovery Engine, return report |
| `GET`  | `/api/connectors` | Active discovery connectors (powers scan progress)             |

Both are thin wrappers over existing code (`createApiHandler` + the engine). `/api/scan`
returns `400` for a bad address and `429` when rate-limited; connector failures come back as
a `FAILED`/`PARTIAL` report, never a 500.

## UI architecture

```
app/
  layout.tsx            # Geist fonts, SEO metadata, header/footer, dark theme
  page.tsx              # landing (server) — hero + sections
  scan/page.tsx         # Suspense wrapper → ScanRunner (client)
  results/page.tsx      # Suspense wrapper → ResultsView (client)
  opengraph-image.tsx   # social share image (next/og)
  api/scan, api/connectors
components/
  site/                 # header, footer, logo
  home/                 # hero sections, recent-scans (client island)
  scan/                 # wallet-scan-form, scan-runner, scan-progress, error states
  results/              # summary-cards, breakdowns, claim-table, claim-row, empty-state
  ui/                   # shadcn-style primitives (button, card, badge, input, …)
lib/
  api/scan-client.ts    # typed client for POST /api/scan
  claims.ts, format.ts  # presentation helpers (labels, badges, formatting)
  results.ts            # pure report → summary aggregation
  history.ts            # local scan history + report cache (client)
  wallet.ts             # EVM address validation (viem)
```

Design principles:

- **Server-first.** The landing page is a Server Component; only interactive islands
  (`WalletScanForm`, `RecentScans`) and the scan/results views are client components.
- **Code-split heavy sections.** `Breakdowns` and `ClaimTable` are lazy-loaded via
  `next/dynamic` with skeleton fallbacks.
- **Restrained visual language.** Near-monochrome (white primary on near-black), semantic
  color reserved for claim status/confidence, one faint brand hue for focus and accents. No
  flashy gradients; motion is subtle and respects `prefers-reduced-motion`.
- **Accessibility.** Semantic landmarks, labeled controls, `aria-expanded` disclosures,
  visible focus rings, AA+ contrast.

## States handled

Every path has a designed state: invalid address, scan in progress, timeout, RPC
unavailable, rate-limited, no claims found (empty), partial results (some sources failed),
excluded/unverified items, and a missing-report fallback on `/results`.
