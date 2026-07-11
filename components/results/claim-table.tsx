import type { RankedClaim } from "@/types";

import { ClaimRow } from "./claim-row";

export function ClaimTable({ claims }: { claims: RankedClaim[] }) {
  return (
    <div className="border-border bg-card overflow-hidden rounded-2xl border">
      <div className="border-border flex items-center justify-between border-b px-4 py-3">
        <h2 className="text-sm font-medium">
          Claims <span className="text-muted-foreground">({claims.length})</span>
        </h2>
        <span className="text-muted-foreground hidden text-xs sm:inline">
          Ranked by value · tap a row for details
        </span>
      </div>
      <ul>
        {claims.map((claim) => (
          <ClaimRow key={claim.id} claim={claim} />
        ))}
      </ul>
    </div>
  );
}
