import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Lock, Sparkles, X } from "lucide-react";
import { BadgeEarnedAnnouncement } from "@/components/BadgeEarnedHost";
import { getImageUrl } from "@/lib/queryClient";

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

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(year, month - 1, day);
  if (
    parsed.getFullYear() !== year
    || parsed.getMonth() !== month - 1
    || parsed.getDate() !== day
    || parsed > today
  ) {
    return "invalid_dob";
  }

  let age = today.getFullYear() - year;
  const birthdayHasPassed = today.getMonth() > month - 1
    || (today.getMonth() === month - 1 && today.getDate() >= day);
  if (!birthdayHasPassed) age -= 1;

  return age >= 21 ? "eligible" : "under_21";
}

function formatTier(tier: string) {
  return tier.replace("_", " ");
}

function BadgeArtwork({
  badge,
  tier,
  earned = badge.isEarned,
  large = false,
}: {
  badge: Badge;
  tier?: Tier;
  earned?: boolean;
  large?: boolean;
}) {
  const imagePath = tier?.imagePath || badge.imagePath;
  const size = large ? "aspect-square h-auto w-[95%] max-w-[26rem] sm:w-[88%]" : "h-20 w-20";
  return (
    <div className={`${size} relative flex items-center justify-center overflow-hidden rounded-full`}
      style={{ background: earned && imagePath ? "transparent" : earned ? (tier?.color || badge.placeholderColor || "#c9a84c") : "#111d29" }}>
      {earned && imagePath ? (
        <img src={getImageUrl(imagePath) ?? undefined} alt={`${badge.name}${tier ? ` ${formatTier(tier.tier)}` : ""}`} className={`h-full w-full object-contain ${earned ? "" : "grayscale brightness-[.22]"}`} />
      ) : earned ? (
        <span className={`px-2 text-center text-[10px] font-bold uppercase tracking-wider ${earned ? "text-[#0a1520]" : "text-[#3a5a7a]"}`}>
          {badge.name}
        </span>
      ) : null}
      {!tier && badge.achievementType === "multiplier" && badge.count > 0 && (
        <span className="absolute right-0 top-0 rounded-full bg-[#c9a84c] px-1.5 py-0.5 text-[10px] font-bold text-[#0a1520]">×{badge.count}</span>
      )}
    </div>
  );
}

function TierProgress({ badge, tier }: { badge: Badge; tier: Tier }) {
  const value = Math.min(Math.max(badge.currentProgress, 0), tier.threshold);
  const ratio = Math.min(1, value / Math.max(1, tier.threshold));
  return (
    <div className="mt-3 w-full">
      <div className="h-1.5 overflow-hidden rounded-full bg-[#1a2a3a]">
        <div className="h-full rounded-full bg-[#c9a84c] transition-all duration-700" style={{ width: `${ratio * 100}%` }} />
      </div>
      <div className="mt-1 text-center text-[9px] text-[#6c8298]">{value} / {tier.threshold}</div>
    </div>
  );
}

function TierSpot({ badge, tier, onClick }: { badge: Badge; tier: Tier; onClick: () => void }) {
  const earned = badge.earnedTiers.includes(tier.tier) || badge.currentProgress >= tier.threshold;
  return (
    <button
      onClick={onClick}
      className="group min-w-0 rounded-2xl border border-[#20374c] bg-[#0d1b2a]/70 p-3 text-center transition-colors hover:border-[#c9a84c]/60"
      aria-label={`${badge.name} ${formatTier(tier.tier)}: ${Math.min(badge.currentProgress, tier.threshold)} of ${tier.threshold}`}
    >
      <div className={`mx-auto w-fit transition-transform group-hover:-translate-y-1 ${earned ? "" : "opacity-90"}`}>
        <BadgeArtwork badge={badge} tier={tier} earned={earned} />
      </div>
      <div className={`mt-2 text-[10px] font-bold uppercase tracking-wider ${earned ? "text-[#c9a84c]" : "text-[#8096aa]"}`}>
        Tier {badge.tiers.findIndex((item) => item.tier === tier.tier) + 1}
      </div>
      <div className="mt-1 truncate text-[9px] uppercase tracking-wider text-[#6c8298]">{formatTier(tier.tier)}</div>
      <TierProgress badge={badge} tier={tier} />
    </button>
  );
}

function BadgeSpot({ badge, onClick }: { badge: Badge; onClick: () => void }) {
  return (
    <button onClick={onClick} className="group min-w-0 rounded-2xl border border-[#20374c] bg-[#0d1b2a]/70 p-3 text-center transition-colors hover:border-[#c9a84c]/60">
      <div className="mx-auto w-fit transition-transform group-hover:-translate-y-1"><BadgeArtwork badge={badge} /></div>
      <div className={`mt-2 truncate text-[10px] font-semibold uppercase tracking-wider ${badge.isEarned ? "text-[#c9a84c]" : "text-[#8096aa]"}`}>
        {badge.isEarned ? badge.name : "???"}
      </div>
      {badge.achievementType === "multiplier" && <div className="mt-2 text-[10px] text-[#6c8298]">{badge.count} earned</div>}
    </button>
  );
}

function SectionHeading({ label, description, count }: { label: string; description: string; count?: number }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4 border-b border-[#29425b] pb-3">
      <div>
        <h3 className="text-sm font-bold uppercase tracking-[.2em] text-[#c9a84c]">{label}</h3>
        <p className="mt-1 text-xs text-[#6c8298]">{description}</p>
      </div>
      {count !== undefined && <span className="text-[10px] uppercase tracking-wider text-[#3a5a7a]">{count} {count === 1 ? "spot" : "spots"}</span>}
    </div>
  );
}

function AchievementSection({
  label,
  description,
  badges,
  onSelect,
}: {
  label: string;
  description: string;
  badges: Badge[];
  onSelect: (badge: Badge, tier?: Tier) => void;
}) {
  const isTiered = badges.some((badge) => badge.achievementType === "tiered");
  const spotCount = isTiered
    ? badges.reduce((total, badge) => total + (badge.achievementType === "tiered" ? badge.tiers.length : 1), 0)
    : badges.length;
  return (
    <section className="rounded-2xl border border-[#20374c] bg-[#0d1b2a]/45 p-4 sm:p-5">
      <SectionHeading label={label} description={description} count={spotCount} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {badges.flatMap((badge) =>
          badge.achievementType === "tiered"
            ? badge.tiers.map((tier) => <TierSpot key={`${badge.id}-${tier.tier}`} badge={badge} tier={tier} onClick={() => onSelect(badge, tier)} />)
            : [<BadgeSpot key={badge.id} badge={badge} onClick={() => onSelect(badge)} />],
        )}
      </div>
    </section>
  );
}

export default function TrophyCase() {
  const [, navigate] = useLocation();
  const [selected, setSelected] = useState<SelectedBadge | null>(null);
  const [revealingId, setRevealingId] = useState<string | null>(null);
  const [announcementPreview, setAnnouncementPreview] = useState<SelectedBadge | null>(null);
  const [announcementCycle, setAnnouncementCycle] = useState(0);
  const { data: user, isLoading: isUserLoading } = useQuery<{ displayId?: string | null; dateOfBirth?: string | null }>({ queryKey: ["/api/user"] });
  const ageAccess = isUserLoading
    ? "loading"
    : user?.displayId !== "U00001"
      ? "testing"
      : getTrophyCaseAccess(user?.dateOfBirth);
  const { data, isLoading, isError } = useQuery<TrophyCaseData>({
    queryKey: ["/api/trophy-case"],
    enabled: ageAccess === "eligible",
  });
  const selectBadge = (badge: Badge, tier?: Tier) => {
    const revealId = `${badge.id}:${tier?.tier ?? "badge"}`;
    setSelected({ badge, tier });
    setRevealingId(revealId);
    window.setTimeout(() => setRevealingId((current) => current === revealId ? null : current), 650);
  };
  const previewAnnouncement = () => {
    if (!selected) return;
    setAnnouncementPreview(selected);
    setAnnouncementCycle((current) => current + 1);
  };
  const closeBadge = () => {
    setSelected(null);
    setRevealingId(null);
  };

  return (
    <div className="min-h-screen bg-[#0a1520] px-4 pb-24 pt-6 text-[#e8e4dc] sm:px-8">
      <div className="mx-auto max-w-5xl">
        <button className="mb-5 text-sm text-[#9bb0c4]" onClick={() => navigate("/profile")}>← Profile</button>
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-[.32em] text-[#c9a84c]">Roster Hockey</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">Trophy Case</h1>
          <p className="mt-2 max-w-xl text-sm text-[#8096aa]">Your league awards, team badges, and career achievements.</p>
        </div>
        {ageAccess === "loading" && (
          <div className="rounded-2xl border border-[#20374c] p-8 text-center text-[#8096aa]">Verifying your age…</div>
        )}
        {ageAccess !== "loading" && ageAccess !== "eligible" && (
          <div className="mx-auto max-w-lg rounded-3xl border border-[#c9a84c]/30 bg-[#0d1b2a] p-8 text-center">
            <Lock className="mx-auto text-[#c9a84c]" size={28} />
            {ageAccess === "testing" ? (
              <>
                <h2 className="mt-4 text-xl font-bold text-[#e8e4dc]">In Testing</h2>
                <p className="mt-2 text-sm text-[#a6b5c2]">The Trophy Case is currently available only to User U00001.</p>
              </>
            ) : (
              <>
                <h2 className="mt-4 text-xl font-bold text-[#e8e4dc]">Age verification required</h2>
                <p className="mt-2 text-sm text-[#a6b5c2]">
                  {ageAccess === "under_21"
                    ? "The Trophy Case is available only to users who are 21 or older."
                    : "Enter your date of birth in your profile so we can verify that you are 21 or older."}
                </p>
                <button
                  onClick={() => navigate("/profile")}
                  className="mt-6 rounded-xl border border-[#c9a84c] px-5 py-3 text-xs font-bold uppercase tracking-wider text-[#c9a84c] transition-colors hover:bg-[#c9a84c]/10"
                >
                  Go to Profile
                </button>
              </>
            )}
          </div>
        )}
        {ageAccess === "eligible" && (
          <>
            {isLoading && <div className="rounded-2xl border border-[#20374c] p-8 text-center text-[#8096aa]">Loading your trophy case…</div>}
            {isError && <div className="rounded-2xl border border-red-900/60 bg-red-950/20 p-8 text-center text-red-200">Could not load your trophy case.</div>}
            <div className="space-y-8">
              {data?.sections.filter((section) => section.category !== "achievement").map((section) => (
                <section key={section.category} className="rounded-2xl border border-[#20374c] bg-[#0d1b2a]/45 p-4 sm:p-5">
                  <SectionHeading label={section.label} description={section.category === "nhl_trophy" ? "League-awarded trophies." : "Badges awarded by team captains."} count={section.badges.length} />
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                    {section.badges.map((badge) => <BadgeSpot key={badge.id} badge={badge} onClick={() => selectBadge(badge)} />)}
                  </div>
                </section>
              ))}
              <section className="rounded-2xl border border-[#29425b] bg-[#0d1b2a]/35 p-4 sm:p-5">
                <div className="mb-6">
                  <h2 className="text-lg font-bold uppercase tracking-[.24em] text-[#e8e4dc]">Achievements</h2>
                  <p className="mt-1 text-sm text-[#8096aa]">Every tier has its own spot and progress bar. Progress is capped at that tier’s target.</p>
                </div>
                <div className="space-y-6">
                  {ACHIEVEMENT_SECTIONS.filter((group) => !group.goalieOnly || data?.isGoalie).map((group) => {
                    const achievementBadges = data?.sections.find((section) => section.category === "achievement")?.badges ?? [];
                    const badges = "slug" in group
                      ? achievementBadges.filter((badge) => badge.slug === group.slug)
                      : achievementBadges.filter((badge) => group.types.includes(badge.achievementType as typeof group.types[number]));
                    return <AchievementSection key={group.key} label={group.label} description={group.description} badges={badges} onSelect={selectBadge} />;
                  })}
                </div>
              </section>
            </div>
          </>
        )}
      </div>
      {selected && (
        <div className="badge-detail-stage fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-5 sm:p-6" onClick={closeBadge}>
          <div className={`badge-detail-card w-full max-w-lg rounded-3xl border border-[#c9a84c]/30 bg-[#0d1b2a] p-6 ${revealingId === `${selected.badge.id}:${selected.tier?.tier ?? "badge"}` ? "badge-detail-card-active" : ""}`} onClick={(event) => event.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between gap-3">
              <button onClick={previewAnnouncement} className="inline-flex items-center gap-2 rounded-lg border border-[#c9a84c]/50 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-[#c9a84c] transition-colors hover:bg-[#c9a84c]/10" aria-label="Preview achievement announcement">
                <Sparkles size={14} />
                Preview announcement
              </button>
              <button onClick={closeBadge} className="text-[#8096aa]" aria-label="Close badge details"><X size={20} /></button>
            </div>
            <div className={`flex flex-col items-center text-center ${revealingId === `${selected.badge.id}:${selected.tier?.tier ?? "badge"}` ? "badge-detail-reveal" : ""}`}><BadgeArtwork badge={selected.badge} tier={selected.tier} earned={selected.tier ? selected.badge.earnedTiers.includes(selected.tier.tier) || selected.badge.currentProgress >= selected.tier.threshold : selected.badge.isEarned} large /></div>
            <h2 className={`mt-5 text-center text-2xl font-bold ${selected.badge.isEarned ? "text-[#c9a84c]" : "text-[#8096aa]"}`}>{selected.badge.isEarned ? selected.badge.name : "???"}</h2>
            {selected.tier && <p className="mt-1 text-center text-xs font-semibold uppercase tracking-wider text-[#c9a84c]">{formatTier(selected.tier.tier)} · target {selected.tier.threshold}</p>}
            <p className="mt-2 text-center text-sm text-[#a6b5c2]">{selected.badge.isEarned ? selected.badge.description : (selected.badge.lockedHint || "Keep playing to discover this badge.")}</p>
            {selected.badge.isEarned && selected.badge.earnedAt && <p className="mt-3 text-center text-xs text-[#8096aa]">Earned {new Date(selected.badge.earnedAt).toLocaleDateString()}</p>}
            {selected.tier ? <TierProgress badge={selected.badge} tier={selected.tier} /> : selected.badge.tiers.length > 0 && <div className="mt-6 flex flex-wrap justify-center gap-2">{selected.badge.tiers.map((tier) => <span key={tier.tier} className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase ${selected.badge.earnedTiers.includes(tier.tier) ? "border-[#c9a84c]/60 text-[#c9a84c]" : "border-[#29425b] text-[#3a5a7a]"}`}>{formatTier(tier.tier)} · {tier.threshold}</span>)}</div>}
            {selected.badge.achievementType === "multiplier" && <p className="mt-5 text-center text-xl font-bold text-[#c9a84c]">×{selected.badge.count}</p>}
            {!selected.badge.isEarned && <Lock className="mx-auto mt-5 text-[#3a5a7a]" size={18} />}
          </div>
        </div>
      )}
      {announcementPreview && (
        <div key={announcementCycle}>
          <BadgeEarnedAnnouncement
            badge={{
              ...announcementPreview.badge,
              imagePath: announcementPreview.tier?.imagePath || announcementPreview.badge.imagePath,
            }}
            payload={{ tier: announcementPreview.tier?.tier }}
            onDismiss={() => setAnnouncementPreview(null)}
            onViewTrophyCase={() => setAnnouncementPreview(null)}
          />
        </div>
      )}
    </div>
  );
}