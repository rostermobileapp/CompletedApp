import type { CSSProperties } from "react";
import "./birthdayConfetti.css";

const COLORS = ["#d52d3b", "#f1bb4c", "#164a73", "#71a9d2", "#ffffff"];

// CSS confetti works in native WebViews that cannot decode transparent VP9 video.
export function BirthdayConfettiOverlay() {
  return (
    <div className="pointer-events-none fixed inset-0 z-[10003] overflow-hidden motion-reduce:hidden" aria-hidden="true">
      {Array.from({ length: 28 }, (_, index) => (
        <span
          key={index}
          className="birthday-confetti-piece"
          style={{
            left: `${(index * 37 + 7) % 100}%`,
            backgroundColor: COLORS[index % COLORS.length],
            animationDelay: `${(index % 7) * 0.11}s`,
            animationDuration: `${2.2 + (index % 5) * 0.18}s`,
            "--drift": `${(index % 2 === 0 ? 1 : -1) * (15 + index % 6) * 3}px`,
          } as CSSProperties}
        />
      ))}
    </div>
  );
}