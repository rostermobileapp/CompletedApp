import rosterLogo from "@assets/less_admin,_more_hockey_1781211414957.png";

const APPLE_URL = "https://apps.apple.com/us/app/roster-hockey/id6756852981";
const GOOGLE_URL =
  "https://play.google.com/store/apps/details?id=com.aFFhvtIzJvyF.natively&utm_source=na_Med";
const WEBSITE_URL = "https://www.rosterhockey.com";

export default function HPIBDownload() {
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
        className="mb-10 text-sm font-semibold tracking-wide transition-opacity active:opacity-60"
        style={{ color: "#3b82f6" }}
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
      <div className="flex flex-col gap-4 w-full max-w-xs">
        {/* App Store */}
        <a
          href={APPLE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-4 rounded-2xl px-5 py-4 transition-opacity active:opacity-70"
          style={{ backgroundColor: "#1a1a1a", border: "1.5px solid #444" }}
          aria-label="Download on the App Store"
        >
          {/* Apple logo — white filled, recognisable */}
          <svg
            viewBox="0 0 814 1000"
            className="shrink-0"
            style={{ width: 32, height: 32 }}
            fill="white"
            aria-hidden="true"
          >
            <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76 0-103.7 40.8-165.9 40.8s-105-43.4-150.3-109.2c-46.4-67.8-84.8-180.5-84.8-286.9 0-154.1 100.6-235.4 199.5-235.4 52.6 0 96.5 34.5 130 34.5 32.1 0 82.7-36.4 141.9-36.4 22.6 0 108.2 1.9 164 99.7zm-150.5-157.7c24.4-28.9 41.2-69.1 41.2-109.3 0-5.8-.6-11.6-1.3-17.3-39.5 1.3-86.1 26.3-114.4 58.9-22 25.1-42.1 65.3-42.1 105.5 0 6.4.6 12.9 1.9 18 3.2.6 7.7 1.3 12.2 1.3 35.1 0 79.3-23.1 102.5-57.1z" />
          </svg>
          <div className="flex flex-col leading-tight">
            <span className="text-xs" style={{ color: "#999" }}>Download on the</span>
            <span className="text-white font-bold text-lg">App Store</span>
          </div>
        </a>

        {/* Google Play */}
        <a
          href={GOOGLE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-4 rounded-2xl px-5 py-4 transition-opacity active:opacity-70"
          style={{ backgroundColor: "#1a1a1a", border: "1.5px solid #444" }}
          aria-label="Get it on Google Play"
        >
          {/* Google Play icon — four coloured triangles */}
          <svg
            viewBox="0 0 24 24"
            className="shrink-0"
            style={{ width: 32, height: 32 }}
            aria-hidden="true"
          >
            <path d="M3 2.3v19.4l9.7-9.7L3 2.3z" fill="#4fc3f7" />
            <path d="M3 2.3l9.7 9.7 2.9-2.9L5.1 1.1 3 2.3z" fill="#81c784" />
            <path d="M3 21.7l9.7-9.7 2.9 2.9-10.5 6.1L3 21.7z" fill="#f44336" />
            <path d="M12.7 12l4.8-2.8v5.6L12.7 12z" fill="#ffca28" />
            <path d="M12.7 12l2.9-2.9 1.9 1.1L12.7 12z" fill="#ffca28" />
          </svg>
          <div className="flex flex-col leading-tight">
            <span className="text-xs" style={{ color: "#999" }}>Get it on</span>
            <span className="text-white font-bold text-lg">Google Play</span>
          </div>
        </a>
      </div>

      {/* Footer */}
      <p className="mt-10 text-center text-xs" style={{ color: "#444" }}>
        Roster · less admin, more hockey
      </p>
    </div>
  );
}
