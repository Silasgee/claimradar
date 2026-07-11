import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AssetRadar",
    short_name: "AssetRadar",
    description:
      "Discover forgotten Web3 assets — unclaimed airdrops, staking rewards, vesting, and refunds — from any wallet address.",
    start_url: "/",
    // AssetRadar is a website, not an installable app: "browser" keeps
    // shared/opened links behaving like a normal site (no app-frame chrome,
    // no install prompts) until a real PWA experience ships.
    display: "browser",
    background_color: "#0a0a0a",
    theme_color: "#0a0a0a",
    icons: [{ src: "/icon.svg", type: "image/svg+xml", sizes: "any" }],
  };
}
