import type { ReactNode } from "react";
export const setPageTransitionDirection = (_direction: "left" | "right" | "up" | "down") => {};
export function PageTransition({ children }: { children: ReactNode }) {
  return <div className="w-full min-h-screen bg-background">{children}</div>;
}
