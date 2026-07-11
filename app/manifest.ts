import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AssetRadar",
    short_name: "AssetRadar",
    description:
      "Discover forgotten Web3 assets — unclaimed airdrops, staking rewards, vesting, and refunds — from any wallet address.",
    start_url: "/",
    display: "standalone",
    background_color: "#0a0a0a",
    theme_color: "#0a0a0a",
    icons: [{ src: "/icon.svg", type: "image/svg+xml", sizes: "any" }],
  };
}
