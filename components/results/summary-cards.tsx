import { CircleDollarSign, Clock3, Sparkles, Target } from "lucide-react";
import type { ComponentType } from "react";

import { formatTokenAmount, formatUsd } from "@/lib/format";
import type { ResultsSummary } from "@/lib/results";

function Stat({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="border-border bg-card rounded-2xl border p-5">
      <div className="text-muted-foreground flex items-center gap-2">
        <Icon className="size-4" aria-hidden="true" />
        <span className="text-xs font-medium tracking-wide uppercase">{label}</span>
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
      {sub && <p className="text-muted-foreground mt-1 truncate text-xs">{sub}</p>}
    </div>
  );
}

export function SummaryCards({ summary }: { summary: ResultsSummary }) {
  const highest = summary.highestValue;
  const highestValue = highest
    ? highest.usdValue !== null
      ? formatUsd(highest.usdValue)
      : formatTokenAmount(highest.amountDecimal, highest.token.symbol)
    : "—";

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Stat
        icon={Target}
        label="Opportunities"
        value={String(summary.totalClaims)}
        sub={`${summary.actionableClaims} claimable now`}
      />
      <Stat
        icon={CircleDollarSign}
        label="Est. total value"
        value={summary.totalValueUsd !== null ? formatUsd(summary.totalValueUsd) : "Unpriced"}
        sub={
          summary.totalValueUsd !== null
            ? `${summary.pricedCount} of ${summary.totalClaims} priced`
            : "Token pricing coming soon"
        }
      />
      <Stat
        icon={Sparkles}
        label="Highest value"
        value={highestValue}
        sub={highest ? highest.protocol.name : undefined}
      />
      <Stat
        icon={Clock3}
        label="Expiring soon"
        value={String(summary.expiringSoon.length)}
        sub={summary.expiringSoon.length ? "Within 30 days" : "Nothing urgent"}
      />
    </div>
  );
}
