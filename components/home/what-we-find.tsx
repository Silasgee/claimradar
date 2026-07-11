// Icons deliberately absent: the previous lucide stroke icons triggered a
// GPU tile-corruption bug in Chrome on Android (Mali/PowerVR devices),
// isolated experimentally via the debug/wwf-isolation branch harness —
// this icon-less rendering (its "phase 9") is confirmed stable on the
// affected devices. Reintroduce icons only with an implementation verified
// against that harness.
const CATEGORIES = [
  "Unclaimed airdrops",
  "Staking rewards",
  "Vesting schedules",
  "Governance rewards",
  "Presale allocations",
  "NFT claims",
  "Refunds",
  "Forgotten balances",
];

export function WhatWeFind() {
  return (
    <section className="border-border bg-card-tint border-y">
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
          {CATEGORIES.map((label) => (
            <li
              key={label}
              className="border-border bg-background hover:border-border/60 hover:bg-accent/40 flex items-center gap-3 rounded-xl border p-4 transition-colors"
            >
              <span className="text-sm font-medium">{label}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
