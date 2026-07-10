import { z } from "zod";

import type { Connector } from "@/connectors";
import type { Logger } from "@/lib/logger";
import { Chain, ClaimableCategory, Confidence, type Claimable, type ScanResponse } from "@/types";

/**
 * Scan result normalization.
 *
 * Connectors are contractually required to emit the shared `Claimable` model
 * — but connectors are also the least-trusted code in the system (many
 * authors, fast-changing protocols). The pipeline therefore validates every
 * item at runtime instead of trusting the type system across that boundary:
 *
 * - Items that don't conform are DROPPED (and logged), never "fixed up" —
 *   surfacing a wrong amount would be worse than surfacing nothing.
 * - `connectorId` is stamped from the connector's own metadata so provenance
 *   can't be spoofed or fat-fingered by a connector.
 */

const tokenSchema = z.object({
  symbol: z.string().min(1),
  name: z.string(),
  decimals: z.number().int().min(0).max(255),
  contractAddress: z.string().nullable(),
});

const claimableSchema = z.object({
  id: z.string().min(1),
  connectorId: z.string().min(1),
  chain: z.enum(Chain),
  category: z.enum(ClaimableCategory),
  token: tokenSchema,
  amountRaw: z.string().regex(/^\d+$/, "amountRaw must be an unsigned integer string"),
  amountDecimal: z.string().min(1),
  usdValue: z.number().finite().nullable(),
  // http(s) only — a claimUrl is user-facing; javascript:/data:/etc. schemes
  // are valid URLs but must never reach a browser. The domain allow-list
  // (blueprint §17.2) layers on top of this in a later milestone.
  claimUrl: z.url({ protocol: /^https?$/ }),
  contractAddress: z.string().min(1),
  expiresAt: z.string().nullable(),
  confidence: z.enum(Confidence),
  riskFlags: z.array(z.string()),
  rawPayload: z.unknown().optional(),
});

export interface NormalizedResponse {
  claimables: Claimable[];
  /** Items rejected by validation (already logged). */
  dropped: number;
}

export function normalizeScanResponse(
  connector: Connector,
  response: ScanResponse,
  logger: Logger,
): NormalizedResponse {
  const connectorId = connector.metadata.id;
  const claimables: Claimable[] = [];
  let dropped = 0;

  for (const item of response.claimables) {
    const parsed = claimableSchema.safeParse({ ...item, connectorId });
    if (parsed.success) {
      claimables.push(parsed.data as Claimable);
    } else {
      dropped++;
      logger.warn(
        {
          connectorId,
          claimableId: typeof item?.id === "string" ? item.id : "<invalid>",
          issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
        },
        "dropped malformed claimable from connector response",
      );
    }
  }

  return { claimables, dropped };
}

/**
 * Deterministic ordering: USD value desc (unpriced last), then decimal amount
 * desc, then connectorId, then id. The trailing unique-id tiebreak guarantees
 * a total order — identical inputs always produce identical output order,
 * regardless of connector completion order.
 */
export function compareClaimables(a: Claimable, b: Claimable): number {
  const aUsd = a.usdValue ?? -1;
  const bUsd = b.usdValue ?? -1;
  if (aUsd !== bUsd) return bUsd - aUsd;

  const aAmount = Number(a.amountDecimal);
  const bAmount = Number(b.amountDecimal);
  if (Number.isFinite(aAmount) && Number.isFinite(bAmount) && aAmount !== bAmount) {
    return bAmount - aAmount;
  }

  if (a.connectorId !== b.connectorId) return a.connectorId < b.connectorId ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Merge claimables from all connectors: sort deterministically, then drop
 * duplicate ids keeping the highest-ranked occurrence. Sorting first makes
 * dedup deterministic even when duplicates arrive from different connectors
 * in different orders.
 */
export function mergeClaimables(claimables: Claimable[]): Claimable[] {
  const sorted = [...claimables].sort(compareClaimables);
  const seen = new Set<string>();
  const merged: Claimable[] = [];
  for (const claimable of sorted) {
    if (seen.has(claimable.id)) continue;
    seen.add(claimable.id);
    merged.push(claimable);
  }
  return merged;
}
