import { Gauge, LockKeyhole, Layers3, ShieldCheck } from "lucide-react";

const FEATURES = [
  {
    icon: LockKeyhole,
    title: "Read-only by design",
    body: "We never request a wallet connection or a signature. Pasting an address reveals only public on-chain data.",
  },
  {
    icon: ShieldCheck,
    title: "Verified claim links",
    body: "Every claim links to an allow-listed official page. We refuse to surface arbitrary or look-alike URLs.",
  },
  {
    icon: Gauge,
    title: "Confidence, not guesses",
    body: "Findings are verified against on-chain state and labeled Confirmed, Likely, or Estimated — never inflated.",
  },
  {
    icon: Layers3,
    title: "Built to scale protocols",
    body: "A connector architecture designed for many chains and hundreds of protocols behind one consistent result.",
  },
];

export function Features() {
  return (
    <section id="features" className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
      <div className="mb-12 max-w-2xl">
        <p className="text-brand text-sm font-medium">Why ClaimRadar</p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          Trustworthy by default
        </h2>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {FEATURES.map((f) => (
          <div
            key={f.title}
            className="group border-border bg-card hover:border-border/60 rounded-2xl border p-6 transition-colors sm:p-7"
          >
            <span className="border-border bg-background text-foreground flex size-10 items-center justify-center rounded-xl border">
              <f.icon className="size-5" aria-hidden="true" />
            </span>
            <h3 className="mt-4 text-lg font-medium tracking-tight">{f.title}</h3>
            <p className="text-muted-foreground mt-2 text-sm leading-relaxed">{f.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
