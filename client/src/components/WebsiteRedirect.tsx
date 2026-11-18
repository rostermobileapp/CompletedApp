import { useEffect } from "react";
import { marketingDestination } from "@shared/appWebPolicy";

/** Also handles client-side Links; real document requests use server HTTP 301s. */
export function WebsiteRedirect({ path, search }: { path: string; search: string }) {
  const destination = marketingDestination(path, search);
  useEffect(() => { if (destination) window.location.replace(destination); }, [destination]);
  return destination ? <p role="status">Opening the RosterHockey website… <a href={destination}>Continue</a></p> : null;
}
