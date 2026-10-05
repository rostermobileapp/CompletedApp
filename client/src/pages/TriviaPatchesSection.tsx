import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { ArrowUpRight, Check, ChevronRight, CircleHelp, X } from "lucide-react";
import { apiRequest, getImageUrl } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { findTriviaCategory } from "@/components/triviaVisibility";
import { countEarnedTriviaPatches } from "@shared/triviaPatch";
import "./TriviaPatchesSection.css";

type Tier = { tier: number | string; threshold: number; unlocked_at?: string | null; imagePath?: string | null };
type CategoryPatch = {
  category: string; patch_id: string; name: string; imagePath?: string | null;
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
function formatDate(value?: string | null) {
  if (!value) return "Not yet unlocked";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

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
  const [selected, setSelected] = useState<CategoryPatch | null>(null);
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
      setSelected(null);
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
      setSelected(match);
    }
  }, [enabled, data, requestedCategory, user?.id]);
  const ordered = CATEGORY_ORDER.map((name) => (data?.categories ? findTriviaCategory(data.categories, name) : undefined) ?? (data ? {
    category: name, patch_id: `trivia-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    name, correct_count: 0, current_tier: 0, next_threshold: DEFAULT_THRESHOLDS[0],
    complete: false, tiers: DEFAULT_THRESHOLDS.map((threshold, index) => ({ tier: index + 1, threshold })),
  } : undefined)).filter((item): item is CategoryPatch => !!item);

  function playToday() {
    setSelected(null);
    navigate("/");
    launchTrivia();
  }

  if (!enabled) return null;

  return (
    <section className="trivia-patches trophy-depth-panel mt-5 rounded-2xl p-3.5 sm:p-5" aria-labelledby="trivia-patches-heading">
      <div className="trivia-patches-heading mb-5 flex flex-col gap-3 border-b border-[#d7e2eb] pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[9px] font-bold uppercase tracking-[.25em] text-[#d52d3b]">Daily knowledge · lifetime keepsakes</p>
          <h2 id="trivia-patches-heading" className="mt-1 text-2xl font-bold tracking-tight text-[#173d5b] sm:text-3xl">Trivia Patches</h2>
          <p className="mt-1 max-w-xl text-[11px] leading-relaxed text-[#597087] sm:text-xs">Nine hockey subjects. Every correct answer earns permanent progress.</p>
        </div>
        <button type="button" onClick={playToday} disabled={today?.answered} className="trivia-play-button inline-flex min-h-10 w-fit items-center gap-2 rounded-lg bg-[#164a73] px-4 py-2 text-xs font-bold text-white transition hover:bg-[#103a5b] disabled:cursor-not-allowed disabled:opacity-55">
          {today?.answered ? "Today complete" : "Play today"} <ArrowUpRight size={14} />
        </button>
      </div>
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
      {data && ordered.length > 0 && <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4">
        {ordered.map((patch) => {
          const nextTier = patch.current_tier >= 8 || patch.complete ? 8 : patch.current_tier + 1;
          const target = patch.next_threshold ?? patch.tiers.find((tier) => Number(tier.tier) === nextTier)?.threshold;
          const ratio = target ? Math.min(100, patch.correct_count / target * 100) : patch.complete ? 100 : 0;
          const status = patch.complete ? "Complete" : patch.current_tier ? `Tier ${patch.current_tier}` : "Not started";
          const description = patch.complete ? `${patch.correct_count} correct · Complete` : target ? `${status} · ${patch.correct_count} / ${target} toward Tier ${nextTier}` : `${status} · ${patch.correct_count} correct`;
          const image = patch.imagePath ? getImageUrl(patch.imagePath) : null;
          return <button type="button" key={patch.category} onClick={() => setSelected(patch)} aria-label={`${patch.name} patch, ${description}`} className="trophy-depth-slot trivia-patch-slot group min-w-0 rounded-xl text-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#164a73]">
            <div className="trophy-slot-well">
              {image ? <img src={image} alt="" className="h-16 w-16 object-contain transition-transform duration-200 group-hover:scale-[1.04] sm:h-[4.5rem] sm:w-[4.5rem]" /> : <span aria-hidden="true" className="trophy-depth-medallion flex h-16 w-16 items-center justify-center rounded-full border-2 border-[#b7c9d7] bg-[#edf5fb] text-[10px] font-extrabold uppercase tracking-wide text-[#164a73]">{patch.name.split(/\s+/).map((word) => word[0]).join("").slice(0, 3)}</span>}
              <span className="trivia-patch-name mt-2 max-w-full truncate text-[10px] font-bold uppercase tracking-[.09em]">{patch.name}</span>
              <span className="trivia-patch-status mt-1 text-[9px] font-semibold uppercase tracking-[.12em]">{status}</span>
              <span className="trivia-patch-description mt-1 text-[9px] leading-tight">{description}</span>
              <span className="trophy-depth-track mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[#d8e3eb]" aria-hidden="true"><span className="block h-full rounded-full bg-[#d52d3b] transition-[width] duration-500" style={{ width: `${ratio}%` }} /></span>
            </div>
          </button>;
        })}
      </div>}
      {data?.stats.total_answered === 0 && <p className="mt-4 text-center text-xs text-[#597087]">Answer daily trivia to start earning these patches. Every correct answer stays with you.</p>}
      {selected && <div className="fixed inset-0 z-[10010] flex items-center justify-center bg-[#173d5b]/55 p-4 backdrop-blur-sm" onClick={() => setSelected(null)}>
        <section role="dialog" aria-modal="true" aria-labelledby="trivia-patch-detail-title" className="trivia-patch-detail max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-2xl border p-5 shadow-[0_24px_80px_#173d5b55] sm:p-7" onClick={(event) => event.stopPropagation()}>
          <div className="mb-4 flex justify-end">
            <button type="button" onClick={() => setSelected(null)} aria-label="Close patch details" className="flex h-9 w-9 items-center justify-center rounded-full text-[#718394] transition hover:bg-[#edf3f7]"><X size={18} /></button>
          </div>
          <div className="flex flex-col items-center text-center">
            {selected.imagePath ? <img src={getImageUrl(selected.imagePath) ?? undefined} alt={`${selected.name} patch`} className="h-36 w-36 object-contain" /> : <div aria-hidden="true" className="trophy-depth-medallion flex h-32 w-32 items-center justify-center rounded-full border-2 border-[#b7c9d7] bg-[#edf5fb] text-sm font-extrabold uppercase tracking-wide text-[#164a73]">{selected.name}</div>}
            <p className="text-[9px] font-bold uppercase tracking-[.2em] text-[#d52d3b]">Trivia patch</p>
            <h3 id="trivia-patch-detail-title" className="mt-1 text-2xl font-bold text-[#173d5b]">{selected.name}</h3>
            <p className="mt-1 text-sm text-[#597087]">Lifetime total · {selected.correct_count} correct {selected.complete ? "· Complete" : ""}</p>
          </div>
          <div className="trivia-tier-list mt-6 space-y-2">
            {selected.tiers.slice().sort((a, b) => Number(a.tier) - Number(b.tier)).map((tier) => {
              const unlocked = Number(tier.tier) <= selected.current_tier || !!tier.unlocked_at;
              return <div key={String(tier.tier)} className="trivia-tier-row flex items-center gap-3 rounded-lg border px-3 py-2.5">
                <span className={`flex h-7 w-7 items-center justify-center rounded-full ${unlocked ? "bg-[#dcecf5] text-[#164a73]" : "bg-[#edf1f4] text-[#778b9b]"}`}>{unlocked ? <Check size={15} /> : <CircleHelp size={15} />}</span>
                <span className="flex-1 text-sm font-semibold">Tier {tier.tier} <span className="font-normal text-[#597087]">· {tier.threshold} correct</span></span>
                <span className="text-right text-[10px] text-[#597087]">{unlocked ? formatDate(tier.unlocked_at) : "Not unlocked"}</span>
              </div>;
            })}
          </div>
          {!today?.answered && <button type="button" onClick={playToday} className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#164a73] px-4 text-sm font-bold text-white hover:bg-[#103a5b]">Play today’s trivia <ChevronRight size={16} /></button>}
          {today?.answered && <p className="mt-5 text-center text-xs text-[#597087]">Today’s question is complete. Come back tomorrow for another.</p>}
        </section>
      </div>}
    </section>
  );
}