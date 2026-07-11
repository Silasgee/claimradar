"use client";

import { ChevronDown, ExternalLink, Fuel } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { categoryLabel, CHAIN_LABEL, confidenceMeta, sourceLabel, statusMeta } from "@/lib/claims";
import {
  formatDateTime,
  formatRelativeTime,
  formatTokenAmount,
  formatUsd,
  shortenAddress,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import { ClaimStatus, type RankedClaim } from "@/types";

function whyFound(claim: RankedClaim): string {
  const method = claim.provenance.method ? ` via ${claim.provenance.method}` : "";
  switch (claim.status) {
    case ClaimStatus.CLAIMABLE:
      return `Eligible and unclaimed — verified against on-chain state${method}.`;
    case ClaimStatus.ALREADY_CLAIMED:
      return `Eligible, but this wallet has already claimed it${method}.`;
    case ClaimStatus.EXPIRED:
      return `Was claimable, but the claim window has closed${method}.`;
    case ClaimStatus.PENDING:
      return `Eligible, but not yet active for claiming${method}.`;
  }
}

function DetailItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

export function ClaimRow({ claim }: { claim: RankedClaim }) {
  const [open, setOpen] = useState(false);
  const status = statusMeta(claim.status);
  const confidence = confidenceMeta(claim.confidence);
  const expiryDays = claim.expiresAt ? formatRelativeTime(claim.expiresAt) : null;
  const panelId = `claim-${claim.id}`;

  return (
    <li className="border-border border-b last:border-b-0">
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-4">
        {/* Left: expand toggle + identity */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={panelId}
          className="group -m-1 flex flex-1 items-start gap-3 rounded-lg p-1 text-left"
        >
          <ChevronDown
            className={cn(
              "text-muted-foreground mt-0.5 size-4 shrink-0 transition-transform",
              open && "rotate-180",
            )}
            aria-hidden="true"
          />
          <div className="min-w-0">
            <p className="leading-tight font-medium">{claim.protocol.name}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <Badge variant="outline">{categoryLabel(claim.category)}</Badge>
              <Badge variant="outline">{CHAIN_LABEL[claim.chain]}</Badge>
              <Badge variant={confidence.variant}>{confidence.label}</Badge>
              {claim.status === ClaimStatus.CLAIMABLE && expiryDays && (
                <Badge variant="warning">Expires {expiryDays}</Badge>
              )}
            </div>
          </div>
        </button>

        {/* Right: value + status + action */}
        <div className="flex items-center justify-between gap-4 pl-7 sm:justify-end sm:pl-0">
          <div className="text-right">
            <p className="font-medium tabular-nums">
              {formatTokenAmount(claim.amountDecimal, claim.token.symbol)}
            </p>
            <p className="text-muted-foreground text-xs tabular-nums">
              {claim.usdValue !== null ? formatUsd(claim.usdValue) : "Unpriced"}
            </p>
          </div>
          <div className="flex w-28 shrink-0 items-center justify-end">
            {status.actionable ? (
              <Button asChild size="sm" className="gap-1.5">
                <a href={claim.claimUrl} target="_blank" rel="noopener noreferrer nofollow">
                  Claim
                  <ExternalLink className="size-3.5" aria-hidden="true" />
                </a>
              </Button>
            ) : (
              <Badge variant={status.variant}>{status.label}</Badge>
            )}
          </div>
        </div>
      </div>

      {open && (
        <div id={panelId} className="border-border/60 bg-background/40 border-t px-4 py-4 sm:px-11">
          <p className="text-muted-foreground text-sm">{whyFound(claim)}</p>
          <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
            <DetailItem label="Status">
              <Badge variant={status.variant}>{status.label}</Badge>
            </DetailItem>
            <DetailItem label="Confidence">
              <span title={confidence.description}>{confidence.label}</span>
            </DetailItem>
            <DetailItem label="Source">{sourceLabel(claim.provenance.source)}</DetailItem>
            <DetailItem label="Expiration">
              {claim.expiresAt ? formatDateTime(claim.expiresAt) : "No deadline"}
            </DetailItem>
            <DetailItem label="Contract">
              <span className="inline-flex items-center gap-1 font-mono text-xs">
                {shortenAddress(claim.provenance.contractAddress, 6)}
                <CopyButton
                  value={claim.provenance.contractAddress}
                  label="Copy contract address"
                />
              </span>
            </DetailItem>
            <DetailItem label="On-chain check">
              <span className="font-mono text-xs">{claim.provenance.method ?? "—"}</span>
            </DetailItem>
            <DetailItem label="Checked by">
              <span className="font-mono text-xs">
                {claim.provenance.connectorId} v{claim.provenance.connectorVersion}
              </span>
            </DetailItem>
            <DetailItem label="Gas estimate">
              {claim.gasEstimate ? (
                <span className="inline-flex items-center gap-1.5 tabular-nums">
                  <Fuel className="text-muted-foreground size-3.5" aria-hidden="true" />
                  {Number(claim.gasEstimate.gasLimit).toLocaleString()} gas
                </span>
              ) : (
                "—"
              )}
            </DetailItem>
          </dl>
          {status.actionable && (
            <div className="mt-4">
              <Button asChild variant="outline" size="sm" className="gap-1.5">
                <a href={claim.claimUrl} target="_blank" rel="noopener noreferrer nofollow">
                  Open official claim page
                  <ExternalLink className="size-3.5" aria-hidden="true" />
                </a>
              </Button>
            </div>
          )}
        </div>
      )}
    </li>
  );
}
