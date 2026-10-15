import { ImageResponse } from "next/og";

export const alt = "Outbox: send email from your own Gmail or Outlook address";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "#FAFAF7",
          color: "#16233A",
        }}
      >
        <div style={{ display: "flex", height: 28 }}>
          <div style={{ flex: 3, background: "#2E5D50" }} />
          <div style={{ flex: 1, background: "#C9922E" }} />
          <div style={{ flex: 3, background: "#2E5D50" }} />
          <div style={{ flex: 1, background: "#C9922E" }} />
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            flex: 1,
            padding: "0 88px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", fontSize: 44, color: "#2E5D50", fontWeight: 700 }}>
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: 16,
                background: "#2E5D50",
                marginRight: 20,
                display: "flex",
              }}
            />
            Outbox
          </div>
          <div style={{ display: "flex", fontSize: 76, fontWeight: 700, lineHeight: 1.08, marginTop: 36, maxWidth: 980 }}>
            Send email that arrives from your own address.
          </div>
          <div style={{ display: "flex", fontSize: 34, color: "#4A5568", marginTop: 28 }}>
            Gmail and Outlook. Send-only access. No spoofing.
          </div>
        </div>
      </div>
    ),
    size
  );
}
