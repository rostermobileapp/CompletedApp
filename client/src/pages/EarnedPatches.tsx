import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { ArrowLeft, ChevronLeft, ChevronRight, Lock } from "lucide-react";
import { FeatureLockOverlay } from "@/components/FeatureLockOverlay";
import { usePermissions } from "@/context/SubscriptionContext";
import { getImageUrl } from "@/lib/queryClient";
import { hasPaidTrophyCaseAccess } from "@shared/trophyCaseAccess";
import { getTrophyCaseAccess } from "./TrophyCase";
import iceBackground from "@/assets/trophy-case-ice.png";
import "./EarnedPatches.css";

type Patch = {
  id: string;
  name: string;
  description: string;
  category: string;
  tier: string | null;
  imagePath: string | null;
  count: number;
  lastEarnedAt: string;
  history: Array<{ awardedAt: string; leagueName: string | null; seasonName: string | null; teamName: string | null; totalReached: number | null }>;
};

export default function EarnedPatches() {
  const [, navigate] = useLocation();
  const [active, setActive] = useState(0);
  const rail = useRef<HTMLDivElement>(null);
  const { user, isLoading: isPermissionsLoading } = usePermissions();
  const hasPaidAccess = hasPaidTrophyCaseAccess(user);
  const access = isPermissionsLoading ? "loading" : getTrophyCaseAccess(user?.dateOfBirth);
  const { data: patches, isLoading, isError, refetch } = useQuery<Patch[]>({
    queryKey: ["/api/trophy-case/earned-patches"],
    enabled: hasPaidAccess && access === "eligible",
    staleTime: 0,
    refetchOnMount: "always",
  });

  useEffect(() => {
    if (!patches?.length) return;
    const card = rail.current?.children[active] as HTMLElement | undefined;
    card?.scrollIntoView({
      block: "nearest",
      inline: "center",
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
    });
  }, [active, patches]);

  const move = (direction: number) => {
    if (!patches?.length) return;
    setActive((current) => Math.max(0, Math.min(patches.length - 1, current + direction)));
  };

  return (
    <FeatureLockOverlay
      isLocked={!isPermissionsLoading && !hasPaidAccess}
      className="min-h-[100dvh]"
    >
    <div className="patch-collection min-h-[100dvh] bg-[#dce5f3] px-3 pb-20 pt-5 text-[#173d5b] sm:px-6 sm:pt-8">
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${iceBackground})` }} />
      <main className="relative mx-auto max-w-6xl">
        <button onClick={() => navigate("/trophy-case")} className="inline-flex items-center gap-2 rounded-lg border border-[#cddbe5] bg-white/90 px-3 py-2 text-xs font-bold hover:border-[#164a73] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#164a73]"><ArrowLeft size={16} /> Trophy Case</button>
        <header className="mx-auto mb-9 mt-7 max-w-2xl text-center">
          <p className="text-[10px] font-bold uppercase tracking-[.24em] text-[#c22a38]">Your collection</p>
          <h1 className="mt-2 text-4xl font-bold tracking-[-.04em] sm:text-5xl">All Earned Patches</h1>
          <p className="mt-3 text-sm text-[#597087]">Every patch you’ve earned, across seasons, teams, and leagues.</p>
        </header>
        {access === "loading" && <div className="patch-message">Verifying your age…</div>}
        {access !== "loading" && access !== "eligible" && (
          <div className="patch-message mx-auto max-w-lg"><Lock className="mx-auto mb-3" size={25} /><h2 className="font-bold">Age verification required</h2><p className="mt-2 text-sm text-[#597087]">{access === "under_21" ? "The Trophy Case is available only to users who are 21 or older." : "Enter your date of birth in your profile to verify that you are 21 or older."}</p><button onClick={() => navigate("/profile")} className="mt-4 rounded-lg bg-[#164a73] px-4 py-2 text-xs font-bold text-white">Go to Profile</button></div>
        )}
        {access === "eligible" && isLoading && <div className="patch-message">Loading your patches…</div>}
        {access === "eligible" && isError && <div className="patch-message">Could not load your patches. <button onClick={() => refetch()} className="ml-2 font-bold underline">Try again</button></div>}
        {access === "eligible" && patches?.length === 0 && <div className="patch-message"><h2 className="text-lg font-bold">No patches yet</h2><p className="mt-2 text-sm text-[#597087]">When you earn your first patch, it will appear here.</p></div>}
        {access === "eligible" && !!patches?.length && (
          <section aria-label="Earned patch collection" className="patch-gallery">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div><p className="text-xs font-bold uppercase tracking-[.15em] text-[#c22a38]">{patches.length} distinct {patches.length === 1 ? "patch" : "patches"}</p><p className="mt-1 text-xs text-[#597087]">Select a patch or scroll sideways to explore.</p></div>
              <div className="flex shrink-0 gap-2">
                <button aria-label="Previous patch" disabled={active === 0} onClick={() => move(-1)} className="patch-arrow"><ChevronLeft size={20} /></button>
                <button aria-label="Next patch" disabled={active === patches.length - 1} onClick={() => move(1)} className="patch-arrow"><ChevronRight size={20} /></button>
              </div>
            </div>
            <div className="patch-rail" ref={rail} role="group" aria-label="Patches; use left and right arrow keys to switch" onKeyDown={(event) => {
              if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
                event.preventDefault();
                const next = Math.max(0, Math.min(patches.length - 1, active + (event.key === "ArrowRight" ? 1 : -1)));
                setActive(next);
                (rail.current?.children[next] as HTMLElement | undefined)?.focus();
              }
            }}>
              {patches.map((patch, index) => (
                <button key={patch.id} type="button" aria-expanded={active === index} aria-label={`${patch.name}${patch.tier ? ` ${patch.tier.replaceAll("_", " ")}` : ""}, earned ${patch.count} ${patch.count === 1 ? "time" : "times"}`} onClick={() => setActive(index)} className={`patch-card ${active === index ? "patch-card-active" : ""}`}>
                  <span className="patch-card-inner">
                    <span className="patch-art">
                      {patch.imagePath ? <img src={getImageUrl(patch.imagePath) ?? undefined} alt="" loading={index < 3 ? "eager" : "lazy"} /> : <span className="patch-art-fallback">{patch.name}</span>}
                      {patch.count > 1 && <span className="patch-repeat">×{patch.count}</span>}
                    </span>
                    <span className="patch-details">
                      <span className="patch-category">{patch.category.replaceAll("_", " ")}{patch.tier ? ` · ${patch.tier.replaceAll("_", " ")}` : ""}</span>
                      <span className="patch-name">{patch.name}</span>
                      <span className="patch-description">{patch.description}</span>
                      <span className="patch-date">Last earned {new Date(patch.lastEarnedAt).toLocaleDateString()}</span>
                    </span>
                    <span className="patch-closed-label" aria-hidden="true">{patch.name}</span>
                  </span>
                </button>
              ))}
            </div>
            <p className="mt-4 text-center font-mono text-xs text-[#597087]">{active + 1} / {patches.length}</p>
            <div className="patch-history" aria-live="polite">
              <h2 className="text-base font-bold">{patches[active].name}{patches[active].tier ? ` · ${patches[active].tier!.replaceAll("_", " ")}` : ""} history</h2>
              <p className="mt-1 text-xs text-[#597087]">{patches[active].count > 1 ? `Earned ×${patches[active].count}` : "Earned once"} · {patches[active].history.length} recorded {patches[active].history.length === 1 ? "event" : "events"}</p>
              <ul className="mt-3 max-h-44 space-y-2 overflow-y-auto">
                {patches[active].history.map((entry, index) => (
                  <li key={`${entry.awardedAt}-${index}`} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-[#d7e2eb] pb-2 text-xs">
                    <span className="font-semibold">{entry.totalReached !== null ? `Total reached ×${entry.totalReached}` : "Awarded"}</span>
                    <span className="text-[#597087]">{[entry.leagueName, entry.teamName, entry.seasonName].filter(Boolean).join(" · ") || "Career award"} · {new Date(entry.awardedAt).toLocaleDateString()}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}
      </main>
    </div>
    </FeatureLockOverlay>
  );
}