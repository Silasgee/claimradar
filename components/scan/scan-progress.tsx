"use client";

import { Check, Loader2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { shortenAddress } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface ProgressConnector {
  id: string;
  displayName: string;
  protocol: { name: string };
}

export function ScanProgress({
  address,
  connectors,
  progress,
  activeIndex,
  etaSeconds,
  onCancel,
}: {
  address: string;
  connectors: ProgressConnector[];
  progress: number;
  activeIndex: number;
  etaSeconds: number | null;
  onCancel: () => void;
}) {
  return (
    <div className="mx-auto w-full max-w-xl px-4 py-16 sm:py-24">
      <div className="flex flex-col items-center text-center">
        <div className="relative flex size-16 items-center justify-center">
          <span className="border-border absolute inset-0 rounded-full border" />
          <span className="border-t-brand absolute inset-0 animate-spin rounded-full border-2 border-transparent [animation-duration:1.4s]" />
          <Loader2 className="hidden" />
          <span className="font-mono text-sm font-medium">{Math.round(progress)}%</span>
        </div>
        <h1 className="mt-6 text-xl font-semibold tracking-tight">Scanning wallet</h1>
        <p className="text-muted-foreground mt-1.5 font-mono text-sm">
          {shortenAddress(address, 6)}
        </p>
      </div>

      <div className="mt-8">
        <Progress value={progress} />
        <div className="text-muted-foreground mt-2 flex items-center justify-between text-xs">
          <span>Checking {connectors.length || "…"} sources</span>
          <span>
            {etaSeconds !== null && etaSeconds > 0 ? `~${etaSeconds}s remaining` : "Finishing up…"}
          </span>
        </div>
      </div>

      <ul className="mt-8 space-y-1.5">
        {connectors.length === 0
          ? Array.from({ length: 3 }).map((_, i) => (
              <li key={i} className="border-border flex items-center gap-3 rounded-lg border p-3">
                <Skeleton className="size-5 rounded-full" />
                <Skeleton className="h-4 w-40" />
              </li>
            ))
          : connectors.map((connector, i) => {
              const done = i < activeIndex;
              const active = i === activeIndex;
              return (
                <li
                  key={connector.id}
                  className={cn(
                    "flex items-center gap-3 rounded-lg border p-3 transition-colors",
                    active ? "border-border bg-accent/40" : "border-border/60",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-5 shrink-0 items-center justify-center rounded-full border text-xs",
                      done && "border-success/40 bg-success-bg text-success",
                      active && "border-brand/40 text-brand",
                      !done && !active && "border-border text-muted-foreground",
                    )}
                    aria-hidden="true"
                  >
                    {done ? (
                      <Check className="size-3" />
                    ) : active ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : null}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{connector.protocol.name}</p>
                  </div>
                  <span className="text-muted-foreground ml-auto text-xs">
                    {done ? "Done" : active ? "Scanning…" : "Queued"}
                  </span>
                </li>
              );
            })}
      </ul>

      <div className="mt-8 flex justify-center">
        <Button variant="ghost" onClick={onCancel} className="text-muted-foreground gap-2">
          <X className="size-4" aria-hidden="true" />
          Cancel scan
        </Button>
      </div>
    </div>
  );
}
