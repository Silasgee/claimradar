"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";

export function CopyButton({
  value,
  label = "Copy",
  className,
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard unavailable */
        }
      }}
      aria-label={copied ? "Copied" : label}
      className={cn(
        "text-muted-foreground hover:bg-accent hover:text-foreground inline-flex size-6 items-center justify-center rounded-md transition-colors",
        className,
      )}
    >
      {copied ? <Check className="text-success size-3.5" /> : <Copy className="size-3.5" />}
    </button>
  );
}
