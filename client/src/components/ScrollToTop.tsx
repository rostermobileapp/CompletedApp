import { useEffect } from "react";
import { useLocation } from "wouter";

// Disable browser scroll restoration at module load — before any render.
if (typeof window !== "undefined") {
  window.history.scrollRestoration = "manual";
}

export function ScrollToTop() {
  const [location] = useLocation();

  useEffect(() => {
    // Attempt 1: immediate — catches most cases
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;

    // Attempt 2: after React commits new DOM (double-rAF)
    let raf1: number, raf2: number;
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        window.scrollTo({ top: 0, left: 0, behavior: "instant" });
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
      });
    });

    // Attempt 3: 200ms backstop — fires after Radix focus management,
    // image layout shifts, and any other async content that follows mount.
    const timer = setTimeout(() => {
      window.scrollTo({ top: 0, left: 0, behavior: "instant" });
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    }, 200);

    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      clearTimeout(timer);
    };
  }, [location]);

  return null;
}
