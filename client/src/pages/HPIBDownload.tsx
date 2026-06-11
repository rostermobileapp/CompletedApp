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
          className="flex-1 flex flex-col items-center justify-center gap-2 rounded-2xl px-3 py-4 transition-opacity active:opacity-70"
          style={{ backgroundColor: "#1a1a1a", border: "1.5px solid #444" }}
          aria-label="Download on the App Store"
          onClick={() => trackHpib("apple_tap")}
        >
          <svg viewBox="0 0 814 1000" style={{ width: 28, height: 28 }} fill="white" aria-hidden="true">
            <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76 0-103.7 40.8-165.9 40.8s-105-43.4-150.3-109.2c-46.4-67.8-84.8-180.5-84.8-286.9 0-154.1 100.6-235.4 199.5-235.4 52.6 0 96.5 34.5 130 34.5 32.1 0 82.7-36.4 141.9-36.4 22.6 0 108.2 1.9 164 99.7zm-150.5-157.7c24.4-28.9 41.2-69.1 41.2-109.3 0-5.8-.6-11.6-1.3-17.3-39.5 1.3-86.1 26.3-114.4 58.9-22 25.1-42.1 65.3-42.1 105.5 0 6.4.6 12.9 1.9 18 3.2.6 7.7 1.3 12.2 1.3 35.1 0 79.3-23.1 102.5-57.1z" />
          </svg>
          <div className="flex flex-col items-center leading-tight text-center">
            <span className="text-xs" style={{ color: "#999" }}>Download on the</span>
            <span className="text-white font-bold text-base">App Store</span>
          </div>
        </a>

        <a
          href={GOOGLE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 flex flex-col items-center justify-center gap-2 rounded-2xl px-3 py-4 transition-opacity active:opacity-70"
          style={{ backgroundColor: "#1a1a1a", border: "1.5px solid #444" }}
          aria-label="Get it on Google Play"
          onClick={() => trackHpib("google_tap")}
        >
          <svg viewBox="0 0 24 24" style={{ width: 28, height: 28 }} aria-hidden="true">
            <path d="M3 2.3v19.4l9.7-9.7L3 2.3z" fill="#4fc3f7" />
            <path d="M3 2.3l9.7 9.7 2.9-2.9L5.1 1.1 3 2.3z" fill="#81c784" />
            <path d="M3 21.7l9.7-9.7 2.9 2.9-10.5 6.1L3 21.7z" fill="#f44336" />
            <path d="M12.7 12l4.8-2.8v5.6L12.7 12z" fill="#ffca28" />
            <path d="M12.7 12l2.9-2.9 1.9 1.1L12.7 12z" fill="#ffca28" />
          </svg>
          <div className="flex flex-col items-center leading-tight text-center">
            <span className="text-xs" style={{ color: "#999" }}>Get it on</span>
            <span className="text-white font-bold text-base">Google Play</span>
          </div>
        </a>
      </div>

      {/* iPhone mockup */}
      <div className="mt-10">
        <IPhoneMockup />
      </div>
    </div>
  );
}
