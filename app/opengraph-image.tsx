import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const alt = "AssetRadar — Find forgotten Web3 assets";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
  return new ImageResponse(
    <div
      style={{
        height: "100%",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: "#0a0a0a",
        padding: "80px",
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 14,
            border: "2px solid #7c83ff",
            display: "flex",
          }}
        />
        <div style={{ color: "white", fontSize: 34, fontWeight: 600 }}>AssetRadar</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div
          style={{
            color: "white",
            fontSize: 76,
            fontWeight: 700,
            lineHeight: 1.05,
            letterSpacing: -2,
            maxWidth: 900,
          }}
        >
          Find the crypto your wallet forgot about
        </div>
        <div style={{ color: "#a1a1a1", fontSize: 32, maxWidth: 820 }}>
          Unclaimed airdrops, staking rewards, vesting & refunds — from any wallet address.
        </div>
      </div>
      <div style={{ color: "#7c83ff", fontSize: 26 }}>Read-only · Non-custodial · No signing</div>
    </div>,
    size,
  );
}
