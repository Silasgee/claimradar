// Drives the REAL production UI with Playwright to capture screenshots.
// /api/scan is route-mocked with a representative report so the results screen
// renders populated (live sandbox scans can't reach mainnet RPC). The homepage,
// scan-progress, empty and error states use the real app behavior.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3200";
const OUT = "docs/screenshots";
mkdirSync(OUT, { recursive: true });

const c = (over) => ({
  usdValue: null,
  gasEstimate: null,
  riskFlags: [],
  expiresAt: null,
  metadata: {},
  token: { symbol: "TKN", name: "Token", decimals: 18, contractAddress: null },
  chain: "ETHEREUM",
  category: "AIRDROP",
  claimType: "merkle-airdrop",
  confidence: "CONFIRMED",
  status: "CLAIMABLE",
  amountRaw: "0",
  amountDecimal: "0",
  claimUrl: "https://claims.example.org/x",
  provenance: {
    connectorId: "merkle-distributor",
    connectorVersion: "1.0.0",
    source: "onchain",
    chain: "ETHEREUM",
    contractAddress: "0x090D4613473dEE047c3f2706764f49E0821D256e",
    method: "isClaimed(uint256)",
    blockNumber: null,
    discoveredAt: "2026-07-11T06:00:00.000Z",
  },
  ...over,
});

const DEMO_CLAIMS = [
  c({
    id: "a",
    rank: 1,
    rankScore: 1595,
    protocol: { id: "optimism", name: "Optimism", priority: 90 },
    chain: "OPTIMISM",
    token: { symbol: "OP", name: "Optimism", decimals: 18, contractAddress: null },
    amountRaw: "744000000000000000000",
    amountDecimal: "744",
    usdValue: 1284.5,
    gasEstimate: { gasLimit: "145000" },
    expiresAt: "2026-07-23T00:00:00.000Z",
    claimUrl: "https://app.optimism.io/airdrops",
  }),
  c({
    id: "b",
    rank: 2,
    rankScore: 1380,
    protocol: { id: "uniswap", name: "Uniswap", priority: 80 },
    category: "GOVERNANCE_REWARD",
    token: { symbol: "UNI", name: "Uniswap", decimals: 18, contractAddress: null },
    amountRaw: "120000000000000000000",
    amountDecimal: "120",
    usdValue: 428.1,
    gasEstimate: { gasLimit: "98000" },
    claimUrl: "https://app.uniswap.org/claim",
  }),
  c({
    id: "c",
    rank: 3,
    rankScore: 512,
    protocol: { id: "sablier", name: "Sablier", priority: 60 },
    category: "VESTING",
    chain: "ARBITRUM",
    status: "PENDING",
    confidence: "LIKELY",
    token: { symbol: "ARB", name: "Arbitrum", decimals: 18, contractAddress: null },
    amountRaw: "3100000000000000000000",
    amountDecimal: "3100",
    usdValue: 3100,
    claimUrl: "https://app.sablier.com",
  }),
  c({
    id: "d",
    rank: 4,
    rankScore: -180,
    protocol: { id: "curve", name: "Curve", priority: 55 },
    category: "STAKING_REWARD",
    status: "ALREADY_CLAIMED",
    token: { symbol: "CRV", name: "Curve", decimals: 18, contractAddress: null },
    amountRaw: "300000000000000000000",
    amountDecimal: "300",
    usdValue: 92.4,
    claimUrl: "https://curve.finance",
  }),
  c({
    id: "e",
    rank: 5,
    rankScore: -820,
    protocol: { id: "ens", name: "ENS", priority: 70 },
    status: "EXPIRED",
    token: { symbol: "ENS", name: "Ethereum Name Service", decimals: 18, contractAddress: null },
    amountRaw: "78000000000000000000",
    amountDecimal: "78",
    usdValue: 250.2,
    expiresAt: "2024-05-01T00:00:00.000Z",
    claimUrl: "https://claim.ens.domains",
  }),
];

const report = (claims, status = "COMPLETE") => ({
  discoveryId: "demo1234",
  wallet: "0x1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b",
  status,
  startedAt: "2026-07-11T06:00:00.000Z",
  completedAt: "2026-07-11T06:00:00.820Z",
  durationMs: 820,
  claims,
  connectorRuns: [
    {
      connectorId: "merkle-distributor",
      protocolId: "optimism",
      status: status === "FAILED" ? "FAILED" : "SUCCESS",
      attempts: status === "FAILED" ? 3 : 1,
      durationMs: 780,
      claimsFound: claims.length,
      ...(status === "FAILED"
        ? { error: { code: "EXTERNAL_SERVICE_ERROR", message: "rpc unavailable" } }
        : {}),
    },
  ],
  stats: { discovered: claims.length, duplicatesRemoved: 0, dropped: 0, rankingDurationMs: 1 },
});

async function mockScan(page, body, delay = 0) {
  await page.route("**/api/scan", async (route) => {
    if (delay) await new Promise((r) => setTimeout(r, delay));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
}

const shot = async (page, name) => {
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log("saved", name);
};

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});

// Desktop
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  deviceScaleFactor: 2,
  colorScheme: "dark",
});
const page = await ctx.newPage();

await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
await page.waitForTimeout(700);
await shot(page, "01-home");

// Scan progress (delay the mock so progress is visible)
await mockScan(page, report(DEMO_CLAIMS), 4000);
await page.goto(`${BASE}/scan?address=0x1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b`);
await page.waitForTimeout(900);
await shot(page, "02-scan-progress");

// Results (let it resolve + navigate)
await page.waitForURL("**/results**", { timeout: 8000 });
await page.waitForTimeout(600);
await shot(page, "03-results");

// Results with an expanded provenance row
await page.getByRole("button", { expanded: false }).first().click();
await page.waitForTimeout(300);
await shot(page, "04-results-expanded");

// Empty state
await page.unroute("**/api/scan");
await mockScan(page, report([]), 300);
await page.goto(`${BASE}/scan?address=0x1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b`);
await page.waitForURL("**/results**", { timeout: 8000 });
await page.waitForTimeout(400);
await shot(page, "05-empty");

// Error state
await page.unroute("**/api/scan");
await mockScan(page, report([], "FAILED"), 300);
await page.goto(`${BASE}/scan?address=0x1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b`);
await page.waitForTimeout(1200);
await shot(page, "06-error");

await ctx.close();

// Mobile home + results
const mctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  colorScheme: "dark",
  isMobile: true,
});
const mpage = await mctx.newPage();
await mpage.goto(`${BASE}/`, { waitUntil: "networkidle" });
await mpage.waitForTimeout(600);
await shot(mpage, "07-home-mobile");

await mockScan(mpage, report(DEMO_CLAIMS), 300);
await mpage.goto(`${BASE}/scan?address=0x1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b`);
await mpage.waitForURL("**/results**", { timeout: 8000 });
await mpage.waitForTimeout(600);
await shot(mpage, "08-results-mobile");

await mctx.close();
await browser.close();
console.log("done");
