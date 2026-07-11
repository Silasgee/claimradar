import { RadarIcon, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";

/** Shown when a scan completes with zero claims — an honest, calm empty state. */
export function EmptyState({ onRefresh }: { onRefresh?: () => void }) {
  return (
    <div className="border-border bg-card/40 flex flex-col items-center rounded-2xl border border-dashed px-6 py-16 text-center">
      <span className="border-border bg-background flex size-14 items-center justify-center rounded-2xl border">
        <RadarIcon className="text-muted-foreground size-6" aria-hidden="true" />
      </span>
      <h2 className="mt-5 text-lg font-semibold tracking-tight">No claims found — for now</h2>
      <p className="text-muted-foreground mt-2 max-w-md text-sm leading-relaxed">
        This wallet has nothing claimable across the protocols we currently support. New protocols
        are added over time, so it&apos;s worth checking back after big airdrop seasons.
      </p>
      {onRefresh && (
        <Button variant="outline" onClick={onRefresh} className="mt-6 gap-2">
          <RefreshCw className="size-4" aria-hidden="true" />
          Rescan
        </Button>
      )}
    </div>
  );
}
