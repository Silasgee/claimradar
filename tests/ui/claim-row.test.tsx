// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { ClaimRow } from "@/components/results/claim-row";
import { ClaimStatus } from "@/types";

import { makeRankedClaim } from "./fixtures";

function renderRow(claim = makeRankedClaim()) {
  return render(
    <ul>
      <ClaimRow claim={claim} />
    </ul>,
  );
}

describe("ClaimRow", () => {
  it("shows an official claim link with safe attributes for a claimable claim", () => {
    renderRow(makeRankedClaim({ status: ClaimStatus.CLAIMABLE }));
    const link = screen.getByRole("link", { name: /claim/i });
    expect(link).toHaveAttribute("href", "https://claims.example.org/example-merkle");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
  });

  it("shows an already-claimed indicator and no claim link when claimed", () => {
    renderRow(makeRankedClaim({ status: ClaimStatus.ALREADY_CLAIMED }));
    expect(screen.getByText(/already claimed/i)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^claim$/i })).not.toBeInTheDocument();
  });

  it("reveals provenance when the row is expanded", async () => {
    const user = userEvent.setup();
    renderRow();
    const toggle = screen.getByRole("button", { expanded: false });
    await user.click(toggle);
    // Async find retries until the disclosure panel has rendered.
    expect(await screen.findByText(/checked by/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { expanded: true })).toBeInTheDocument();
    expect(screen.getByText(/merkle-distributor v1\.0\.0/)).toBeInTheDocument();
    expect(screen.getByText(/120,000 gas/)).toBeInTheDocument();
  });
});
