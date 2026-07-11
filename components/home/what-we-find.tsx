import {
  Coins,
  Gift,
  Landmark,
  PiggyBank,
  ReceiptText,
  Sprout,
  Ticket,
  Wallet,
} from "lucide-react";

const CATEGORIES = [
  { icon: Gift, label: "Unclaimed airdrops" },
  { icon: Coins, label: "Staking rewards" },
  { icon: Sprout, label: "Vesting schedules" },
  { icon: Landmark, label: "Governance rewards" },
  { icon: Ticket, label: "Presale allocations" },
  { icon: Wallet, label: "NFT claims" },
  { icon: ReceiptText, label: "Refunds" },
  { icon: PiggyBank, label: "Forgotten balances" },
];

export function WhatWeFind() {
  return (
    <section className="border-border bg-card/30 border-y">
      <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="mb-10 max-w-2xl">
          <p className="text-brand text-sm font-medium">What we surface</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            Every kind of forgotten on-chain asset
          </h2>
          <p className="text-muted-foreground mt-3">
            One scan checks for the claims people lose track of most — across protocols, in one
            ranked view.
          </p>
        </div>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {CATEGORIES.map((c) => (
            <li
              key={c.label}
              className="border-border bg-background hover:border-border/60 hover:bg-accent/40 flex items-center gap-3 rounded-xl border p-4 transition-colors"
            >
              <c.icon className="text-muted-foreground size-5 shrink-0" aria-hidden="true" />
              <span className="text-sm font-medium">{c.label}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
