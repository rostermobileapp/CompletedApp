import rosterLogo from "@assets/less_admin,_more_hockey_1781211414957.png";

const APPLE_URL = "https://apps.apple.com/us/app/roster-hockey/id6756852981";
const GOOGLE_URL =
  "https://play.google.com/store/apps/details?id=com.aFFhvtIzJvyF.natively&utm_source=na_Med";

function AppleBadge() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 814 250"
      className="h-8 w-auto"
      aria-hidden="true"
    >
      <rect width="814" height="250" rx="40" fill="#000" />
      <rect
        x="2"
        y="2"
        width="810"
        height="246"
        rx="38"
        fill="none"
        stroke="#a6a6a6"
        strokeWidth="4"
      />
      <text
        x="270"
        y="88"
        fill="#fff"
        fontFamily="-apple-system,Helvetica,Arial,sans-serif"
        fontSize="52"
        fontWeight="300"
        letterSpacing="-1"
      >
        Download on the
      </text>
      <text
        x="270"
        y="178"
        fill="#fff"
        fontFamily="-apple-system,Helvetica,Arial,sans-serif"
        fontSize="86"
        fontWeight="600"
        letterSpacing="-2"
      >
        App Store
      </text>
      {/* Apple logo */}
      <path
        d="M163 61c-9 1-19 7-25 15-5 7-10 18-8 29 10 1 20-5 26-13 6-8 10-19 7-31z"
        fill="#fff"
      />
      <path
        d="M155 107c-14 0-20-9-37-9-16 0-41 14-41 50 0 31 20 69 40 69 9 0 17-6 28-6s20 6 30 6c21 0 38-36 38-36s-22-11-22-34c0-20 16-30 17-31-10-14-25-15-31-15-14 0-22 6-22 6z"
        fill="#fff"
      />
    </svg>
  );
}

function GooglePlayBadge() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 646 250"
      className="h-8 w-auto"
      aria-hidden="true"
    >
      <rect width="646" height="250" rx="40" fill="#000" />
      <rect
        x="2"
        y="2"
        width="642"
        height="246"
        rx="38"
        fill="none"
        stroke="#a6a6a6"
        strokeWidth="4"
      />
      <text
        x="210"
        y="88"
        fill="#fff"
        fontFamily="-apple-system,Helvetica,Arial,sans-serif"
        fontSize="52"
        fontWeight="300"
        letterSpacing="-1"
      >
        GET IT ON
      </text>
      <text
        x="210"
        y="178"
        fill="#fff"
        fontFamily="-apple-system,Helvetica,Arial,sans-serif"
        fontSize="86"
        fontWeight="600"
        letterSpacing="-2"
      >
        Google Play
      </text>
      {/* Play triangle */}
      <path d="M72 60l88 65-88 65V60z" fill="#fff" />
      <path d="M72 60l48 48-48 17V60z" fill="#00c853" />
      <path d="M72 190l48-48-48-17v65z" fill="#ff3d00" />
      <path d="M160 125l28 20-28 20v-40z" fill="#ffd600" />
    </svg>
  );
}

export default function HPIBDownload() {
  return (
    <div
      className="min-h-screen w-full flex flex-col items-center justify-center px-6 py-12"
      style={{ backgroundColor: "#000", minHeight: "100dvh" }}
    >
      {/* Logo */}
      <div className="mb-10 w-full max-w-xs">
        <img
          src={rosterLogo}
          alt="Roster — less admin, more hockey"
          className="w-full h-auto object-contain"
        />
      </div>

      {/* CTA */}
      <div className="text-center max-w-sm mb-12 space-y-4">
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
      <div className="flex flex-col gap-5 w-full max-w-xs">
        <a
          href={APPLE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-3 rounded-2xl px-6 py-4 text-white font-semibold text-lg transition-opacity active:opacity-70"
          style={{ backgroundColor: "#111", border: "1px solid #333" }}
          aria-label="Download on the App Store"
        >
          {/* Apple logo */}
          <svg
            viewBox="0 0 814 1000"
            className="w-7 h-7 shrink-0"
            fill="white"
            aria-hidden="true"
          >
            <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76 0-103.7 40.8-165.9 40.8s-105-43.4-150.3-109.2c-46.4-67.8-84.8-180.5-84.8-286.9 0-154.1 100.6-235.4 199.5-235.4 52.6 0 96.5 34.5 130 34.5 32.1 0 82.7-36.4 141.9-36.4 22.6 0 108.2 1.9 164 99.7zm-150.5-157.7c24.4-28.9 41.2-69.1 41.2-109.3 0-5.8-.6-11.6-1.3-17.3-39.5 1.3-86.1 26.3-114.4 58.9-22 25.1-42.1 65.3-42.1 105.5 0 6.4.6 12.9 1.9 18 3.2.6 7.7 1.3 12.2 1.3 35.1 0 79.3-23.1 102.5-57.1z" />
          </svg>
          <span>Download on the App Store</span>
        </a>

        <a
          href={GOOGLE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-3 rounded-2xl px-6 py-4 text-white font-semibold text-lg transition-opacity active:opacity-70"
          style={{ backgroundColor: "#111", border: "1px solid #333" }}
          aria-label="Get it on Google Play"
        >
          {/* Google Play triangle */}
          <svg
            viewBox="0 0 24 24"
            className="w-7 h-7 shrink-0"
            aria-hidden="true"
          >
            <defs>
              <linearGradient id="gp-a" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#00c853" />
                <stop offset="100%" stopColor="#b2ff59" />
              </linearGradient>
              <linearGradient id="gp-b" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#ea6100" />
                <stop offset="100%" stopColor="#ff3d00" />
              </linearGradient>
              <linearGradient id="gp-c" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#3d8ffe" />
                <stop offset="100%" stopColor="#0051bc" />
              </linearGradient>
            </defs>
            <path d="M3 2.3L14.3 12 3 21.7V2.3z" fill="url(#gp-c)" />
            <path d="M3 2.3l11.3 9.7-3.6 3.1L3 2.3z" fill="url(#gp-a)" />
            <path d="M3 21.7l7.7-6.6 3.6 3.1L3 21.7z" fill="url(#gp-b)" />
            <path d="M14.3 12l5.4 3.1-5.4 3.1V12z" fill="#ffd600" />
            <path d="M14.3 12V5.8l5.4 3.1L14.3 12z" fill="#ffd600" />
          </svg>
          <span>Get it on Google Play</span>
        </a>
      </div>

      {/* Footer note */}
      <p className="mt-10 text-center text-xs" style={{ color: "#555" }}>
        Roster · less admin, more hockey
      </p>
    </div>
  );
}
