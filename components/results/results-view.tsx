"use client";

import { ArrowLeft, Download, Info, RefreshCw, TriangleAlert } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";

import { EmptyState } from "@/components/results/empty-state";
import { SummaryCards } from "@/components/results/summary-cards";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatRelativeTime, shortenAddress } from "@/lib/format";
import { lastScanId, loadReport } from "@/lib/history";
import { summarize } from "@/lib/results";
import { ConnectorRunStatus, ScanStatus } from "@/types";

// Code-split the heavier result sections.
const Breakdowns = dynamic(() => import("./breakdowns").then((m) => m.Breakdowns), {
  loading: () => <Skeleton className="h-52 w-full rounded-2xl" />,
});
const ClaimTable = dynamic(() => import("./claim-table").then((m) => m.ClaimTable), {
  loading: () => <Skeleton className="h-64 w-full rounded-2xl" />,
});

export function ResultsView() {
  const router = useRouter();
  const params = useSearchParams();
  const scanId = params.get("scan") ?? lastScanId();
  const report = useMemo(() => (scanId ? loadReport(scanId) : null), [scanId]);
  const summary = useMemo(() => (report ? summarize(report) : null), [report]);

  if (!report || !summary) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col items-center px-4 py-24 text-center">
        <h1 className="text-xl font-semibold tracking-tight">We couldn&apos;t find that scan</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          Results are kept only for your current session. Run a fresh scan to see claims.
        </p>
        <Button asChild className="mt-6">
          <Link href="/">Scan a wallet</Link>
        </Button>
      </div>
    );
  }

  const failed = report.connectorRuns.filter((r) => r.status !== ConnectorRunStatus.SUCCESS);

  function exportJson() {
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `claimradar-${report!.wallet.slice(0, 10)}-${report!.discoveryId.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <Link
          href="/"
          className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1.5 rounded text-sm transition-colors"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          New scan
        </Link>
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-muted-foreground text-xs tracking-wide uppercase">Results for</p>
            <h1 className="mt-1 flex items-center gap-1.5 font-mono text-lg font-medium sm:text-xl">
              {shortenAddress(report.wallet, 8)}
              <CopyButton value={report.wallet} label="Copy wallet address" />
            </h1>
            <p className="text-muted-foreground mt-1 text-xs">
              Scanned {formatRelativeTime(report.completedAt)} · {report.durationMs}ms
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={exportJson} className="gap-1.5">
              <Download className="size-4" aria-hidden="true" />
              Export JSON
            </Button>
            <Button
              size="sm"
              onClick={() => router.push(`/scan?address=${report.wallet}`)}
              className="gap-1.5"
            >
              <RefreshCw className="size-4" aria-hidden="true" />
              Rescan
            </Button>
          </div>
        </div>
      </div>

      {/* Notices */}
      {report.status === ScanStatus.PARTIAL && (
        <div className="border-warning/30 bg-warning-bg mt-6 flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm">
          <TriangleAlert className="text-warning mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p className="text-foreground/90">
            Some sources couldn&apos;t be checked ({failed.map((f) => f.protocolId).join(", ")}).
            Results below are partial — rescan to try again.
          </p>
        </div>
      )}
      {report.stats.dropped > 0 && (
        <div className="border-border bg-card/50 text-muted-foreground mt-3 flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p>
            {report.stats.dropped} item{report.stats.dropped > 1 ? "s were" : " was"} excluded
            because they couldn&apos;t be safely verified.
          </p>
        </div>
      )}

      {/* Summary */}
      <div className="mt-6">
        <SummaryCards summary={summary} />
      </div>

      {report.claims.length === 0 ? (
        <div className="mt-6">
          <EmptyState onRefresh={() => router.push(`/scan?address=${report.wallet}`)} />
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          <Breakdowns byProtocol={summary.byProtocol} byChain={summary.byChain} />
          <ClaimTable claims={report.claims} />
        </div>
      )}

      <p className="text-muted-foreground mt-8 flex items-center justify-center gap-1.5 text-center text-xs">
        <Badge variant="outline">Read-only</Badge>
        Always verify claim links against official sources before signing anything.
      </p>
    </div>
  );
}
