import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { ChevronDown, ChevronUp, Lock, X } from "lucide-react";

type Tier = { tier: string; threshold: number; imagePath?: string | null; color?: string | null };
type Badge = {
  id: string; name: string; description: string; category: string;
  achievementType?: string | null; imagePath?: string | null; placeholderColor?: string;
  isEarned: boolean; count: number; currentProgress: number; nextThreshold?: number | null;
  earnedTiers: string[]; earnedAt?: string | null; lockedHint?: string | null; tiers: Tier[];
};
type Section = { category: string; label: string; badges: Badge[] };

function BadgeArtwork({ badge, large = false }: { badge: Badge; large?: boolean }) {
  const tier = badge.tiers.find((item) => badge.earnedTiers.includes(item.tier)) ?? badge.tiers.at(-1);
  const imagePath = tier?.imagePath || badge.imagePath;
  const size = large ? "h-44 w-44" : "h-20 w-20";
  return (
    <div className={`${size} relative flex items-center justify-center overflow-hidden rounded-full border-2 ${badge.isEarned ? "border-[#c9a84c]" : "border-[#263c52]"}`}
      style={{ background: badge.isEarned ? (badge.placeholderColor || "#c9a84c") : "#111d29" }}>
      {imagePath ? (
        <img src={imagePath} alt="" className={`h-full w-full object-contain ${badge.isEarned ? "" : "grayscale brightness-[.22]"}`} />
      ) : (
        <span className={`px-2 text-center text-[10px] font-bold uppercase tracking-wider ${badge.isEarned ? "text-[#0a1520]" : "text-[#3a5a7a]"}`}>
          {badge.isEarned ? badge.name : "?"}
        </span>
      )}
      {!badge.isEarned && <span className="absolute text-2xl font-bold text-[#c9a84c]">?</span>}
      {badge.achievementType === "multiplier" && badge.count > 0 && (
        <span className="absolute right-0 top-0 rounded-full bg-[#c9a84c] px-1.5 py-0.5 text-[10px] font-bold text-[#0a1520]">×{badge.count}</span>
      )}
    </div>
  );
}

function Progress({ badge }: { badge: Badge }) {
  if (badge.achievementType !== "tiered" || !badge.nextThreshold) return null;
  const currentTier = badge.tiers.find((tier) => tier.tier === (badge.earnedTiers.at(-1) || badge.tiers[0]?.tier));
  const previous = currentTier?.threshold ?? 0;
  const ratio = Math.min(1, Math.max(0, (badge.currentProgress - previous) / Math.max(1, badge.nextThreshold - previous)));
  return (
    <div className="mt-2 w-full">
      <div className="h-1.5 overflow-hidden rounded-full bg-[#1a2a3a]">
        <div className="h-full rounded-full bg-[#c9a84c] transition-all duration-700" style={{ width: `${ratio * 100}%` }} />
      </div>
      <div className="mt-1 text-center text-[9px] text-[#6c8298]">{badge.currentProgress} / {badge.nextThreshold}</div>
    </div>
  );
}

export default function TrophyCase() {
  const [, navigate] = useLocation();
  const [open, setOpen] = useState<Record<string, boolean>>({ nhl_trophy: true, team_badge: true, achievement: true });
  const [selected, setSelected] = useState<Badge | null>(null);
  const { data, isLoading, isError } = useQuery<{ sections: Section[] }>({ queryKey: ["/api/trophy-case"] });

  return (
    <div className="min-h-screen bg-[#0a1520] px-4 pb-24 pt-6 text-[#e8e4dc] sm:px-8">
      <div className="mx-auto max-w-5xl">
        <button className="mb-5 text-sm text-[#9bb0c4]" onClick={() => navigate("/profile")}>← Profile</button>
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-[.32em] text-[#c9a84c]">Roster Hockey</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">Trophy Case</h1>
          <p className="mt-2 max-w-xl text-sm text-[#8096aa]">Your league awards, team badges, and career achievements.</p>
        </div>
        {isLoading && <div className="rounded-2xl border border-[#20374c] p-8 text-center text-[#8096aa]">Loading your trophy case…</div>}
        {isError && <div className="rounded-2xl border border-red-900/60 bg-red-950/20 p-8 text-center text-red-200">Could not load your trophy case.</div>}
        <div className="space-y-8">
          {data?.sections.map((section) => (
            <section key={section.category}>
              <button className="flex w-full items-center gap-3 text-left" onClick={() => setOpen((value) => ({ ...value, [section.category]: !value[section.category] }))}>
                <span className="h-px flex-1 bg-[#29425b]" />
                <span className="text-xs font-semibold uppercase tracking-[.22em] text-[#3a5a7a]">{section.label}</span>
                {open[section.category] ? <ChevronUp size={15} className="text-[#3a5a7a]" /> : <ChevronDown size={15} className="text-[#3a5a7a]" />}
                <span className="h-px flex-1 bg-[#29425b]" />
              </button>
              {open[section.category] && (
                <div className="mt-5 grid grid-cols-4 gap-3 sm:grid-cols-5 sm:gap-5">
                  {section.badges.map((badge) => (
                    <button key={badge.id} onClick={() => setSelected(badge)} className="group min-w-0 text-center">
                      <div className="relative mx-auto w-fit transition-transform group-hover:-translate-y-1"><BadgeArtwork badge={badge} /></div>
                      <div className={`mt-2 truncate text-[10px] font-semibold uppercase tracking-wider ${badge.isEarned ? "text-[#c9a84c]" : "text-[#3a5a7a]"}`}>
                        {badge.isEarned ? badge.name : "???"}
                      </div>
                      <Progress badge={badge} />
                    </button>
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      </div>
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-5 sm:p-6" onClick={() => setSelected(null)}>
          <div className="w-full max-w-lg rounded-3xl border border-[#c9a84c]/30 bg-[#0d1b2a] p-6" onClick={(event) => event.stopPropagation()}>
            <div className="mb-4 flex justify-end"><button onClick={() => setSelected(null)} className="text-[#8096aa]"><X size={20} /></button></div>
            <div className="flex flex-col items-center text-center"><BadgeArtwork badge={selected} large /></div>
            <h2 className={`mt-5 text-center text-2xl font-bold ${selected.isEarned ? "text-[#c9a84c]" : "text-[#8096aa]"}`}>{selected.isEarned ? selected.name : "???"}</h2>
            <p className="mt-2 text-center text-sm text-[#a6b5c2]">{selected.isEarned ? selected.description : (selected.lockedHint || "Keep playing to discover this badge.")}</p>
            {selected.isEarned && selected.earnedAt && <p className="mt-3 text-center text-xs text-[#8096aa]">Earned {new Date(selected.earnedAt).toLocaleDateString()}</p>}
            {selected.tiers.length > 0 && <div className="mt-6 flex justify-center gap-2">{selected.tiers.map((tier) => <span key={tier.tier} className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase ${selected.earnedTiers.includes(tier.tier) ? "border-[#c9a84c]/60 text-[#c9a84c]" : "border-[#29425b] text-[#3a5a7a]"}`}>{tier.tier} · {tier.threshold}</span>)}</div>}
            {selected.achievementType === "multiplier" && <p className="mt-5 text-center text-xl font-bold text-[#c9a84c]">×{selected.count}</p>}
            {!selected.isEarned && <Lock className="mx-auto mt-5 text-[#3a5a7a]" size={18} />}
          </div>
        </div>
      )}
    </div>
  );
}