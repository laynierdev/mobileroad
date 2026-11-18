import { ImageResponse } from "next/og";
import { APP_NAME, APP_TAGLINE } from "@/config";

export const alt = `${APP_NAME} — ${APP_TAGLINE}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: 80, background: "#1b2a4e", color: "#ffffff" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <div style={{ width: 88, height: 88, borderRadius: 20, background: "#ffffff", color: "#1b2a4e", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 56, fontWeight: 800 }}>M</div>
          <div style={{ fontSize: 84, fontWeight: 800 }}>{APP_NAME}</div>
        </div>
        <div style={{ marginTop: 40, fontSize: 48, color: "#d3dbee" }}>{APP_TAGLINE}</div>
        <div style={{ marginTop: 28, fontSize: 30, color: "#aab6d3" }}>AI-assisted roadmap and timeline for building a mobile app</div>
        <div style={{ display: "flex", marginTop: 56, height: 18, width: 640, borderRadius: 9, overflow: "hidden" }}>
          {["#bcc2cf", "#6b4fbb", "#0f95b0", "#f5a509", "#2dbf7a", "#1668f0", "#0f9d84"].map((c, i) => (
            <div key={c} style={{ flex: [4, 1, 1.4, 1, 0.6, 0.6, 0.6][i], background: c }} />
          ))}
        </div>
      </div>
    ),
    size,
  );
}
