import { useEffect } from "react";
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

function IPhoneMockup() {
  const PHONE_W = 260;
  const PHONE_H = 530;
  const RADIUS = 38;
  const BORDER = 10;
  const SCREEN_W = PHONE_W - BORDER * 2;
  const SCREEN_H = PHONE_H - BORDER * 2;

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
      }}
    >
      {/* Phone body */}
      <div
        style={{
          position: "relative",
          width: PHONE_W,
          height: PHONE_H,
          borderRadius: RADIUS,
          background: "linear-gradient(145deg, #2a2a2a 0%, #111 60%, #1c1c1e 100%)",
          boxShadow:
            "0 0 0 1px #3a3a3c, 2px 4px 12px rgba(0,0,0,0.6), 8px 16px 48px rgba(0,0,0,0.8), -2px -2px 6px rgba(255,255,255,0.04)",
          transform: "rotateX(28deg) rotateY(-18deg) rotateZ(6deg)",
          transformStyle: "preserve-3d",
        }}
      >
        {/* Volume buttons — left side */}
        {[80, 130, 175].map((top, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              left: -5,
              top,
              width: 4,
              height: i === 0 ? 30 : 52,
              borderRadius: 2,
              background: "linear-gradient(to right, #1a1a1a, #3a3a3c)",
              boxShadow: "-1px 0 2px rgba(0,0,0,0.5)",
            }}
          />
        ))}
        {/* Power button — right side */}
        <div
          style={{
            position: "absolute",
            right: -5,
            top: 140,
            width: 4,
            height: 72,
            borderRadius: 2,
            background: "linear-gradient(to left, #1a1a1a, #3a3a3c)",
            boxShadow: "1px 0 2px rgba(0,0,0,0.5)",
          }}
        />

        {/* Screen bezel */}
        <div
          style={{
            position: "absolute",
            inset: BORDER,
            borderRadius: RADIUS - BORDER,
            background: "#000",
            overflow: "hidden",
          }}
        >
          {/* App screenshot */}
          <img
            src="/roster-app-screenshot.png"
            alt="Roster app"
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              objectPosition: "top",
              display: "block",
            }}
          />

          {/* Dynamic Island overlay */}
          <div
            style={{
              position: "absolute",
              top: 12,
              left: "50%",
              transform: "translateX(-50%)",
              width: 90,
              height: 26,
              borderRadius: 13,
              background: "#000",
              zIndex: 10,
            }}
          />

          {/* Subtle screen glare */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "linear-gradient(135deg, rgba(255,255,255,0.07) 0%, transparent 45%)",
              pointerEvents: "none",
              zIndex: 5,
            }}
          />
        </div>

        {/* USB-C port */}
        <div
          style={{
            position: "absolute",
            bottom: 14,
            left: "50%",
            transform: "translateX(-50%)",
            width: 48,
            height: 7,
            borderRadius: 3.5,
            background: "#0a0a0a",
            boxShadow: "inset 0 1px 2px rgba(0,0,0,0.8), 0 0 0 1px #2a2a2a",
          }}
        />

        {/* Top speaker pill */}
        <div
          style={{
            position: "absolute",
            top: 14,
            left: "50%",
            transform: "translateX(-50%)",
            width: 36,
            height: 5,
            borderRadius: 2.5,
            background: "#0a0a0a",
            boxShadow: "inset 0 1px 2px rgba(0,0,0,0.8)",
          }}
        />

        {/* Edge highlight — top-left rim catches light */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: RADIUS,
            pointerEvents: "none",
            boxShadow: "inset 1px 1px 0 rgba(255,255,255,0.12), inset -1px -1px 0 rgba(0,0,0,0.3)",
          }}
        />
      </div>
    </div>
  );
}

export default function HPIBDownload() {
  useEffect(() => {
    trackHpib("page_view");
  }, []);

  return (
    <div
      className="min-h-screen w-full flex flex-col items-center px-6 pt-10 pb-12"
      style={{ backgroundColor: "#000", minHeight: "100dvh" }}
    >
      {/* Logo */}
      <div className="w-full max-w-xs mb-6">
        <img
          src={rosterLogo}
          alt="Roster — less admin, more hockey"
          className="w-full h-auto object-contain"
        />
      </div>

      {/* RosterHockey.com button */}
      <a
        href={WEBSITE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="mb-10 w-full max-w-xs flex items-center justify-center rounded-2xl px-6 py-4 text-white font-bold text-lg tracking-wide transition-opacity active:opacity-70"
        style={{ backgroundColor: "#3b82f6" }}
      >
        RosterHockey.com
      </a>

      {/* CTA */}
      <div className="text-center max-w-sm mb-10 space-y-4">
        <p
          className="text-white font-bold leading-tight"
          style={{ fontSize: "clamp(1.35rem, 5vw, 1.75rem)" }}
        >
          Run your team or league through Roster
        </p>
        <p
          className="leading-snug"
          style={{
            color: "#3b82f6",
            fontSize: "clamp(1.05rem, 4vw, 1.3rem)",
            fontWeight: 600,
          }}
        >
          We'll send&nbsp;10% back to Hockey Players in Business
        </p>
      </div>

      {/* Store buttons */}
      <div className="flex flex-row gap-3 w-full max-w-xs">
        <a
          href={APPLE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 flex items-center justify-center rounded-2xl px-3 py-3 transition-opacity active:opacity-70"
          style={{ backgroundColor: "#1a1a1a", border: "1.5px solid #444" }}
          aria-label="Download on the App Store"
          onClick={() => trackHpib("apple_tap")}
        >
          <span className="text-white font-bold text-sm text-center leading-tight">App Store</span>
        </a>

        <a
          href={GOOGLE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 flex items-center justify-center rounded-2xl px-3 py-3 transition-opacity active:opacity-70"
          style={{ backgroundColor: "#1a1a1a", border: "1.5px solid #444" }}
          aria-label="Get it on Google Play"
          onClick={() => trackHpib("google_tap")}
        >
          <span className="text-white font-bold text-sm text-center leading-tight">Google Play</span>
        </a>
      </div>

      {/* iPhone mockup */}
      <div className="mt-2">
        <IPhoneMockup />
      </div>
    </div>
  );
}
