import { describe, expect, it } from "vitest";

import { validateClaimUrl } from "@/lib/discovery";

const trusted = ["claims.example.org"];

describe("validateClaimUrl", () => {
  it("accepts https URLs on a trusted domain", () => {
    const result = validateClaimUrl("https://claims.example.org/airdrop", trusted);
    expect(result).toMatchObject({ ok: true, host: "claims.example.org" });
  });

  it("accepts subdomains of a trusted domain", () => {
    expect(validateClaimUrl("https://app.claims.example.org/x", ["claims.example.org"]).ok).toBe(
      true,
    );
  });

  it("rejects non-http(s) schemes", () => {
    for (const url of [
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "ftp://claims.example.org/x",
      "file:///etc/passwd",
    ]) {
      const result = validateClaimUrl(url, trusted);
      expect(result.ok).toBe(false);
    }
  });

  it("rejects untrusted and lookalike domains", () => {
    expect(validateClaimUrl("https://evil.io/x", trusted).ok).toBe(false);
    // Lookalike suffix attack must not pass.
    expect(validateClaimUrl("https://claims.example.org.evil.io/x", trusted).ok).toBe(false);
  });

  it("rejects unparseable URLs", () => {
    expect(validateClaimUrl("not a url", trusted).ok).toBe(false);
  });

  it("trusts nothing when the connector declares no domains", () => {
    expect(validateClaimUrl("https://claims.example.org/x", []).ok).toBe(false);
  });
});
