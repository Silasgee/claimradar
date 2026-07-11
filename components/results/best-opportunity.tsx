import { ArrowUpRight, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { categoryLabel, CHAIN_LABEL } from "@/lib/claims";
import { daysUntil, formatTokenAmount, formatUsd } from "@/lib/format";
import type { RankedClaim } from "@/types";

/**
 * Spotlights the single highest-ranked claimable opportunity so a visitor
 * grasps "the best thing to do right now" at a glance. Re-presents existing
 * data — no new logic.
 */
export function BestOpportunity({ claim }: { claim: RankedClaim }) {
  const days = daysUntil(claim.expiresAt);
  const urgent = days !== null && days >= 0 && days <= 30;
  const value =
    claim.usdValue !== null
      ? formatUsd(claim.usdValue)
      : formatTokenAmount(claim.amountDecimal, claim.token.symbol);

  return (
    <div className="border-brand/25 from-brand/[0.07] relative overflow-hidden rounded-2xl border bg-gradient-to-br to-transparent p-5 sm:p-6">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="text-brand flex items-center gap-1.5 text-xs font-medium">
            <Sparkles className="size-3.5" aria-hidden="true" />
            Top opportunity
          </div>
          <p className="mt-2 truncate text-xl font-semibold tracking-tight">
            {claim.protocol.name}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Badge variant="outline">{categoryLabel(claim.category)}</Badge>
            <Badge variant="outline">{CHAIN_LABEL[claim.chain]}</Badge>
            {urgent && (
              <Badge variant="warning">Expires in {Math.max(1, Math.round(days!))}d</Badge>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-5 sm:flex-col sm:items-end sm:gap-3">
          <div className="text-right">
            <p className="text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl">
              {value}
            </p>
            {claim.usdValue !== null && (
              <p className="text-muted-foreground text-xs tabular-nums">
                {formatTokenAmount(claim.amountDecimal, claim.token.symbol)}
              </p>
            )}
          </div>
          <Button asChild size="lg" className="shrink-0 gap-1.5">
            <a href={claim.claimUrl} target="_blank" rel="noopener noreferrer nofollow">
              Claim now
              <ArrowUpRight className="size-4" aria-hidden="true" />
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
}
