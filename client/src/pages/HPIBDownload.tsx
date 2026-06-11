import { useEffect, useRef, useState } from "react";
import rosterLogo from "@assets/less_admin,_more_hockey_1781211414957.png";

const APPLE_URL = "https://apps.apple.com/us/app/roster-hockey/id6756852981";
const GOOGLE_URL =
  "https://play.google.com/store/apps/details?id=com.aFFhvtIzJvyF.natively&utm_source=na_Med";
const WEBSITE_URL = "https://www.rosterhockey.com";

async function trackHpib(event: "page_view" | "apple_tap" | "google_tap") {
  try {
    await fetch("/api/hpib/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event }),
    });
  } catch {
    // fire-and-forget
  }
}

const PHONE_W = 220;
const PHONE_H = 450;
const PHONE_RADIUS = 34;
const PHONE_BORDER = 9;

function IPhoneMockup({ scale }: { scale: number }) {
  return (
    <div
      style={{
        perspective: "900px",
        perspectiveOrigin: "50% 40%",
        width: PHONE_W + 60,
        height: PHONE_H + 60,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transformOrigin: "top center",
        transform: `scale(${scale})`,
      }}
    >
      {/* Phone body */}
      <div
        style={{
          position: "relative",
          width: PHONE_W,
          height: PHONE_H,
          borderRadius: PHONE_RADIUS,
          background: "linear-gradient(145deg, #2a2a2a 0%, #111 60%, #1c1c1e 100%)",
          boxShadow:
            "0 0 0 1px #3a3a3c, 2px 4px 12px rgba(0,0,0,0.6), 8px 16px 48px rgba(0,0,0,0.8), -2px -2px 6px rgba(255,255,255,0.04)",
          transform: "rotateX(28deg) rotateY(-18deg) rotateZ(6deg)",
          transformStyle: "preserve-3d",
        }}
      >
        {/* Volume buttons */}
        {[68, 112, 150].map((top, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              left: -4,
              top,
              width: 3,
              height: i === 0 ? 24 : 42,
              borderRadius: 2,
              background: "linear-gradient(to right, #1a1a1a, #3a3a3c)",
            }}
          />
        ))}
        {/* Power button */}
        <div
          style={{
            position: "absolute",
            right: -4,
            top: 118,
            width: 3,
            height: 60,
            borderRadius: 2,
            background: "linear-gradient(to left, #1a1a1a, #3a3a3c)",
          }}
        />

        {/* Screen */}
        <div
          style={{
            position: "absolute",
            inset: PHONE_BORDER,
            borderRadius: PHONE_RADIUS - PHONE_BORDER,
            background: "#000",
            overflow: "hidden",
          }}
        >
          <img
            src="/roster-app-screenshot.png"
            alt="Roster app"
            style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top", display: "block" }}
          />
          {/* Dynamic Island */}
          <div
            style={{
              position: "absolute",
              top: 10,
              left: "50%",
              transform: "translateX(-50%)",
              width: 76,
              height: 22,
              borderRadius: 11,
              background: "#000",
              zIndex: 10,
            }}
          />
          {/* Screen glare */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "linear-gradient(135deg, rgba(255,255,255,0.07) 0%, transparent 45%)",
              pointerEvents: "none",
              zIndex: 5,
            }}
          />
        </div>

        {/* USB-C */}
        <div
          style={{
            position: "absolute",
            bottom: 12,
            left: "50%",
            transform: "translateX(-50%)",
            width: 40,
            height: 6,
            borderRadius: 3,
            background: "#0a0a0a",
            boxShadow: "inset 0 1px 2px rgba(0,0,0,0.8), 0 0 0 1px #2a2a2a",
          }}
        />

        {/* Edge highlight */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: PHONE_RADIUS,
            pointerEvents: "none",
            boxShadow: "inset 1px 1px 0 rgba(255,255,255,0.12), inset -1px -1px 0 rgba(0,0,0,0.3)",
          }}
        />
      </div>
    </div>
  );
}

export default function HPIBDownload() {
  const phoneSection = useRef<HTMLDivElement>(null);
  const [phoneScale, setPhoneScale] = useState(1);

  useEffect(() => {
    trackHpib("page_view");
  }, []);

  // Compute scale so the phone fits the available section height
  useEffect(() => {
    function measure() {
      if (!phoneSection.current) return;
      const available = phoneSection.current.clientHeight;
      const phoneContainerH = PHONE_H + 60;
      const scale = Math.min(1, available / phoneContainerH);
      setPhoneScale(scale);
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  return (
    <div
      style={{
        height: "100dvh",
        overflow: "hidden",
        backgroundColor: "#000",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "20px 24px 0",
      }}
    >
      {/* Logo */}
      <div style={{ width: "100%", maxWidth: 280, marginBottom: 10, flexShrink: 0 }}>
        <img src={rosterLogo} alt="Roster — less admin, more hockey" style={{ width: "100%", height: "auto" }} />
      </div>

      {/* RosterHockey.com button */}
      <a
        href={WEBSITE_URL}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          width: "100%",
          maxWidth: 280,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 16,
          padding: "12px 24px",
          backgroundColor: "#3b82f6",
          color: "#fff",
          fontWeight: 700,
          fontSize: 17,
          textDecoration: "none",
          marginBottom: 14,
          flexShrink: 0,
        }}
      >
        RosterHockey.com
      </a>

      {/* CTA */}
      <div style={{ textAlign: "center", maxWidth: 300, marginBottom: 14, flexShrink: 0 }}>
        <p style={{ color: "#fff", fontWeight: 700, fontSize: "clamp(1.1rem, 4.5vw, 1.5rem)", lineHeight: 1.25, margin: "0 0 6px" }}>
          Run your team or league through Roster
        </p>
        <p style={{ color: "#3b82f6", fontWeight: 600, fontSize: "clamp(0.9rem, 3.5vw, 1.1rem)", lineHeight: 1.3, margin: 0 }}>
          We'll send&nbsp;10% back to Hockey Players in Business
        </p>
      </div>

      {/* Store buttons */}
      <div style={{ display: "flex", gap: 10, width: "100%", maxWidth: 280, flexShrink: 0 }}>
        <a
          href={APPLE_URL}
          target="_blank"
          rel="noopener noreferrer"
          style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 14, padding: "10px 8px", backgroundColor: "#1a1a1a", border: "1.5px solid #444", color: "#fff", fontWeight: 700, fontSize: 14, textDecoration: "none" }}
          onClick={() => trackHpib("apple_tap")}
        >
          App Store
        </a>
        <a
          href={GOOGLE_URL}
          target="_blank"
          rel="noopener noreferrer"
          style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 14, padding: "10px 8px", backgroundColor: "#1a1a1a", border: "1.5px solid #444", color: "#fff", fontWeight: 700, fontSize: 14, textDecoration: "none" }}
          onClick={() => trackHpib("google_tap")}
        >
          Google Play
        </a>
      </div>

      {/* Phone section — grows to fill remaining space */}
      <div
        ref={phoneSection}
        style={{ flex: 1, minHeight: 0, width: "100%", display: "flex", alignItems: "flex-start", justifyContent: "center", overflow: "hidden" }}
      >
        <IPhoneMockup scale={phoneScale} />
      </div>
    </div>
  );
}
