import { Chain, ClaimStatus, ClaimableCategory, Confidence, type ClaimSource } from "@/types";

import type { BadgeProps } from "@/components/ui/badge";

type BadgeVariant = NonNullable<BadgeProps["variant"]>;

export const CHAIN_LABEL: Record<Chain, string> = {
  [Chain.ETHEREUM]: "Ethereum",
  [Chain.BASE]: "Base",
  [Chain.ARBITRUM]: "Arbitrum",
  [Chain.OPTIMISM]: "Optimism",
  [Chain.POLYGON]: "Polygon",
  [Chain.BNB]: "BNB Chain",
  [Chain.SOLANA]: "Solana",
};

const CATEGORY_LABEL: Record<ClaimableCategory, string> = {
  [ClaimableCategory.AIRDROP]: "Airdrop",
  [ClaimableCategory.STAKING_REWARD]: "Staking reward",
  [ClaimableCategory.VESTING]: "Vesting",
  [ClaimableCategory.PRESALE_ALLOCATION]: "Presale",
  [ClaimableCategory.GOVERNANCE_REWARD]: "Governance",
  [ClaimableCategory.NFT_CLAIM]: "NFT claim",
  [ClaimableCategory.REFUND]: "Refund",
  [ClaimableCategory.OTHER]: "Other",
};

export function categoryLabel(category: ClaimableCategory): string {
  return CATEGORY_LABEL[category] ?? "Other";
}

export interface StatusMeta {
  label: string;
  variant: BadgeVariant;
  /** Whether this status represents an actionable claim. */
  actionable: boolean;
}

export function statusMeta(status: ClaimStatus): StatusMeta {
  switch (status) {
    case ClaimStatus.CLAIMABLE:
      return { label: "Claimable", variant: "success", actionable: true };
    case ClaimStatus.PENDING:
      return { label: "Pending", variant: "info", actionable: false };
    case ClaimStatus.ALREADY_CLAIMED:
      return { label: "Already claimed", variant: "secondary", actionable: false };
    case ClaimStatus.EXPIRED:
      return { label: "Expired", variant: "danger", actionable: false };
  }
}

export interface ConfidenceMeta {
  label: string;
  variant: BadgeVariant;
  description: string;
}

export function confidenceMeta(confidence: Confidence): ConfidenceMeta {
  switch (confidence) {
    case Confidence.CONFIRMED:
      return {
        label: "Confirmed",
        variant: "success",
        description: "Verified directly against on-chain state.",
      };
    case Confidence.LIKELY:
      return {
        label: "Likely",
        variant: "warning",
        description: "Sourced from an indexer or API; may be slightly stale.",
      };
    case Confidence.ESTIMATED:
      return {
        label: "Estimated",
        variant: "outline",
        description: "Derived heuristically; treat as an estimate.",
      };
  }
}

const SOURCE_LABEL: Record<ClaimSource, string> = {
  onchain: "Direct on-chain read",
  indexer: "Indexer",
  api: "Protocol API",
  hybrid: "Hybrid (indexer + on-chain)",
};

export function sourceLabel(source: ClaimSource): string {
  return SOURCE_LABEL[source] ?? source;
}
