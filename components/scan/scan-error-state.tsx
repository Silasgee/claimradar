"use client";

import { Clock, Gauge, RefreshCw, ServerCrash, TriangleAlert, WalletMinimal } from "lucide-react";
import Link from "next/link";
import type { ComponentType } from "react";

import { Button } from "@/components/ui/button";
import type { ScanErrorKind } from "@/lib/api/scan-client";

const CONTENT: Record<
  Exclude<ScanErrorKind, "cancelled">,
  { icon: ComponentType<{ className?: string }>; title: string; body: string; tone: string }
> = {
  invalid: {
    icon: WalletMinimal,
    title: "That address doesn't look right",
    body: "A wallet address is 0x followed by 40 hexadecimal characters. Check it and try again.",
    tone: "text-warning",
  },
  timeout: {
    icon: Clock,
    title: "The scan timed out",
    body: "Sources took too long to respond. This is usually temporary — give it another try.",
    tone: "text-warning",
  },
  rpc: {
    icon: ServerCrash,
    title: "A data source was unavailable",
    body: "We couldn't reach a blockchain provider just now. Please try again in a moment.",
    tone: "text-danger",
  },
  rate_limited: {
    icon: Gauge,
    title: "You're scanning quickly",
    body: "To protect shared infrastructure we rate-limit scans. Wait a few seconds and retry.",
    tone: "text-info",
  },
  server: {
    icon: TriangleAlert,
    title: "Something went wrong",
    body: "An unexpected error interrupted the scan. Please try again.",
    tone: "text-danger",
  },
};

export function ScanErrorState({
  kind,
  onRetry,
}: {
  kind: Exclude<ScanErrorKind, "cancelled">;
  onRetry?: () => void;
}) {
  const content = CONTENT[kind];
  const Icon = content.icon;

  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center px-4 py-24 text-center">
      <span className="border-border bg-card flex size-14 items-center justify-center rounded-2xl border">
        <Icon className={`size-6 ${content.tone}`} />
      </span>
      <h1 className="mt-5 text-xl font-semibold tracking-tight">{content.title}</h1>
      <p className="text-muted-foreground mt-2 text-sm leading-relaxed">{content.body}</p>
      <div className="mt-6 flex items-center gap-2.5">
        {onRetry && (
          <Button onClick={onRetry} className="gap-2">
            <RefreshCw className="size-4" aria-hidden="true" />
            Try again
          </Button>
        )}
        <Button asChild variant="outline">
          <Link href="/">Back to home</Link>
        </Button>
      </div>
    </div>
  );
}
