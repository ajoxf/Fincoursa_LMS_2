import { ImageResponse } from "next/og";

// The picture shown when a FinCoursa link is shared (WhatsApp, LinkedIn, SMS, Slack...). Pages with their
// own image (courses with a thumbnail) use that instead.
export const alt = "FinCoursa: practical courses in finance and trading";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between",
        background: "#000000", color: "#ffffff", padding: "72px 80px", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", fontSize: 44, fontWeight: 700, letterSpacing: -1 }}>FinCoursa</div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 76, fontWeight: 700, lineHeight: 1.05, letterSpacing: -2, maxWidth: 980 }}>
            Practical courses in finance and trading
          </div>
          <div style={{ display: "flex", marginTop: 28, fontSize: 32, color: "#d1d5db" }}>Learn from industry practitioners</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ display: "flex", background: "#d6fd3b", color: "#101827", fontSize: 30, fontWeight: 700, padding: "14px 28px", borderRadius: 12 }}>fincoursa.com</div>
        </div>
      </div>
    ),
    size,
  );
}
