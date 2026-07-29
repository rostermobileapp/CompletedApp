import { useEffect } from "react";
import { useLocation } from "wouter";

// Disable browser scroll restoration at module load — before any render.
if (typeof window !== "undefined") {
  window.history.scrollRestoration = "manual";
}

export function ScrollToTop() {
  const [location] = useLocation();

  useEffect(() => {
    // Double-rAF: first frame lets React commit the new route's DOM,
    // second frame fires after the browser has laid it out and painted —
    // so we always win against any late content shifts.
    let id1: number;
    let id2: number;

    id1 = requestAnimationFrame(() => {
      id2 = requestAnimationFrame(() => {
        window.scrollTo({ top: 0, left: 0, behavior: "instant" });
      });
    });

    return () => {
      cancelAnimationFrame(id1);
      cancelAnimationFrame(id2);
    };
  }, [location]);

  return null;
}
