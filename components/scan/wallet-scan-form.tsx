"use client";

import { ArrowRight, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { isValidEvmAddress, normalizeAddress } from "@/lib/wallet";

const EXAMPLE_ADDRESS = "0x000000000000000000000000000000000000bEEF";

export function WalletScanForm({ autoFocus = false }: { autoFocus?: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function scan(raw: string) {
    const normalized = normalizeAddress(raw);
    if (!normalized) {
      setError("Enter a valid EVM address — 0x followed by 40 hex characters.");
      return;
    }
    setError(null);
    setSubmitting(true);
    router.push(`/scan?address=${encodeURIComponent(normalized)}`);
  }

  const invalid = value.length > 0 && !isValidEvmAddress(value);

  return (
    <div className="w-full">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          scan(value);
        }}
        className={cn(
          "group border-border bg-card/60 flex flex-col gap-2 rounded-2xl border p-2 shadow-lg shadow-black/20 backdrop-blur sm:flex-row sm:items-center sm:gap-2",
          "focus-within:border-ring/40 focus-within:ring-ring/40 transition-shadow focus-within:ring-2",
        )}
      >
        <div className="relative flex-1">
          <Search
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2"
            aria-hidden="true"
          />
          <Input
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              if (error) setError(null);
            }}
            autoFocus={autoFocus}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            aria-label="Wallet address"
            aria-invalid={invalid}
            placeholder="Paste any wallet address (0x…)"
            className="h-12 border-0 bg-transparent pl-10 font-mono text-[15px] shadow-none focus-visible:ring-0"
          />
        </div>
        <Button type="submit" size="lg" disabled={submitting} className="h-12 gap-2 sm:w-auto">
          {submitting ? "Scanning…" : "Scan wallet"}
          <ArrowRight className="size-4" aria-hidden="true" />
        </Button>
      </form>

      <div className="mt-2.5 flex min-h-5 flex-wrap items-center gap-x-3 gap-y-1 px-1 text-xs">
        {error ? (
          <span className="text-danger">{error}</span>
        ) : (
          <>
            <span className="text-muted-foreground">No wallet connection required.</span>
            <button
              type="button"
              onClick={() => {
                setValue(EXAMPLE_ADDRESS);
                scan(EXAMPLE_ADDRESS);
              }}
              className="text-foreground rounded font-medium underline-offset-4 hover:underline"
            >
              Try an example →
            </button>
          </>
        )}
      </div>
    </div>
  );
}
