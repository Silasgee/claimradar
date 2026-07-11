import Link from "next/link";

import { Button } from "@/components/ui/button";

import { Logo } from "./logo";

export function SiteHeader() {
  return (
    <header className="border-border/80 bg-background/70 sticky top-0 z-40 border-b backdrop-blur-xl">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="rounded-md" aria-label="AssetRadar home">
          <Logo />
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
            <Link href="/#how-it-works">How it works</Link>
          </Button>
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="text-muted-foreground hidden sm:inline-flex"
          >
            <Link href="/#features">Features</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/#scan">Scan a wallet</Link>
          </Button>
        </nav>
      </div>
    </header>
  );
}
