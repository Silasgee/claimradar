import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/**
 * iOS does not use SVG favicons: Safari bookmarks, home-screen icons, and
 * share sheets (iMessage/WhatsApp) all want a PNG apple-touch-icon. This
 * renders the same radar mark as app/icon.svg at 180×180. iOS applies its
 * own corner radius, so the tile is drawn full-bleed on the brand surface.
 */
export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0a0a0a",
      }}
    >
      <svg width="150" height="150" viewBox="0 0 32 32">
        <circle cx="16" cy="16" r="10" fill="none" stroke="#3a3a3a" strokeWidth="1.6" />
        <circle cx="16" cy="16" r="5.5" fill="none" stroke="#3a3a3a" strokeWidth="1.6" />
        <path
          d="M16 16 L16 6 A10 10 0 0 1 24.5 11"
          fill="#7c83ff"
          fillOpacity="0.28"
          stroke="#7c83ff"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <circle cx="21.5" cy="9.5" r="2" fill="#7c83ff" />
      </svg>
    </div>,
    size,
  );
}
