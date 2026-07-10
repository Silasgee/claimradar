import { z } from "zod";

import type { Logger } from "@/lib/logger";
import {
  Chain,
  ClaimableCategory,
  ClaimStatus,
  Confidence,
  type Claim,
  type DiscoveryResult,
} from "@/types";

import { computeClaimId } from "./claim-id";
import { validateClaimUrl } from "./claim-url";
import type { DiscoveryConnector } from "./connector";
import { CONFIDENCE_SCORE, STATUS_SCORE } from "./ranking";

/**
 * Claim normalization (Milestone 3, Phases 1 & 8).
 *
 * Connectors are untrusted. Every claim they emit is validated at runtime and
 * re-stamped before it can enter the pipeline:
 *
 * - Structure & enums validated with zod. Malformed claims are DROPPED and
 *   logged, never repaired — a wrong claim is worse than a missing one.
 * - `wallet` is stamped from the request, and the stable `id` is re-derived
 *   from identity fields, so a connector cannot spoof identity or provenance.
 * - `provenance.connectorId` / `connectorVersion` are stamped from connector
 *   metadata.
 * - `claimUrl` is validated against scheme + the connector's declared trusted
 *   domains (∪ the global allow-list). A bad URL drops the whole claim.
 */

const tokenSchema = z.object({
  symbol: z.string().min(1),
  name: z.string(),
  decimals: z.number().int().min(0).max(255),
  contractAddress: z.string().nullable(),
});

const provenanceSchema = z.object({
  connectorId: z.string(),
  connectorVersion: z.string(),
  source: z.enum(["onchain", "indexer", "api", "hybrid"]),
  chain: z.enum(Chain),
  contractAddress: z.string().min(1),
  method: z.string().nullable(),
  blockNumber: z.string().nullable(),
  discoveredAt: z.string().min(1),
});

const claimSchema = z.object({
  id: z.string().min(1),
  wallet: z.string().min(1),
  chain: z.enum(Chain),
  protocol: z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    priority: z.number().finite(),
  }),
  category: z.enum(ClaimableCategory),
  claimType: z.string().min(1),
  status: z.enum(ClaimStatus),
  token: tokenSchema,
  amountRaw: z.string().regex(/^\d+$/, "amountRaw must be an unsigned integer string"),
  amountDecimal: z.string().min(1),
  usdValue: z.number().finite().nullable(),
  gasEstimate: z
    .object({ gasLimit: z.string().regex(/^\d+$/, "gasLimit must be an unsigned integer string") })
    .nullable(),
  confidence: z.enum(Confidence),
  riskFlags: z.array(z.string()),
  // Base scheme check; the domain allow-list is applied separately below.
  claimUrl: z.url({ protocol: /^https?$/ }),
  expiresAt: z.string().nullable(),
  provenance: provenanceSchema,
  metadata: z.record(z.string(), z.unknown()),
});

export interface NormalizedClaims {
  claims: Claim[];
  /** Claims rejected by validation or URL policy (already logged). */
  dropped: number;
}

/**
 * Validate, stamp, and normalize a connector's discovery result. `wallet` is
 * the canonical (request) wallet used to stamp identity.
 */
export function normalizeDiscoveryResult(
  connector: DiscoveryConnector,
  result: DiscoveryResult,
  wallet: string,
  logger: Logger,
): NormalizedClaims {
  const connectorId = connector.metadata.id;
  const trustedDomains = connector.capabilities().trustedDomains;
  const canonicalWallet = wallet.trim().toLowerCase();

  const claims: Claim[] = [];
  let dropped = 0;

  const drop = (claimId: unknown, reason: string, extra: Record<string, unknown> = {}) => {
    dropped++;
    logger.warn(
      {
        connectorId,
        claimId: typeof claimId === "string" ? claimId : "<invalid>",
        reason,
        ...extra,
      },
      "dropped malformed claim from connector response",
    );
  };

  for (const raw of result.claims) {
    const parsed = claimSchema.safeParse(raw);
    if (!parsed.success) {
      drop((raw as { id?: unknown })?.id, "schema validation failed", {
        issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
      });
      continue;
    }
    const claim = parsed.data;

    const urlCheck = validateClaimUrl(claim.claimUrl, trustedDomains);
    if (!urlCheck.ok) {
      drop(claim.id, `claim URL rejected: ${urlCheck.reason}`, { claimUrl: claim.claimUrl });
      continue;
    }

    // Re-derive identity and stamp provenance — the connector is untrusted.
    const id = computeClaimId({
      chain: claim.chain,
      protocol: claim.protocol.id,
      contract: claim.provenance.contractAddress,
      wallet: canonicalWallet,
      claimType: claim.claimType,
    });

    claims.push({
      ...claim,
      id,
      wallet: canonicalWallet,
      provenance: {
        ...claim.provenance,
        connectorId,
        connectorVersion: connector.version,
      },
    } as Claim);
  }

  return { claims, dropped };
}

/**
 * Deduplicate claims across connectors by stable id, keeping the strongest
 * occurrence. Preference order (deterministic): claim status, then confidence,
 * then protocol priority, then connector id — the same order documented in
 * docs/CLAIM_MODEL.md. Returns the deduped set (input order preserved for the
 * kept winners) and the count removed.
 */
export function dedupeClaims(claims: Claim[]): { claims: Claim[]; duplicatesRemoved: number } {
  const best = new Map<string, Claim>();
  let duplicatesRemoved = 0;

  for (const claim of claims) {
    const existing = best.get(claim.id);
    if (!existing) {
      best.set(claim.id, claim);
      continue;
    }
    duplicatesRemoved++;
    if (preferenceScore(claim) > preferenceScore(existing)) {
      best.set(claim.id, claim);
    } else if (
      preferenceScore(claim) === preferenceScore(existing) &&
      claim.provenance.connectorId < existing.provenance.connectorId
    ) {
      best.set(claim.id, claim);
    }
  }

  return { claims: [...best.values()], duplicatesRemoved };
}

/** Dedup preference: status, then confidence, then protocol priority. */
function preferenceScore(claim: Claim): number {
  return (
    STATUS_SCORE[claim.status] * 1_000_000 +
    CONFIDENCE_SCORE[claim.confidence] * 1_000 +
    Math.min(Math.max(claim.protocol.priority, 0), 999)
  );
}
