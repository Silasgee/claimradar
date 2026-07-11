// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { WalletScanForm } from "@/components/scan/wallet-scan-form";

describe("WalletScanForm", () => {
  it("rejects an invalid address with an inline error and does not navigate", async () => {
    const user = userEvent.setup();
    render(<WalletScanForm />);
    await user.type(screen.getByLabelText(/wallet address/i), "not-an-address");
    await user.click(screen.getByRole("button", { name: /scan wallet/i }));
    expect(await screen.findByText(/valid evm address/i)).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("navigates to the scan route with a checksummed address on valid input", async () => {
    push.mockClear();
    const user = userEvent.setup();
    render(<WalletScanForm />);
    await user.type(
      screen.getByLabelText(/wallet address/i),
      "0x000000000000000000000000000000000000beef",
    );
    await user.click(screen.getByRole("button", { name: /scan wallet/i }));
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/scan?address=0x000000000000000000000000000000000000bEEF"),
    );
  });
});
