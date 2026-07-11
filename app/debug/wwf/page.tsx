import type { Metadata } from "next";
import type { CSSProperties, ComponentType, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
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

/**
 * TEMPORARY rendering-isolation harness for the Chrome-Android tile
 * corruption reported in the "What we surface" section (debug/wwf-isolation
 * branch only — remove after root-cause confirmation).
 *
 * Each phase restores exactly one feature of the original component, in a
 * fixed order, so scrolling /debug/wwf?phase=all on an affected device
 * identifies the first phase where corruption appears — i.e. the exact
 * DOM/CSS trigger. Individual phases are addressable as ?phase=N to retest
 * a single variant in isolation.
 */

export const metadata: Metadata = {
  title: "WWF rendering isolation",
  robots: { index: false, follow: false },
};

const CATEGORIES: { icon: LucideIcon; label: string }[] = [
  { icon: Gift, label: "Unclaimed airdrops" },
  { icon: Coins, label: "Staking rewards" },
  { icon: Sprout, label: "Vesting schedules" },
  { icon: Landmark, label: "Governance rewards" },
  { icon: Ticket, label: "Presale allocations" },
  { icon: Wallet, label: "NFT claims" },
  { icon: ReceiptText, label: "Refunds" },
  { icon: PiggyBank, label: "Forgotten balances" },
];

const HEADING = "Every kind of forgotten on-chain asset";
const BLURB =
  "One scan checks for the claims people lose track of most — across protocols, in one ranked view.";

/** Neutralizes every inherited typography feature (body sets Geist +
 *  font-feature-settings "cv11","ss01" + antialiasing + optimizeLegibility). */
const NEUTRAL_TYPE = {
  fontFeatureSettings: "normal",
  fontVariationSettings: "normal",
  WebkitFontSmoothing: "auto",
  textRendering: "auto",
} as CSSProperties;

const PAD: CSSProperties = { padding: "48px 16px" };
const PLAIN_H2: CSSProperties = { fontSize: "1.875rem", fontWeight: 600, margin: 0 };

const PHASES: Record<number, string> = {
  1: "Bare section/h2/p — system font (Arial), all font features neutralized",
  2: "+ original font family (Geist variable) — features still neutralized",
  3: "+ original heading classes EXCEPT text-balance",
  4: "+ text-wrap: balance on the heading",
  5: "+ inherited variable-font settings (feature-settings cv11/ss01, antialiasing, optimizeLegibility)",
  6: "+ eyebrow, paragraph styling, original container/spacing",
  7: "+ grid layout (unstyled list items, text only)",
  8: "+ FIRST card fully styled (border/bg/rounded/hover) — no icon",
  9: "+ ALL 8 cards fully styled — no icons",
  10: "+ lucide SVG icons (full original inner content)",
  11: "+ section border-y",
  12: "+ opaque section tint (bg-card-tint) — CURRENT PRODUCTION component",
  13: "+ ORIGINAL translucent bg-card/30 (pre-fix version, regression reference)",
  // SVG feature isolation (run 2). Identical to phase 10 except ONE icon
  // property per phase. 10 = corrupt control, 9 = clean control.
  14: "SVG: lucide at NATIVE 24px (size-6) — no fractional scaling, stroke stays 2.0px",
  15: "SVG: lucide at size-5 with strokeWidth 2.4 — scaled stroke lands on 2.0 device px",
  16: "SVG: lucide at size-5 with strokeLinecap=butt / strokeLinejoin=miter — no round caps",
  17: "SVG: lucide at size-5 with vector-effect: non-scaling-stroke — stroke in screen space",
  18: "SVG: lucide at size-5 with explicit stroke color — no currentColor",
  19: "SVG: minimal STROKED circle (one <circle>, stroke 2, round) at size-5",
  20: "SVG: FILLED circle (fill=currentColor, NO stroke) at size-5",
  21: "NO SVG: CSS circle (span, 2px border-radius ring) at size-5",
  22: "NO SVG: plain Unicode character (◆)",
};

const SVG_RUN = [9, 10, 14, 15, 16, 17, 18, 19, 20, 21, 22];

function StyledCard({
  label,
  icon: Icon,
}: {
  label: string;
  icon?: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
}) {
  return (
    <li className="border-border bg-background hover:border-border/60 hover:bg-accent/40 flex items-center gap-3 rounded-xl border p-4 transition-colors">
      {Icon ? <Icon className="text-muted-foreground size-5 shrink-0" aria-hidden /> : null}
      <span className="text-sm font-medium">{label}</span>
    </li>
  );
}

function HeaderBlock() {
  return (
    <div className="mb-10 max-w-2xl">
      <p className="text-brand text-sm font-medium">What we surface</p>
      <h2 className="mt-2 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
        {HEADING}
      </h2>
      <p className="text-muted-foreground mt-3">{BLURB}</p>
    </div>
  );
}

function GridSection({
  sectionClass,
  cards,
}: {
  sectionClass?: string;
  cards: "plain" | "first-styled" | "styled" | "styled-icons";
}) {
  return (
    <section className={sectionClass}>
      <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <HeaderBlock />
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {CATEGORIES.map((c, i) =>
            cards === "styled-icons" ? (
              <StyledCard key={c.label} label={c.label} icon={c.icon} />
            ) : cards === "styled" || (cards === "first-styled" && i === 0) ? (
              <StyledCard key={c.label} label={c.label} />
            ) : (
              <li key={c.label}>{c.label}</li>
            ),
          )}
        </ul>
      </div>
    </section>
  );
}

/** Same grid as phase 10, but the icon slot is fully controlled per phase. */
function IconGrid({
  iconFor,
  wrapper,
}: {
  iconFor: (c: LucideIcon) => ReactNode;
  wrapper?: string;
}) {
  return (
    <section {...(wrapper ? { "data-exp": wrapper } : {})}>
      <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <HeaderBlock />
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {CATEGORIES.map((c) => (
            <li
              key={c.label}
              className="border-border bg-background hover:border-border/60 hover:bg-accent/40 flex items-center gap-3 rounded-xl border p-4 transition-colors"
            >
              {iconFor(c.icon)}
              <span className="text-sm font-medium">{c.label}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function SvgExperiment({ n }: { n: number }) {
  switch (n) {
    case 14:
      return (
        <IconGrid
          iconFor={(Icon) => <Icon className="text-muted-foreground size-6 shrink-0" aria-hidden />}
        />
      );
    case 15:
      return (
        <IconGrid
          iconFor={(Icon) => (
            <Icon className="text-muted-foreground size-5 shrink-0" strokeWidth={2.4} aria-hidden />
          )}
        />
      );
    case 16:
      return (
        <IconGrid
          iconFor={(Icon) => (
            <Icon
              className="text-muted-foreground size-5 shrink-0"
              strokeLinecap="butt"
              strokeLinejoin="miter"
              aria-hidden
            />
          )}
        />
      );
    case 17:
      return (
        <>
          <style>{`[data-exp="nss"] svg * { vector-effect: non-scaling-stroke; }`}</style>
          <IconGrid
            wrapper="nss"
            iconFor={(Icon) => (
              <Icon className="text-muted-foreground size-5 shrink-0" aria-hidden />
            )}
          />
        </>
      );
    case 18:
      return (
        <IconGrid
          iconFor={(Icon) => <Icon className="size-5 shrink-0" stroke="#a6a6a6" aria-hidden />}
        />
      );
    case 19:
      return (
        <IconGrid
          iconFor={() => (
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-muted-foreground size-5 shrink-0"
              aria-hidden
            >
              <circle cx="12" cy="12" r="9" />
            </svg>
          )}
        />
      );
    case 20:
      return (
        <IconGrid
          iconFor={() => (
            <svg
              viewBox="0 0 24 24"
              fill="currentColor"
              className="text-muted-foreground size-5 shrink-0"
              aria-hidden
            >
              <circle cx="12" cy="12" r="9" />
            </svg>
          )}
        />
      );
    case 21:
      return (
        <IconGrid
          iconFor={() => (
            <span
              className="text-muted-foreground size-5 shrink-0 rounded-full border-2 border-current"
              aria-hidden
            />
          )}
        />
      );
    case 22:
      return (
        <IconGrid
          iconFor={() => (
            <span className="text-muted-foreground shrink-0 text-sm" aria-hidden>
              ◆
            </span>
          )}
        />
      );
    default:
      return null;
  }
}

function Phase({ n }: { n: number }) {
  if (n >= 14) return <SvgExperiment n={n} />;
  switch (n) {
    case 1:
      return (
        <section style={{ ...PAD, ...NEUTRAL_TYPE, fontFamily: "Arial, sans-serif" }}>
          <h2 style={PLAIN_H2}>{HEADING}</h2>
          <p style={{ marginTop: 12 }}>{BLURB}</p>
        </section>
      );
    case 2:
      return (
        <section style={{ ...PAD, ...NEUTRAL_TYPE }}>
          <h2 style={PLAIN_H2}>{HEADING}</h2>
          <p style={{ marginTop: 12 }}>{BLURB}</p>
        </section>
      );
    case 3:
      return (
        <section style={{ ...PAD, ...NEUTRAL_TYPE }}>
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">{HEADING}</h2>
          <p style={{ marginTop: 12 }}>{BLURB}</p>
        </section>
      );
    case 4:
      return (
        <section style={{ ...PAD, ...NEUTRAL_TYPE }}>
          <h2 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            {HEADING}
          </h2>
          <p style={{ marginTop: 12 }}>{BLURB}</p>
        </section>
      );
    case 5:
      return (
        <section style={PAD}>
          <h2 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            {HEADING}
          </h2>
          <p style={{ marginTop: 12 }}>{BLURB}</p>
        </section>
      );
    case 6:
      return (
        <section>
          <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
            <HeaderBlock />
          </div>
        </section>
      );
    case 7:
      return <GridSection cards="plain" />;
    case 8:
      return <GridSection cards="first-styled" />;
    case 9:
      return <GridSection cards="styled" />;
    case 10:
      return <GridSection cards="styled-icons" />;
    case 11:
      return <GridSection cards="styled-icons" sectionClass="border-border border-y" />;
    case 12:
      return (
        <GridSection cards="styled-icons" sectionClass="border-border bg-card-tint border-y" />
      );
    case 13:
      return <GridSection cards="styled-icons" sectionClass="border-border bg-card/30 border-y" />;
    default:
      return null;
  }
}

function PhaseLabel({ n }: { n: number }) {
  return (
    <div
      style={{
        fontFamily: "monospace",
        fontSize: 12,
        padding: "10px 16px",
        background: "#052e16",
        color: "#86efac",
        borderTop: "1px solid #14532d",
        borderBottom: "1px solid #14532d",
      }}
    >
      PHASE {n} — {PHASES[n]}
    </div>
  );
}

export default async function WwfIsolationPage({
  searchParams,
}: {
  searchParams: Promise<{ phase?: string }>;
}) {
  const { phase } = await searchParams;
  const ids = phase === "svg" ? SVG_RUN : Object.keys(PHASES).map(Number);

  if (phase === "all" || phase === "svg") {
    return (
      <div>
        <div style={{ fontFamily: "monospace", fontSize: 13, padding: 16 }}>
          <strong>
            {phase === "svg"
              ? "SVG feature isolation — phase 9 must stay clean, phase 10 must corrupt (controls). Note which of phases 14–22 corrupt and which are clean."
              : "Isolation run — scroll slowly to the bottom."}
          </strong>{" "}
          Note the FIRST phase number where any corruption (duplicated text, garbled tiles,
          artifacts) appears, and whether it persists in later phases. Filler blocks separate phases
          so each starts near a fresh viewport.
        </div>
        {ids.map((n) => (
          <div key={n}>
            <PhaseLabel n={n} />
            <Phase n={n} />
            <div style={{ height: "45vh" }} aria-hidden />
          </div>
        ))}
        <div style={{ fontFamily: "monospace", fontSize: 13, padding: 16 }}>END OF RUN</div>
      </div>
    );
  }

  const n = Number(phase);
  if (Number.isInteger(n) && PHASES[n]) {
    return (
      <div>
        <PhaseLabel n={n} />
        <div style={{ height: "80vh" }} aria-hidden>
          <p style={{ fontFamily: "monospace", fontSize: 12, padding: 16 }}>
            (filler — scroll down so the variant enters the viewport the same way the real section
            does)
          </p>
        </div>
        <Phase n={n} />
        <div style={{ height: "60vh" }} aria-hidden />
        <nav
          style={{ fontFamily: "monospace", fontSize: 13, padding: 16, display: "flex", gap: 16 }}
        >
          {n > 1 ? <Link href={`/debug/wwf?phase=${n - 1}`}>← phase {n - 1}</Link> : null}
          <Link href="/debug/wwf">index</Link>
          {PHASES[n + 1] ? <Link href={`/debug/wwf?phase=${n + 1}`}>phase {n + 1} →</Link> : null}
        </nav>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "monospace", fontSize: 14, padding: 24, lineHeight: 1.7 }}>
      <h1 style={{ fontSize: 18, fontWeight: 700 }}>WWF rendering isolation</h1>
      <p style={{ marginTop: 8 }}>
        Run 1: <Link href="/debug/wwf?phase=all">?phase=all</Link> (component bisection). Run 2:{" "}
        <Link href="/debug/wwf?phase=svg">?phase=svg</Link> (SVG feature isolation — controls 9/10
        plus one icon variable per phase). The first phase that corrupts is the trigger. Retest any
        single phase in isolation via the links below.
      </p>
      <ol style={{ marginTop: 16, listStyle: "decimal", paddingLeft: 24 }}>
        {ids.map((n) => (
          <li key={n}>
            <Link href={`/debug/wwf?phase=${n}`}>{PHASES[n]}</Link>
          </li>
        ))}
      </ol>
    </div>
  );
}
