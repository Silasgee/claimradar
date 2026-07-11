import { ShieldCheck } from "lucide-react";

import { Features } from "@/components/home/features";
import { HowItWorks } from "@/components/home/how-it-works";
import { RecentScans } from "@/components/home/recent-scans";
import { WhatWeFind } from "@/components/home/what-we-find";
import { WalletScanForm } from "@/components/scan/wallet-scan-form";

const TRUST_POINTS = [
  "No wallet connection",
  "No signatures",
  "No private keys",
  "Public data only",
];

export default function HomePage() {
  return (
    <>
      {/* Hero */}
      <section id="scan" className="border-border relative overflow-hidden border-b">
        <div
          className="bg-dot-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,black,transparent)] opacity-[0.5]"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute top-[-10%] left-1/2 h-[420px] w-[720px] -translate-x-1/2 rounded-full opacity-25 blur-3xl"
          style={{ background: "radial-gradient(closest-side, var(--brand), transparent)" }}
          aria-hidden="true"
        />
        <div className="relative mx-auto flex w-full max-w-3xl flex-col items-center px-4 pt-20 pb-20 text-center sm:px-6 sm:pt-28 sm:pb-28">
          <div className="animate-fade-up border-border bg-card/60 text-muted-foreground inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs backdrop-blur">
            <span className="relative flex size-1.5">
              <span className="bg-success absolute inline-flex size-full animate-ping rounded-full opacity-60" />
              <span className="bg-success relative inline-flex size-1.5 rounded-full" />
            </span>
            Read-only · non-custodial
          </div>

          <h1
            className="animate-fade-up mt-6 text-4xl leading-[1.05] font-semibold tracking-tight text-balance sm:text-6xl"
            style={{ animationDelay: "60ms" }}
          >
            Uncover the assets
            <br className="hidden sm:block" /> your wallet forgot
          </h1>

          <p
            className="animate-fade-up text-muted-foreground mt-5 max-w-xl text-lg leading-relaxed text-balance"
            style={{ animationDelay: "120ms" }}
          >
            Paste any public address. AssetRadar surfaces unclaimed airdrops, staking and governance
            rewards, vesting, refunds, and forgotten token balances — ranked by value, each with a
            verified link to its official claim.
          </p>

          <div className="animate-fade-up mt-9 w-full max-w-xl" style={{ animationDelay: "180ms" }}>
            <WalletScanForm autoFocus />
          </div>

          <div
            className="animate-fade-up text-muted-foreground mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs"
            style={{ animationDelay: "240ms" }}
          >
            {TRUST_POINTS.map((point) => (
              <span key={point} className="inline-flex items-center gap-1.5">
                <ShieldCheck className="text-success size-3.5" aria-hidden="true" />
                {point}
              </span>
            ))}
          </div>
        </div>
      </section>

      <RecentScans />
      <HowItWorks />
      <WhatWeFind />
      <Features />
    </>
  );
}
