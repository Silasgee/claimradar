"use client";

import { ArrowUpRight, History } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatRelativeTime, shortenAddress } from "@/lib/format";
import { useScanHistory } from "@/lib/history";

export function RecentScans() {
  const { history, clear } = useScanHistory();

  // A first-time visitor shouldn't see an empty module dominating the page.
  if (history.length === 0) return null;

  return (
    <section
      aria-labelledby="recent-scans-heading"
      className="mx-auto w-full max-w-6xl px-4 pt-14 sm:px-6"
    >
      <div className="border-border bg-card/40 rounded-2xl border p-5 sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 id="recent-scans-heading" className="flex items-center gap-2 text-sm font-medium">
            <History className="text-muted-foreground size-4" aria-hidden="true" />
            Recent scans
          </h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={clear}
            className="text-muted-foreground h-7 px-2 text-xs"
          >
            Clear
          </Button>
        </div>

        <ul className="divide-border divide-y">
          {history.map((entry) => (
            <li key={entry.scanId}>
              <Link
                href={`/scan?address=${entry.address}`}
                className="group hover:bg-accent/40 -mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-3 transition-colors"
              >
                <div className="min-w-0">
                  <p className="truncate font-mono text-sm">{shortenAddress(entry.address, 6)}</p>
                  <p className="text-muted-foreground text-xs">{formatRelativeTime(entry.at)}</p>
                </div>
                <div className="flex items-center gap-2">
                  {entry.actionableClaims > 0 ? (
                    <Badge variant="success">{entry.actionableClaims} claimable</Badge>
                  ) : (
                    <Badge variant="outline">{entry.totalClaims} found</Badge>
                  )}
                  <ArrowUpRight
                    className="text-muted-foreground size-4 opacity-0 transition-opacity group-hover:opacity-100"
                    aria-hidden="true"
                  />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
