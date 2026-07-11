import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";

import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";

import "./globals.css";

const SITE = {
  name: "AssetRadar",
  description:
    "Discover forgotten Web3 assets. Paste any wallet address to surface unclaimed airdrops, staking rewards, vesting, and refunds across chains — read-only, non-custodial.",
  url: "https://assetradar.xyz",
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    default: `${SITE.name} — Find forgotten Web3 assets`,
    template: `%s · ${SITE.name}`,
  },
  description: SITE.description,
  keywords: [
    "unclaimed airdrops",
    "web3 asset recovery",
    "wallet scanner",
    "claim checker",
    "crypto airdrop finder",
  ],
  applicationName: SITE.name,
  authors: [{ name: "AssetRadar Labs" }],
  creator: "AssetRadar Labs",
  publisher: "AssetRadar Labs",
  openGraph: {
    type: "website",
    url: SITE.url,
    siteName: SITE.name,
    title: `${SITE.name} — Find forgotten Web3 assets`,
    description: SITE.description,
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE.name} — Find forgotten Web3 assets`,
    description: SITE.description,
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`dark ${GeistSans.variable} ${GeistMono.variable}`}
      suppressHydrationWarning
    >
      <body className="flex min-h-dvh flex-col font-sans">
        <SiteHeader />
        <main className="flex flex-1 flex-col">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
