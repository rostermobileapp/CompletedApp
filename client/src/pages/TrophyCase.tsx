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
};
type Section = { category: string; label: string; badges: Badge[] };
type TrophyCaseData = { sections: Section[]; isGoalie: boolean };
type SelectedBadge = { badge: Badge; tier?: Tier };
type TrophyCaseAccess = "eligible" | "missing_dob" | "invalid_dob" | "under_21" | "testing";

const ACHIEVEMENT_SECTIONS = [
  { key: "three_stars", label: "3 Stars", description: "Named one of the three stars of the game.", slug: "three_stars" },
  { key: "beer_me", label: "Beer Me", description: "Post-game dedication.", slug: "beer_me" },
  { key: "century_club", label: "Century Club", description: "Total games played.", slug: "century_club" },
  { key: "hat_trick", label: "Hat Trick", description: "Score three goals in a single game.", slug: "hat_trick" },
  { key: "on_fire", label: "Hot Streak", description: "Build a multi-game scoring streak.", slug: "on_fire" },
  { key: "iron_man", label: "Iron Man", description: "Play consecutive games without missing one.", slug: "iron_man" },
  { key: "one_time", label: "One Time Badges", description: "Permanent and repeatable achievements.", types: ["onetime", "multiplier"] },
  { key: "shutouts", label: "Shutouts", description: "Career shutouts recorded as a goalie.", slug: "broom", goalieOnly: true },
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

function TierSpot({ badge, tier, onClick }: { badge: Badge; tier: Tier; onClick: () => void }) {
  const earned = badge.earnedTiers.includes(tier.tier) || badge.currentProgress >= tier.threshold;
  return (
    <button onClick={onClick} className="trophy-depth-slot group min-w-0 rounded-xl text-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#164a73]" aria-label={`${badge.name} ${formatTier(tier.tier)}: ${Math.min(badge.currentProgress, tier.threshold)} of ${tier.threshold}`}>
      <div className="trophy-slot-well">
        <div className="mx-auto w-fit transition-transform group-hover:scale-[1.04]"><BadgeArtwork badge={badge} tier={tier} earned={earned} /></div>
        <div className={`mt-2 text-[10px] font-bold uppercase tracking-[.1em] ${earned ? "text-[#164a73]" : "text-[#597087]"}`}>Tier {badge.tiers.findIndex((item) => item.tier === tier.tier) + 1}</div>
        <div className="mt-1 text-[10px] uppercase tracking-wider text-[#566e82]">{formatTier(tier.tier)}</div>
        <div className={`mt-1 text-[9px] font-semibold uppercase tracking-[.12em] ${earned ? "text-[#d52d3b]" : "text-[#50687b]"}`}>{earned ? "Earned" : "In progress"}</div>
        <TierProgress badge={badge} tier={tier} />
      </div>
    </button>
  );
}

function BadgeSpot({ badge, onClick }: { badge: Badge; onClick: () => void }) {
  return (
    <button onClick={onClick} className="trophy-depth-slot group min-w-0 rounded-xl text-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#164a73]">
      <div className="trophy-slot-well">
        <div className="mx-auto w-fit transition-transform group-hover:scale-[1.04]"><BadgeArtwork badge={badge} /></div>
        <div className={`mt-2 max-w-full truncate text-[10px] font-bold uppercase tracking-[.09em] ${badge.isEarned ? "text-[#164a73]" : "text-[#50687b]"}`}>{badge.isEarned ? badge.name : "???"}</div>
        <div className={`mt-1 text-[9px] font-semibold uppercase tracking-[.12em] ${badge.isEarned ? "text-[#d52d3b]" : "text-[#50687b]"}`}>{badge.isEarned ? "Earned" : "Locked"}</div>
        {badge.achievementType === "multiplier" && <div className="mt-1 text-[9px] text-[#50687b]">{badge.count} earned</div>}
      </div>
    </button>
  );
}

function SectionHeading({ label, description, count }: { label: string; description: string; count?: number }) {
  return <div className="mb-4 flex items-end justify-between gap-3 border-b border-[#d7e2eb] pb-3"><div className="min-w-0"><h3 className="text-base font-bold tracking-tight text-[#173d5b] sm:text-lg">{label}</h3><p className="mt-1 text-[11px] leading-relaxed text-[#718394] sm:text-xs">{description}</p></div>{count !== undefined && <span className="shrink-0 rounded-full bg-[#e8f0f6] px-2.5 py-1 font-mono text-[9px] uppercase tracking-wider text-[#164a73]">{count} {count === 1 ? "award" : "spots"}</span>}</div>;
}

function AchievementSection({ label, description, badges, onSelect }: { label: string; description: string; badges: Badge[]; onSelect: (badge: Badge, tier?: Tier) => void }) {
  const isTiered = badges.some((badge) => badge.achievementType === "tiered");
  const spotCount = isTiered ? badges.reduce((total, badge) => total + (badge.achievementType === "tiered" ? badge.tiers.length : 1), 0) : badges.length;
  return <section className="trophy-depth-section rounded-2xl p-3.5 sm:p-5"><SectionHeading label={label} description={description} count={spotCount} /><div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4">{badges.flatMap((badge) => badge.achievementType === "tiered" ? badge.tiers.map((tier) => <TierSpot key={`${badge.id}-${tier.tier}`} badge={badge} tier={tier} onClick={() => onSelect(badge, tier)} />) : [<BadgeSpot key={badge.id} badge={badge} onClick={() => onSelect(badge)} />])}</div></section>;
}

export default function TrophyCase() {
  const [, navigate] = useLocation();
  const [selected, setSelected] = useState<SelectedBadge | null>(null);
  const [revealingId, setRevealingId] = useState<string | null>(null);
  const [announcementPreview, setAnnouncementPreview] = useState<SelectedBadge | null>(null);
  const [announcementCycle, setAnnouncementCycle] = useState(0);
  const { data: user, isLoading: isUserLoading } = useQuery<{ displayId?: string | null; dateOfBirth?: string | null }>({ queryKey: ["/api/user"] });
  const ageAccess = isUserLoading ? "loading" : user?.displayId !== "U00001" ? "testing" : getTrophyCaseAccess(user?.dateOfBirth);
  const { data, isLoading, isError } = useQuery<TrophyCaseData>({ queryKey: ["/api/trophy-case"], enabled: ageAccess === "eligible" });
  const selectBadge = (badge: Badge, tier?: Tier) => {
    const revealId = `${badge.id}:${tier?.tier ?? "badge"}`; setSelected({ badge, tier }); setRevealingId(revealId);
    window.setTimeout(() => setRevealingId((current) => current === revealId ? null : current), 650);
  };
  const closeBadge = () => { setSelected(null); setRevealingId(null); };
  const previewAnnouncement = () => { if (!selected) return; setAnnouncementPreview(selected); setAnnouncementCycle((current) => current + 1); };
  const earnedCount = data?.sections.reduce((total, section) => total + section.badges.reduce((sectionTotal, badge) => section.category === "achievement" && badge.achievementType === "tiered" ? sectionTotal + badge.tiers.filter((tier) => badge.earnedTiers.includes(tier.tier) || badge.currentProgress >= tier.threshold).length : sectionTotal + Number(badge.isEarned), 0), 0) ?? 0;

  return (
    <div className="trophy-case min-h-[100dvh] bg-[#dce5f3] px-3 pb-24 pt-5 text-[#1e3345] sm:px-6 sm:pt-8">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url(${iceBackground})` }}
      />
      <div className="relative mx-auto max-w-6xl">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 rounded-xl border border-[#d7e2eb] bg-white/85 px-2.5 py-1.5 shadow-[0_3px_12px_#23415d12]"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#d52d3b] text-white"><Trophy size={16} /></span><div className="flex items-baseline gap-1.5"><strong className="font-mono text-lg leading-none text-[#173d5b]">{earnedCount}</strong><span className="text-[10px] font-bold uppercase tracking-[.12em] text-[#597087]">Badges</span></div></div>
          <button className="inline-flex items-center gap-2 rounded-lg border border-[#cddbe5] bg-white/85 px-3 py-2 text-xs font-bold text-[#173d5b] transition hover:border-[#164a73] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#164a73]" onClick={() => navigate("/profile")}><ArrowLeft size={14} /> Profile</button>
        </div>
        <header className="mb-7 text-center sm:mb-9"><h1 className="text-4xl font-bold tracking-[-.04em] text-[#173d5b] sm:text-5xl">Trophy Case</h1><p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-[#718394]">League honors, team keepsakes, and milestones.</p></header>
        {ageAccess === "loading" && <div className="rounded-2xl border border-[#d7e2eb] bg-white p-8 text-center text-[#718394]">Verifying your age…</div>}
        {ageAccess !== "loading" && ageAccess !== "eligible" && <div className="mx-auto max-w-lg rounded-2xl border border-[#d7e2eb] bg-white p-8 text-center shadow-[0_16px_35px_#23415d12]"><Lock className="mx-auto text-[#164a73]" size={28} /><h2 className="mt-4 text-xl font-bold text-[#173d5b]">{ageAccess === "testing" ? "In Testing" : "Age verification required"}</h2><p className="mt-2 text-sm text-[#718394]">{ageAccess === "testing" ? "The Trophy Case is currently available only to users in the test group." : ageAccess === "under_21" ? "The Trophy Case is available only to users who are 21 or older." : "Enter your date of birth in your profile so we can verify that you are 21 or older."}</p>{ageAccess !== "testing" && <button onClick={() => navigate("/profile")} className="mt-6 rounded-lg bg-[#164a73] px-5 py-3 text-xs font-bold uppercase tracking-wider text-white transition hover:bg-[#103a5b]">Go to Profile <ChevronRight className="ml-1 inline" size={14} /></button>}</div>}
        {ageAccess === "eligible" && <>{isLoading && <div className="rounded-2xl border border-[#d7e2eb] bg-white p-8 text-center text-[#718394]">Loading your trophy case…</div>}{isError && <div className="rounded-2xl border border-[#edc6ca] bg-[#fff5f5] p-8 text-center text-[#b52732]">Could not load your trophy case.</div>}{data && <main className="trophy-depth-main mx-auto max-w-5xl rounded-[1.5rem] p-3 sm:p-6">
          <section className="trophy-depth-panel mb-5 rounded-2xl p-4 sm:p-5"><div className="flex items-start justify-between gap-4"><div><p className="text-[9px] font-bold uppercase tracking-[.25em] text-[#d52d3b]">The collection of</p><h2 className="mt-1 text-xl font-bold tracking-tight text-[#173d5b] sm:text-2xl">Your career, on display</h2></div><div className="rounded-lg border border-[#c8dbe8] bg-white/75 px-2.5 py-1.5 text-center"><div className="font-mono text-[9px] font-bold tracking-[.15em] text-[#164a73]">ROSTER HOCKEY</div><div className="mt-0.5 text-[7px] uppercase tracking-[.15em] text-[#718394]">Player honors</div></div></div></section>
          <div className="space-y-5">{data.sections.filter((section) => section.category !== "achievement").map((section) => { const earnedBadges = section.badges.filter((badge) => badge.isEarned); if (!earnedBadges.length) return null; return <section key={section.category} className="trophy-depth-panel rounded-2xl p-3.5 sm:p-5"><SectionHeading label={section.label} description={section.category === "nhl_trophy" ? "League-awarded trophies." : "Badges awarded by team captains."} count={earnedBadges.length} /><div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4">{earnedBadges.map((badge) => <BadgeSpot key={badge.id} badge={badge} onClick={() => selectBadge(badge)} />)}</div></section>; })}</div>
          <section className="trophy-depth-panel mt-5 rounded-2xl p-3.5 sm:p-5"><div className="mb-5 flex flex-col gap-3 border-b border-[#d7e2eb] pb-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-[9px] font-bold uppercase tracking-[.25em] text-[#d52d3b]">Milestones &amp; records</p><h2 className="mt-1 text-2xl font-bold tracking-tight text-[#173d5b] sm:text-3xl">Achievements</h2><p className="mt-1 max-w-xl text-[11px] leading-relaxed text-[#718394] sm:text-xs">Every tier has its own spot and progress bar. Progress is capped at that tier’s target.</p></div><span className="w-fit rounded-full bg-[#e8f0f6] px-3 py-1.5 font-mono text-[9px] uppercase tracking-wider text-[#164a73]">Progress tracked</span></div><div className="space-y-5">{ACHIEVEMENT_SECTIONS.filter((group) => !("goalieOnly" in group) || !group.goalieOnly || data.isGoalie).map((group) => { const achievementBadges = data.sections.find((section) => section.category === "achievement")?.badges ?? []; const badges = "slug" in group ? achievementBadges.filter((badge) => badge.slug === group.slug) : achievementBadges.filter((badge) => group.types.includes(badge.achievementType as typeof group.types[number])); return <AchievementSection key={group.key} label={group.label} description={group.description} badges={badges} onSelect={selectBadge} />; })}</div></section>
        </main>}</>}
      </div>
      {selected && <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#173d5b]/55 p-4 backdrop-blur-sm" onClick={closeBadge}><div className={`w-full max-w-lg rounded-2xl border border-[#cfdee8] bg-white p-5 text-[#1e3345] shadow-[0_24px_80px_#173d5b55] sm:p-7 ${revealingId === `${selected.badge.id}:${selected.tier?.tier ?? "badge"}` ? "badge-detail-card-active" : ""}`} onClick={(event) => event.stopPropagation()}><div className="mb-4 flex items-center justify-between gap-3"><button onClick={previewAnnouncement} className="inline-flex items-center gap-2 rounded-lg bg-[#e8f0f6] px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-[#164a73] transition hover:bg-[#d8e7f0]"><Sparkles size={14} /> Preview announcement</button><button onClick={closeBadge} className="rounded-full p-1 text-[#718394] transition hover:bg-[#edf3f7]" aria-label="Close badge details"><X size={20} /></button></div><div className="flex flex-col items-center text-center"><BadgeArtwork badge={selected.badge} tier={selected.tier} earned={selected.tier ? selected.badge.earnedTiers.includes(selected.tier.tier) || selected.badge.currentProgress >= selected.tier.threshold : selected.badge.isEarned} large /></div><h2 className={`mt-5 text-center text-2xl font-bold ${selected.badge.isEarned ? "text-[#164a73]" : "text-[#718394]"}`}>{selected.badge.isEarned ? selected.badge.name : "???"}</h2>{selected.tier && <p className="mt-1 text-center text-xs font-semibold uppercase tracking-wider text-[#d52d3b]">{formatTier(selected.tier.tier)} · target {selected.tier.threshold}</p>}<p className="mt-2 text-center text-sm text-[#718394]">{selected.badge.isEarned ? selected.badge.description : (selected.badge.lockedHint || "Keep playing to discover this badge.")}</p>{selected.badge.isEarned && selected.badge.earnedAt && <p className="mt-3 text-center text-xs text-[#8a9aaa]">Earned {new Date(selected.badge.earnedAt).toLocaleDateString()}</p>}{selected.tier ? <TierProgress badge={selected.badge} tier={selected.tier} /> : selected.badge.tiers.length > 0 && <div className="mt-6 flex flex-wrap justify-center gap-2">{selected.badge.tiers.map((tier) => <span key={tier.tier} className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase ${selected.badge.earnedTiers.includes(tier.tier) ? "border-[#d52d3b] bg-[#fff0f1] text-[#b52732]" : "border-[#d7e2eb] text-[#718394]"}`}>{formatTier(tier.tier)} · {tier.threshold}</span>)}</div>}{selected.badge.achievementType === "multiplier" && <p className="mt-5 text-center text-xl font-bold text-[#d52d3b]">×{selected.badge.count}</p>}{!selected.badge.isEarned && <Lock className="mx-auto mt-5 text-[#718394]" size={18} />}</div></div>}
      {announcementPreview && <div key={announcementCycle}><BadgeEarnedAnnouncement badge={{ ...announcementPreview.badge, imagePath: announcementPreview.tier?.imagePath || announcementPreview.badge.imagePath }} payload={{ tier: announcementPreview.tier?.tier }} onDismiss={() => setAnnouncementPreview(null)} onViewTrophyCase={() => setAnnouncementPreview(null)} /></div>}
    </div>
  );
}