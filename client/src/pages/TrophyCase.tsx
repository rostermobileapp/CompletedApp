import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { ArrowLeft, ChevronRight, Lock, Sparkles, Trophy, X } from "lucide-react";
import { BadgeEarnedAnnouncement } from "@/components/BadgeEarnedHost";
import { getImageUrl } from "@/lib/queryClient";
import iceBackground from "@/assets/trophy-case-ice.png";
import "./TrophyCase.css";

type Tier = { tier: string; threshold: number; imagePath?: string | null; color?: string | null };
type Badge = {
  id: string; slug: string; name: string; description: string; category: string;
  achievementType?: string | null; imagePath?: string | null; placeholderColor?: string;
  isEarned: boolean; count: number; currentProgress: number; nextThreshold?: number | null;
  earnedTiers: string[]; earnedAt?: string | null; lockedHint?: string | null; tiers: Tier[];
  legacyAwards?: Array<{ tier: string | null; awardedAt: string | null }>;
};
type Section = { category: string; label: string; badges: Badge[] };
type TrophyCaseData = {
  sections: Section[];
  isGoalie: boolean;
  hatTrickSeasons: Array<{ id: string; name: string }>;
  selectedHatTrickSeasonId: string | null;
};
type SelectedBadge = { badge: Badge; tier?: Tier };
type TrophyCaseAccess = "eligible" | "missing_dob" | "invalid_dob" | "under_21" | "testing";

const ACHIEVEMENT_SECTIONS = [
  { key: "three_stars", label: "3 Stars", description: "First star: 3 points · second: 2 · third: 1. Every point counts toward your tiers.", slug: "three_stars" },
  { key: "beer_me", label: "Beer Me", description: "Beer count and tier progress reset every January 1.", slug: "beer_me" },
  { key: "century_club", label: "Century Club", description: "Games and scrimmages played this calendar year. Resets January 1.", slug: "century_club" },
  { key: "hat_trick", label: "Hat Trick", description: "One game with 3 or more goals counts as one hat trick. Progress resets each season.", slug: "hat_trick" },
  { key: "on_fire", label: "On Fire", description: "Longest goal-scoring streak this season. Progress resets each season.", slug: "on_fire" },
  { key: "iron_man", label: "Iron Man", description: "Games only. Miss one and your current streak resets; seasons and years do not reset it. Earned tiers stay earned.", slug: "iron_man" },
  { key: "early_bird", label: "Early Bird", description: "RSVP Yes at least 48 hours before every eligible game. A new season starts fresh.", slug: "early_bird" },
  { key: "one_time", label: "One Time Badges", description: "Permanent and repeatable achievements.", types: ["onetime", "multiplier"] },
  { key: "shutouts", label: "Locked In", description: "Goalie-only lifetime shutouts. Progress never resets by season or year.", slug: "broom", goalieOnly: true },
] as const;

function getTrophyCaseAccess(dateOfBirth: string | null | undefined, today = new Date()): TrophyCaseAccess {
  if (!dateOfBirth) return "missing_dob";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOfBirth);
  if (!match) return "invalid_dob";
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  const parsed = new Date(year, month - 1, day);
  if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day || parsed > today) return "invalid_dob";
  let age = today.getFullYear() - year;
  if (today.getMonth() < month - 1 || (today.getMonth() === month - 1 && today.getDate() < day)) age -= 1;
  return age >= 21 ? "eligible" : "under_21";
}

function formatTier(tier: string) { return tier.replace("_", " "); }

function isBadgeOrTierEarned({ badge, tier }: SelectedBadge) {
  if (!tier) return badge.isEarned;
  return badge.earnedTiers.includes(tier.tier) || (badge.slug !== "iron_man" && badge.currentProgress >= tier.threshold);
}

function BadgeArtwork({ badge, tier, earned = badge.isEarned, large = false }: { badge: Badge; tier?: Tier; earned?: boolean; large?: boolean }) {
  const imagePath = tier?.imagePath || badge.imagePath;
  const hasArtwork = earned && !!imagePath;
  return (
    <div className={`${large ? "h-52 w-52 sm:h-64 sm:w-64" : "h-16 w-16 sm:h-[4.5rem] sm:w-[4.5rem]"} relative flex items-center justify-center ${hasArtwork ? "bg-transparent" : `trophy-depth-medallion overflow-hidden rounded-full border-2 ${earned ? "border-[#b7c9d7] bg-[#edf5fb]" : "border-[#aebfce] bg-[#e8eef3]"}`}`}>
      {earned && imagePath ? <img src={getImageUrl(imagePath) ?? undefined} alt={`${badge.name}${tier ? ` ${formatTier(tier.tier)}` : ""}`} className="h-full w-full object-contain" /> : earned ? (
        <span className="px-2 text-center text-[9px] font-extrabold uppercase leading-tight tracking-[.08em] text-[#b52732]">{badge.name}</span>
      ) : <Lock size={17} className="text-[#728699]" />}
      {!tier && badge.achievementType === "multiplier" && badge.count > 0 && <span className="absolute -right-1 -top-1 rounded-full bg-[#164a73] px-1.5 py-0.5 text-[10px] font-bold text-white">×{badge.count}</span>}
    </div>
  );
}

function TierProgress({ badge, tier }: { badge: Badge; tier: Tier }) {
  const value = Math.min(Math.max(badge.currentProgress, 0), tier.threshold);
  return (
    <div className="mt-3 w-full">
      <div className="trophy-depth-track h-1.5 overflow-hidden rounded-full bg-[#d8e3eb]"><div className="h-full rounded-full bg-[#d52d3b] transition-all duration-700" style={{ width: `${Math.min(1, value / Math.max(1, tier.threshold)) * 100}%` }} /></div>
      <div className="mt-1 text-center font-mono text-[10px] text-[#597087]">{value} / {tier.threshold}</div>
    </div>
  );
}

function TierSpot({ badge, tier, onClick, preview = false }: { badge: Badge; tier: Tier; onClick: () => void; preview?: boolean }) {
  const earned = badge.earnedTiers.includes(tier.tier) || (badge.slug !== "iron_man" && badge.currentProgress >= tier.threshold);
  return (
    <button onClick={onClick} className="trophy-depth-slot group min-w-0 rounded-xl text-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#164a73]" aria-label={`${badge.name} ${formatTier(tier.tier)}: ${Math.min(badge.currentProgress, tier.threshold)} of ${tier.threshold}`}>
      <div className="trophy-slot-well">
        <div className="mx-auto w-fit transition-transform group-hover:scale-[1.04]"><BadgeArtwork badge={badge} tier={tier} earned={earned} /></div>
        <div className={`mt-2 text-[10px] font-bold uppercase tracking-[.1em] ${earned ? "text-[#164a73]" : "text-[#597087]"}`}>Tier {badge.tiers.findIndex((item) => item.tier === tier.tier) + 1}</div>
        <div className="mt-1 text-[10px] uppercase tracking-wider text-[#566e82]">{formatTier(tier.tier)}</div>
        <div className={`mt-1 text-[9px] font-semibold uppercase tracking-[.12em] ${earned ? "text-[#d52d3b]" : "text-[#50687b]"}`}>{preview ? "Preview" : earned ? "Earned" : "In progress"}</div>
        <TierProgress badge={badge} tier={tier} />
      </div>
    </button>
  );
}

function BadgeSpot({ badge, onClick, preview = false }: { badge: Badge; onClick: () => void; preview?: boolean }) {
  return (
    <button onClick={onClick} className="trophy-depth-slot group min-w-0 rounded-xl text-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#164a73]">
      <div className="trophy-slot-well">
        <div className="mx-auto w-fit transition-transform group-hover:scale-[1.04]"><BadgeArtwork badge={badge} /></div>
        <div className={`mt-2 max-w-full truncate text-[10px] font-bold uppercase tracking-[.09em] ${badge.isEarned ? "text-[#164a73]" : "text-[#50687b]"}`}>{badge.isEarned ? badge.name : "???"}</div>
        <div className={`mt-1 text-[9px] font-semibold uppercase tracking-[.12em] ${badge.isEarned ? "text-[#d52d3b]" : "text-[#50687b]"}`}>{preview ? "Preview" : badge.isEarned ? "Earned" : "Locked"}</div>
        {badge.achievementType === "multiplier" && <div className="mt-1 text-[9px] text-[#50687b]">{badge.count} earned</div>}
      </div>
    </button>
  );
}

function SectionHeading({ label, description, count }: { label: string; description: string; count?: number }) {
  return <div className="mb-4 flex items-end justify-between gap-3 border-b border-[#d7e2eb] pb-3"><div className="min-w-0"><h3 className="text-base font-bold tracking-tight text-[#173d5b] sm:text-lg">{label}</h3><p className="mt-1 text-[11px] leading-relaxed text-[#718394] sm:text-xs">{description}</p></div>{count !== undefined && <span className="shrink-0 rounded-full bg-[#e8f0f6] px-2.5 py-1 font-mono text-[9px] uppercase tracking-wider text-[#164a73]">{count} {count === 1 ? "award" : "spots"}</span>}</div>;
}

function AchievementSection({ label, description, badges, onSelect, preview = false }: { label: string; description: string; badges: Badge[]; onSelect: (badge: Badge, tier?: Tier) => void; preview?: boolean }) {
  const isTiered = badges.some((badge) => badge.achievementType === "tiered");
  const spotCount = isTiered ? badges.reduce((total, badge) => total + (badge.achievementType === "tiered" ? badge.tiers.length : 1), 0) : badges.length;
  const fiveStars = badges.length === 1 && (badges[0].slug === "three_stars" || badges[0].slug === "century_club");
  const legacyBadge = badges.find((badge) =>
    (badge.slug === "hat_trick" || badge.slug === "beer_me" || badge.slug === "on_fire") && badge.legacyAwards?.length);
  const legacyAwards = legacyBadge?.legacyAwards ?? [];
  return (
    <section className="trophy-depth-section rounded-2xl p-3.5 sm:p-5">
      <SectionHeading label={label} description={description} count={spotCount} />
      <div className={`grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 ${fiveStars ? "lg:grid-cols-5" : "lg:grid-cols-4"}`}>
        {badges.flatMap((badge) => badge.achievementType === "tiered"
          ? badge.tiers.map((tier) => <TierSpot key={`${badge.id}-${tier.tier}`} badge={badge} tier={tier} preview={preview} onClick={() => onSelect(badge, tier)} />)
          : [<BadgeSpot key={badge.id} badge={badge} preview={preview} onClick={() => onSelect(badge)} />])}
      </div>
      {legacyAwards.length > 0 && (
        <p className="mt-3 text-xs text-[#597087]">
          Earlier {legacyBadge?.name} awards: {legacyAwards.map((award) => award.tier ? formatTier(award.tier) : "Badge").join(", ")}.
          These remain in your history but do not count toward {legacyBadge?.slug === "beer_me" ? "this year’s" : "the selected season’s"} progress.
        </p>
      )}
    </section>
  );
}

function otherAchievements(badges: Badge[]) {
  return badges.filter((badge) => !ACHIEVEMENT_SECTIONS.some((group) =>
    "slug" in group ? group.slug === badge.slug : group.types.includes(badge.achievementType as "onetime" | "multiplier"),
  ));
}

export function TrophyCasePreview() {
  return <TrophyCase preview />;
}

export default function TrophyCase({ preview = false }: { preview?: boolean } = {}) {
  const [, navigate] = useLocation();
  const [hatTrickSeasonId, setHatTrickSeasonId] = useState<string | null>(null);
  const [selected, setSelected] = useState<SelectedBadge | null>(null);
  const [revealingId, setRevealingId] = useState<string | null>(null);
  const [announcementPreview, setAnnouncementPreview] = useState<SelectedBadge | null>(null);
  const [announcementCycle, setAnnouncementCycle] = useState(0);
  const { data: user, isLoading: isUserLoading } = useQuery<{ displayId?: string | null; dateOfBirth?: string | null }>({ queryKey: ["/api/user"], enabled: !preview });
  const ageAccess = preview ? "eligible" : isUserLoading ? "loading" : user?.displayId !== "U00001" ? "testing" : getTrophyCaseAccess(user?.dateOfBirth);
  const { data, isLoading, isError } = useQuery<TrophyCaseData>({
    queryKey: [preview
      ? "/api/dev/trophy-case-preview"
      : `/api/trophy-case${hatTrickSeasonId ? `?seasonId=${encodeURIComponent(hatTrickSeasonId)}` : ""}`],
    enabled: ageAccess === "eligible",
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });
  const selectBadge = (badge: Badge, tier?: Tier) => {
    const revealId = `${badge.id}:${tier?.tier ?? "badge"}`; setSelected({ badge, tier }); setRevealingId(revealId);
    window.setTimeout(() => setRevealingId((current) => current === revealId ? null : current), 650);
  };
  const closeBadge = () => { setSelected(null); setRevealingId(null); };
  const canPreviewAnnouncement = !!selected && isBadgeOrTierEarned(selected);
  const previewAnnouncement = () => { if (!selected || !isBadgeOrTierEarned(selected)) return; setAnnouncementPreview(selected); setAnnouncementCycle((current) => current + 1); };
  const earnedCount = data?.sections.reduce((total, section) => total + section.badges.reduce((sectionTotal, badge) => section.category === "achievement" && badge.achievementType === "tiered" ? sectionTotal + badge.tiers.filter((tier) => badge.earnedTiers.includes(tier.tier) || (badge.slug !== "iron_man" && badge.currentProgress >= tier.threshold)).length : sectionTotal + Number(badge.isEarned), 0), 0) ?? 0;
  const selectedHatTrickSeason = (data?.hatTrickSeasons ?? []).find((season) =>
    season.id === (hatTrickSeasonId ?? data?.selectedHatTrickSeasonId),
  );

  return (
    <div className="trophy-case min-h-[100dvh] bg-[#dce5f3] px-3 pb-24 pt-5 text-[#1e3345] sm:px-6 sm:pt-8">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url(${iceBackground})` }}
      />
      <div className="relative mx-auto max-w-6xl">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 rounded-xl border border-[#d7e2eb] bg-white/85 px-2.5 py-1.5 shadow-[0_3px_12px_#23415d12]"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#d52d3b] text-white"><Trophy size={16} /></span><div className="flex items-baseline gap-1.5"><strong className="font-mono text-lg leading-none text-[#173d5b]">{earnedCount}</strong><span className="text-[10px] font-bold uppercase tracking-[.12em] text-[#597087]">{preview ? "Preview spots" : "Badges"}</span></div></div>
          <button className="inline-flex items-center gap-2 rounded-lg border border-[#cddbe5] bg-white/85 px-3 py-2 text-xs font-bold text-[#173d5b] transition hover:border-[#164a73] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#164a73]" onClick={() => navigate(preview ? "/" : "/profile")}><ArrowLeft size={14} /> {preview ? "Home" : "Profile"}</button>
        </div>
        <header className="mb-7 text-center sm:mb-9"><h1 className="text-4xl font-bold tracking-[-.04em] text-[#173d5b] sm:text-5xl">{preview ? "Trophy Case Preview" : "Trophy Case"}</h1><p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-[#718394]">{preview ? "All published badges are shown for review. This preview does not change your earned badges." : "League honors, team keepsakes, and milestones."}</p></header>
        {ageAccess === "loading" && <div className="rounded-2xl border border-[#d7e2eb] bg-white p-8 text-center text-[#718394]">Verifying your age…</div>}
        {ageAccess !== "loading" && ageAccess !== "eligible" && <div className="mx-auto max-w-lg rounded-2xl border border-[#d7e2eb] bg-white p-8 text-center shadow-[0_16px_35px_#23415d12]"><Lock className="mx-auto text-[#164a73]" size={28} /><h2 className="mt-4 text-xl font-bold text-[#173d5b]">{ageAccess === "testing" ? "In Testing" : "Age verification required"}</h2><p className="mt-2 text-sm text-[#718394]">{ageAccess === "testing" ? "The Trophy Case is currently available only to users in the test group." : ageAccess === "under_21" ? "The Trophy Case is available only to users who are 21 or older." : "Enter your date of birth in your profile so we can verify that you are 21 or older."}</p>{ageAccess !== "testing" && <button onClick={() => navigate("/profile")} className="mt-6 rounded-lg bg-[#164a73] px-5 py-3 text-xs font-bold uppercase tracking-wider text-white transition hover:bg-[#103a5b]">Go to Profile <ChevronRight className="ml-1 inline" size={14} /></button>}</div>}
        {ageAccess === "eligible" && <>{isLoading && <div className="rounded-2xl border border-[#d7e2eb] bg-white p-8 text-center text-[#718394]">Loading {preview ? "the badge preview" : "your trophy case"}…</div>}{isError && <div className="rounded-2xl border border-[#edc6ca] bg-[#fff5f5] p-8 text-center text-[#b52732]">Could not load {preview ? "the badge preview" : "your trophy case"}.</div>}{data && <main className="trophy-depth-main mx-auto max-w-5xl rounded-[1.5rem] p-3 sm:p-6">
          <section className="trophy-depth-panel mb-5 rounded-2xl p-4 sm:p-5"><div className="flex items-start justify-between gap-4"><div><p className="text-[9px] font-bold uppercase tracking-[.25em] text-[#d52d3b]">{preview ? "Catalog preview" : "The collection of"}</p><h2 className="mt-1 text-xl font-bold tracking-tight text-[#173d5b] sm:text-2xl">{preview ? "Every badge, on display" : "Your career, on display"}</h2></div><div className="rounded-lg border border-[#c8dbe8] bg-white/75 px-2.5 py-1.5 text-center"><div className="font-mono text-[9px] font-bold tracking-[.15em] text-[#164a73]">ROSTER HOCKEY</div><div className="mt-0.5 text-[7px] uppercase tracking-[.15em] text-[#718394]">Player honors</div></div></div></section>
          <div className="space-y-5">{data.sections.filter((section) => section.category !== "achievement").map((section) => { const visibleBadges = preview ? section.badges : section.badges.filter((badge) => badge.isEarned); if (!visibleBadges.length) return null; return <section key={section.category} className="trophy-depth-panel rounded-2xl p-3.5 sm:p-5"><SectionHeading label={section.label} description={section.category === "nhl_trophy" ? "League-awarded trophies." : "Badges awarded by team captains."} count={visibleBadges.length} /><div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4">{visibleBadges.map((badge) => <BadgeSpot key={badge.id} badge={badge} preview={preview} onClick={() => selectBadge(badge)} />)}</div></section>; })}</div>
          <section className="trophy-depth-panel mt-5 rounded-2xl p-3.5 sm:p-5">
            <div className="mb-5 flex flex-col gap-3 border-b border-[#d7e2eb] pb-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[.25em] text-[#d52d3b]">Milestones &amp; records</p>
                <h2 className="mt-1 text-2xl font-bold tracking-tight text-[#173d5b] sm:text-3xl">Achievements</h2>
                <p className="mt-1 max-w-xl text-[11px] leading-relaxed text-[#718394] sm:text-xs">Every tier has its own spot and progress bar. Progress is capped at that tier’s target.</p>
              </div>
              <span className="w-fit rounded-full bg-[#e8f0f6] px-3 py-1.5 font-mono text-[9px] uppercase tracking-wider text-[#164a73]">Progress tracked</span>
            </div>
            <div className="space-y-5">
              {!preview && data.hatTrickSeasons.length > 0 && (
                <div className="flex flex-col gap-1.5 sm:max-w-sm">
                  <label htmlFor="achievement-season" className="text-[10px] font-bold uppercase tracking-[.12em] text-[#597087]">Achievement season</label>
                  <select id="achievement-season" value={selectedHatTrickSeason?.id ?? ""} onChange={(event) => setHatTrickSeasonId(event.target.value || null)} className="rounded-lg border border-[#cddbe5] bg-white px-3 py-2 text-sm text-[#173d5b] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#164a73]">
                    <option value="">Most recent season</option>
                    {data.hatTrickSeasons.map((season) => <option key={season.id} value={season.id}>{season.name}</option>)}
                  </select>
                  {selectedHatTrickSeason && <p className="text-xs text-[#718394]">Showing Hat Trick, On Fire, and Early Bird for {selectedHatTrickSeason.name}.</p>}
                </div>
              )}
              {ACHIEVEMENT_SECTIONS.filter((group) => !("goalieOnly" in group) || !group.goalieOnly || data.isGoalie).map((group) => {
                const achievementBadges = data.sections.find((section) => section.category === "achievement")?.badges ?? [];
                const badges = "slug" in group ? achievementBadges.filter((badge) => badge.slug === group.slug) : achievementBadges.filter((badge) => badge.slug !== "early_bird" && group.types.includes(badge.achievementType as typeof group.types[number]));
                return <AchievementSection key={group.key} label={group.label} description={group.description} badges={badges} onSelect={selectBadge} preview={preview} />;
              })}
              {preview && (() => {
                const extra = otherAchievements(data.sections.find((section) => section.category === "achievement")?.badges ?? []);
                return extra.length ? <AchievementSection label="Other Achievements" description="Additional published achievements." badges={extra} onSelect={selectBadge} preview /> : null;
              })()}
            </div>
          </section>
        </main>}</>}
      </div>
      {selected && <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#173d5b]/55 p-4 backdrop-blur-sm" onClick={closeBadge}><div className={`w-full max-w-lg rounded-2xl border border-[#cfdee8] bg-white p-5 text-[#1e3345] shadow-[0_24px_80px_#173d5b55] sm:p-7 ${revealingId === `${selected.badge.id}:${selected.tier?.tier ?? "badge"}` ? "badge-detail-card-active" : ""}`} onClick={(event) => event.stopPropagation()}><div className="mb-4 flex items-center gap-3">{canPreviewAnnouncement && <button onClick={previewAnnouncement} className="inline-flex items-center gap-2 rounded-lg bg-[#e8f0f6] px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-[#164a73] transition hover:bg-[#d8e7f0]"><Sparkles size={14} /> Preview announcement</button>}<button onClick={closeBadge} className="ml-auto rounded-full p-1 text-[#718394] transition hover:bg-[#edf3f7]" aria-label="Close badge details"><X size={20} /></button></div><div className="flex flex-col items-center text-center"><BadgeArtwork badge={selected.badge} tier={selected.tier} earned={isBadgeOrTierEarned(selected)} large /></div><h2 className={`mt-5 text-center text-2xl font-bold ${selected.badge.isEarned ? "text-[#164a73]" : "text-[#718394]"}`}>{selected.badge.isEarned ? selected.badge.name : "???"}</h2>{selected.tier && <p className="mt-1 text-center text-xs font-semibold uppercase tracking-wider text-[#d52d3b]">{formatTier(selected.tier.tier)} · target {selected.tier.threshold}</p>}<p className="mt-2 text-center text-sm text-[#718394]">{selected.badge.isEarned ? selected.badge.description : (selected.badge.lockedHint || "Keep playing to discover this badge.")}</p>{selected.badge.isEarned && selected.badge.earnedAt && <p className="mt-3 text-center text-xs text-[#8a9aaa]">Earned {new Date(selected.badge.earnedAt).toLocaleDateString()}</p>}{selected.tier ? <TierProgress badge={selected.badge} tier={selected.tier} /> : selected.badge.tiers.length > 0 && <div className="mt-6 flex flex-wrap justify-center gap-2">{selected.badge.tiers.map((tier) => <span key={tier.tier} className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase ${selected.badge.earnedTiers.includes(tier.tier) ? "border-[#d52d3b] bg-[#fff0f1] text-[#b52732]" : "border-[#d7e2eb] text-[#718394]"}`}>{formatTier(tier.tier)} · {tier.threshold}</span>)}</div>}{selected.badge.achievementType === "multiplier" && <p className="mt-5 text-center text-xl font-bold text-[#d52d3b]">×{selected.badge.count}</p>}{!selected.badge.isEarned && <Lock className="mx-auto mt-5 text-[#718394]" size={18} />}</div></div>}
      {announcementPreview && <div key={announcementCycle}><BadgeEarnedAnnouncement badge={{ ...announcementPreview.badge, imagePath: announcementPreview.tier?.imagePath || announcementPreview.badge.imagePath }} payload={{ tier: announcementPreview.tier?.tier }} onDismiss={() => setAnnouncementPreview(null)} onViewTrophyCase={() => setAnnouncementPreview(null)} /></div>}
    </div>
  );
}