/**
 * Claim-URL security (Milestone 3, Phase 8; blueprint §17.2).
 *
 * ClaimRadar's biggest product risk is becoming a phishing vector: a malicious
 * or buggy connector emitting an attacker's "claim" link. Every claim URL is
 * therefore validated against a two-part allow-list before it can reach a user:
 *
 *   1. Scheme: http/https only. javascript:, data:, etc. are valid URLs but
 *      must never be surfaced.
 *   2. Domain allow-list: the host must match a trusted domain. Trust is the
 *      union of a GLOBAL allow-list (the official registry, seeded here — the
 *      architecture the admin plane / FR-14 will manage) and the per-connector
 *      `trustedDomains` a connector declares in its capabilities.
 *
 * Matching is exact host or subdomain (a trusted "example.com" also trusts
 * "claims.example.com" but NOT "example.com.evil.io"). Invalid claims are
 * rejected, never repaired.
 */

/**
 * The official global allow-list of trusted claim domains.
 *
 * Milestone 3 seeds it empty: trust is currently connector-declared. This is
 * the seam the admin-managed allow-list (blueprint FR-14 / §17.2) will
 * populate — a domain added here is trusted for every connector.
 */
export const GLOBAL_TRUSTED_DOMAINS: readonly string[] = [];

export type ClaimUrlValidation =
  { ok: true; url: string; host: string } | { ok: false; reason: string };

function hostMatches(host: string, domain: string): boolean {
  const h = host.toLowerCase();
  const d = domain.trim().toLowerCase().replace(/^\.+/, "");
  if (!d) return false;
  return h === d || h.endsWith(`.${d}`);
}

/**
 * Validate a claim URL against scheme + domain allow-list.
 *
 * @param url            the connector-supplied claim URL
 * @param trustedDomains the connector's declared trusted domains
 */
export function validateClaimUrl(
  url: string,
  trustedDomains: readonly string[],
): ClaimUrlValidation {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, reason: "unparseable URL" };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, reason: `disallowed scheme "${parsed.protocol}"` };
  }

  const allowed = [...GLOBAL_TRUSTED_DOMAINS, ...trustedDomains];
  const host = parsed.hostname.toLowerCase();
  if (!allowed.some((domain) => hostMatches(host, domain))) {
    return { ok: false, reason: `host "${host}" is not on the claim-URL allow-list` };
  }

  return { ok: true, url, host };
}
