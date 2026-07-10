import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "ClaimRadar",
    template: "%s · ClaimRadar",
  },
  description:
    "Discover forgotten Web3 assets — unclaimed airdrops, staking rewards, vesting schedules and more — by scanning any public wallet address.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  );
}
