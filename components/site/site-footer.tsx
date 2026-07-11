import { ShieldCheck } from "lucide-react";

import { Logo } from "./logo";

export function SiteFooter() {
  return (
    <footer className="border-border/80 border-t">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-10 sm:px-6 md:flex-row md:items-center md:justify-between">
        <div className="space-y-3">
          <Logo />
          <p className="text-muted-foreground max-w-xs text-sm">
            Read-only asset discovery for any public wallet. We never ask you to connect a wallet or
            sign a transaction.
          </p>
        </div>
        <div className="text-muted-foreground flex flex-col gap-3 text-sm">
          <span className="text-foreground inline-flex items-center gap-2">
            <ShieldCheck className="text-success size-4" aria-hidden="true" />
            Non-custodial · No signing · No keys
          </span>
          <p className="text-xs">
            © {new Date().getFullYear()} AssetRadar Labs. Information only — always verify claim
            links against official sources.
          </p>
        </div>
      </div>
    </footer>
  );
}
