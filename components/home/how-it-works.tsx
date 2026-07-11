import { ListChecks, Radar, Sparkles } from "lucide-react";

const STEPS = [
  {
    icon: Radar,
    title: "Paste an address",
    body: "Any public wallet — yours or one you're researching. No connection, no signature, no keys.",
  },
  {
    icon: Sparkles,
    title: "We scan the chains",
    body: "Discovery connectors read protocols directly on-chain and interpret what's claimable for that wallet.",
  },
  {
    icon: ListChecks,
    title: "Act with confidence",
    body: "Get a ranked list with amounts, expirations, confidence, and a verified link to each official claim page.",
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
      <div className="mb-12 max-w-2xl">
        <p className="text-brand text-sm font-medium">How it works</p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          From address to answer in seconds
        </h2>
      </div>
      <ol className="border-border bg-border grid gap-px overflow-hidden rounded-2xl border sm:grid-cols-3">
        {STEPS.map((step, i) => (
          <li key={step.title} className="bg-card flex flex-col gap-4 p-6 sm:p-8">
            <div className="flex items-center gap-3">
              <span className="border-border bg-background text-brand flex size-9 items-center justify-center rounded-lg border">
                <step.icon className="size-4.5" aria-hidden="true" />
              </span>
              <span className="text-muted-foreground font-mono text-xs">0{i + 1}</span>
            </div>
            <div>
              <h3 className="font-medium">{step.title}</h3>
              <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
