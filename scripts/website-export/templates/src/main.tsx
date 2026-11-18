import { createRoot } from "react-dom/client";
import { useEffect } from "react";
import { useLocation } from "wouter";
import { Analytics } from "@vercel/analytics/react";
import { WebsitePage, noindexPaths, pages } from "./pages";
import { installAppAttributionLinks } from "./lib/appAttributionLinks";
import "./index.css";

installAppAttributionLinks(document, () => window.location.href);
function App() {
  const [location] = useLocation();
  useEffect(() => {
    const meta = document.querySelector('meta[name="robots"]') || document.head.appendChild(document.createElement("meta"));
    meta.setAttribute("name", "robots");
    meta.setAttribute("content", noindexPaths.has(location) || !Object.hasOwn(pages, location) ? "noindex, follow" : "index, follow");
  }, [location]);
  return <><WebsitePage pathname={location} />{import.meta.env.PROD && import.meta.env.VITE_ENABLE_ANALYTICS === "true" && <Analytics />}</>;
}
createRoot(document.getElementById("root")!).render(<App />);
