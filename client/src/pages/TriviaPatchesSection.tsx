import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { ArrowUpRight, ChevronDown } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { findTriviaCategory } from "@/components/triviaVisibility";
import { TriviaPatchTiers, type TriviaPatchTier } from "@/components/TriviaPatchTiers";
import { countEarnedTriviaPatches } from "@shared/triviaPatch";
import "./TriviaPatchesSection.css";

type Tier = TriviaPatchTier;
type CategoryPatch = {
  category: string; patch_id: string; name: string; imagePath?: string | null;
  description?: string | null;
  correct_count: number; current_tier: number; next_threshold: number | null;
  complete: boolean; tiers: Tier[];
};
type PatchData = {
  categories: CategoryPatch[];
  stats: { total_answered: number; total_correct: number; accuracy: number; current_streak: number; best_streak: number };
};
type Today = { date: string; answered: boolean };

const CATEGORY_ORDER = [
  "NHL History", "Stanley Cup", "Players & Legends", "Records & Stats",
  "Teams & Franchises", "Hockey Culture", "Movies & Media", "Nicknames & Slang", "Arenas & Fans",
];
const DEFAULT_THRESHOLDS = [1, 5, 10, 25, 50, 100, 150, 200];

function launchTrivia() {
  window.setTimeout(() => window.dispatchEvent(new CustomEvent("roster:trivia-open")), 180);
}

export function TriviaPatchesSection({ enabled = true, onEarnedCountChange }: {
  enabled?: boolean;
  onEarnedCountChange?: (count: number) => void;
}) {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const patchKey = ["/api/trivia/patches", user?.id] as const;
  const [expanded, setExpanded] = useState(false);
  const [deepLink, setDeepLink] = useState<{ categoryName: string; token: string } | null>(null);
  const { data, isLoading, isError, refetch } = useQuery<PatchData>({
    queryKey: patchKey,
    queryFn: async () => (await apiRequest("GET", "/api/trivia/patches")).json(),
    enabled,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
  useEffect(() => {
    onEarnedCountChange?.(enabled ? countEarnedTriviaPatches(data?.categories) : 0);
  }, [enabled, data, onEarnedCountChange]);
  const { data: today } = useQuery<Today>({
    queryKey: ["/api/trivia/today", user?.id],
    queryFn: async () => (await apiRequest("GET", "/api/trivia/today")).json(),
    enabled,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
  const openedFromQuery = useRef<string | null>(null);
  useEffect(() => {
    if (!enabled) {
      setDeepLink(null);
      void queryClient.removeQueries({ queryKey: patchKey, exact: true });
    }
  }, [enabled, queryClient, user?.id]);
  const requestedCategory = typeof window === "undefined"
    ? null
    : new URLSearchParams(window.location.search).get("triviaCategory");
  useEffect(() => {
    if (!enabled || !data || !requestedCategory) return;
    const requestId = `${user?.id || ""}:${requestedCategory}`;
    if (openedFromQuery.current === requestId) return;
    const match = data.categories ? findTriviaCategory(data.categories, requestedCategory) : undefined;
    if (match) {
      openedFromQuery.current = requestId;
      setExpanded(true);
      setDeepLink({ categoryName: match.name, token: requestId });
    }
  }, [enabled, data, requestedCategory, user?.id]);
  const ordered = CATEGORY_ORDER.map((name) => (data?.categories ? findTriviaCategory(data.categories, name) : undefined) ?? (data ? {
    category: name, patch_id: `trivia-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    name, correct_count: 0, current_tier: 0, next_threshold: DEFAULT_THRESHOLDS[0],
    complete: false, tiers: DEFAULT_THRESHOLDS.map((threshold, index) => ({ tier: index + 1, threshold })),
  } : undefined)).filter((item): item is CategoryPatch => !!item);

  function playToday() {
    navigate("/");
    launchTrivia();
  }

  if (!enabled) return null;

  return (
    <section className="trivia-patches trophy-depth-panel mt-5 rounded-2xl p-3.5 sm:p-5" aria-labelledby="trivia-patches-heading">
      <div className="trivia-patches-heading mb-5 flex flex-col gap-3 border-b border-[#d7e2eb] pb-4 sm:flex-row sm:items-end sm:justify-between">
        <h2 id="trivia-patches-heading" className="flex min-w-0 flex-1">
        <button type="button" aria-expanded={expanded} aria-controls="trivia-patches-content" onClick={() => setExpanded((open) => !open)} className="flex min-h-12 w-full items-center gap-3 rounded-md text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#164a73]">
          <span className="min-w-0 flex-1">
            <span className="block text-[9px] font-bold uppercase tracking-[.25em] text-[#d52d3b]">Daily knowledge · lifetime keepsakes</span>
            <span className="mt-1 block text-2xl font-bold tracking-tight text-[#173d5b] sm:text-3xl">Trivia Patches</span>
            <span className="mt-1 block max-w-xl text-[11px] leading-relaxed text-[#597087] sm:text-xs">Nine hockey subjects. Every correct answer earns permanent progress.</span>
          </span>
          <span className="shrink-0 rounded-full bg-[#e8f0f6] px-2.5 py-1 font-mono text-[9px] uppercase tracking-wider text-[#164a73]">9 categories</span>
          <ChevronDown aria-hidden="true" size={19} className={`shrink-0 text-[#164a73] transition-transform duration-200 ${expanded ? "rotate-180" : ""}`} />
        </button>
        </h2>
        <button type="button" onClick={playToday} disabled={today?.answered} className="trivia-play-button inline-flex min-h-10 w-fit items-center gap-2 rounded-lg bg-[#164a73] px-4 py-2 text-xs font-bold text-white transition hover:bg-[#103a5b] disabled:cursor-not-allowed disabled:opacity-55">
          {today?.answered ? "Today complete" : "Play today"} <ArrowUpRight size={14} />
        </button>
      </div>
      <div id="trivia-patches-content" hidden={!expanded}>
        {isLoading && <div aria-label="Loading trivia patches" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{Array.from({ length: 8 }, (_, index) => <div key={index} className="trivia-loading-slot h-48 animate-pulse rounded-xl" />)}</div>}
        {isError && <div className="trivia-error-state rounded-xl border p-5 text-center text-sm"><p>Couldn’t load your trivia patches.</p><button type="button" onClick={() => void refetch()} className="mt-2 font-bold underline underline-offset-4">Try again</button></div>}
        {data && <div className="trivia-stats mb-5 grid grid-cols-2 gap-2 sm:grid-cols-5" aria-label="Trivia lifetime summary">
          {[
            ["Answered", data.stats.total_answered], ["Correct", data.stats.total_correct],
            ["Accuracy", `${Number(data.stats.accuracy || 0).toFixed(1)}%`],
            ["Current streak", data.stats.current_streak], ["Best streak", data.stats.best_streak],
          ].map(([label, value]) => <div key={String(label)} className="trivia-stat rounded-lg border px-3 py-2.5">
            <div className="font-mono text-lg font-bold">{value}</div>
            <div className="text-[9px] font-bold uppercase tracking-[.12em]">{label}</div>
          </div>)}
        </div>}
        {data && ordered.length === 0 && <div className="trivia-empty-state rounded-xl border border-dashed p-6 text-center text-sm">Trivia patch details are being prepared. Your answers still count.</div>}
        {data && ordered.length > 0 && <div className="space-y-3">
          {ordered.map((patch) => (
            <TriviaPatchTiers
              key={patch.category}
              categoryName={patch.name}
              description={patch.description || `Lifetime trivia progress for ${patch.name}. Correct answers earn permanent tier progress, and progress does not reset.`}
              currentTier={patch.current_tier}
              correctCount={patch.correct_count}
              tiers={patch.tiers}
              autoExpandToken={deepLink?.categoryName === patch.name ? deepLink.token : null}
            />
          ))}
        </div>}
        {data?.stats.total_answered === 0 && <p className="mt-4 text-center text-xs text-[#597087]">Answer daily trivia to start earning these patches. Every correct answer stays with you.</p>}
      </div>
    </section>
  );
}