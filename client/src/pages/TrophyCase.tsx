import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { ArrowLeft, Lock, Sparkles, Trophy, X } from "lucide-react";
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
  const size = large ? "aspect-square h-auto w-[95%] max-w-[26rem] sm:w-[88%]" : "h-[4.35rem] w-[4.35rem] sm:h-[4.75rem] sm:w-[4.75rem]";
  return (
    <div
      className={`${size} relative flex items-center justify-center overflow-hidden rounded-full border-[3px] ${
        earned
          ? "border-[#f1d28d] shadow-[0_4px_12px_#120e0870,inset_0_2px_4px_#fff8]"
          : "border-[#65766d] shadow-[inset_0_2px_6px_#0008]"
      }`}
      style={{
        background: earned && imagePath
          ? "transparent"
          : earned
            ? `radial-gradient(circle at 35% 25%, #fff0b9, ${tier?.color || badge.placeholderColor || "#d4a65c"} 58%, #916439)`
            : "radial-gradient(circle at 40% 30%, #66766d, #34453d 68%, #23332c)",
      }}
    >
      {earned && imagePath ? (
        <img src={getImageUrl(imagePath) ?? undefined} alt={`${badge.name}${tier ? ` ${formatTier(tier.tier)}` : ""}`} className="h-full w-full object-contain" />
      ) : earned ? (
        <span className="px-2 text-center text-[9px] font-extrabold uppercase leading-tight tracking-[.08em] text-[#54391f] sm:text-[10px]">
          {badge.name}
        </span>
      ) : <Lock size={16} strokeWidth={1.8} className="text-[#b1bcad]" />}
      {!tier && badge.achievementType === "multiplier" && badge.count > 0 && (
        <span className="absolute -right-0.5 -top-0.5 rounded-full border border-[#f6e0a9] bg-[#bd8844] px-1.5 py-0.5 text-[10px] font-bold text-[#30271a]">×{badge.count}</span>
      )}
    </div>
  );
}

function TierProgress({ badge, tier }: { badge: Badge; tier: Tier }) {
  const value = Math.min(Math.max(badge.currentProgress, 0), tier.threshold);
  const ratio = Math.min(1, value / Math.max(1, tier.threshold));
  return (
    <div className="mt-2 w-full">
      <div className="h-1.5 overflow-hidden rounded-full bg-[#263a32] shadow-[inset_0_1px_2px_#0008]">
        <div className="h-full rounded-full bg-gradient-to-r from-[#b78142] to-[#f0d28d] transition-all duration-700" style={{ width: `${ratio * 100}%` }} />
      </div>
      <div className="mt-1 text-center font-mono text-[9px] text-[#d0c4a3]">{value} / {tier.threshold}</div>
    </div>
  );
}

function TierSpot({ badge, tier, onClick }: { badge: Badge; tier: Tier; onClick: () => void }) {
  const earned = badge.earnedTiers.includes(tier.tier) || badge.currentProgress >= tier.threshold;
  return (
    <button
      onClick={onClick}
      className="group min-w-0 rounded-xl border border-[#b17b43]/45 bg-[#20362d]/90 px-2 py-3 text-center shadow-[0_4px_10px_#151b154d] transition duration-200 hover:-translate-y-1 hover:border-[#f2d18d] hover:bg-[#294338] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f3d897] sm:rounded-2xl sm:px-3"
      aria-label={`${badge.name} ${formatTier(tier.tier)}: ${Math.min(badge.currentProgress, tier.threshold)} of ${tier.threshold}`}
    >
      <div className="mx-auto w-fit transition-transform group-hover:scale-[1.04]"><BadgeArtwork badge={badge} tier={tier} earned={earned} /></div>
      <div className={`mt-2 text-[9px] font-bold uppercase tracking-[.1em] sm:text-[10px] ${earned ? "text-[#f0ce85]" : "text-[#b8c1ad]"}`}>
        Tier {badge.tiers.findIndex((item) => item.tier === tier.tier) + 1}
      </div>
      <div className="mt-1 truncate text-[9px] uppercase tracking-wider text-[#d0c4a3]">{formatTier(tier.tier)}</div>
      <div className={`mt-1 text-[8px] font-semibold uppercase tracking-[.12em] ${earned ? "text-[#e6bd70]" : "text-[#a6b0a1]"}`}>{earned ? "Earned" : "In progress"}</div>
      <TierProgress badge={badge} tier={tier} />
    </button>
  );
}

function BadgeSpot({ badge, onClick }: { badge: Badge; onClick: () => void }) {
  return (
    <button onClick={onClick} className="group min-w-0 rounded-xl border border-[#b17b43]/45 bg-[#20362d]/90 px-2 py-3 text-center shadow-[0_4px_10px_#151b154d] transition duration-200 hover:-translate-y-1 hover:border-[#f2d18d] hover:bg-[#294338] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f3d897] sm:rounded-2xl sm:px-3">
      <div className="mx-auto w-fit transition-transform group-hover:scale-[1.04]"><BadgeArtwork badge={badge} /></div>
      <div className={`mt-2 truncate text-[9px] font-bold uppercase tracking-[.09em] sm:text-[10px] ${badge.isEarned ? "text-[#f0ce85]" : "text-[#c0c6b7]"}`}>
        {badge.isEarned ? badge.name : "???"}
      </div>
      <div className={`mt-1 text-[8px] font-semibold uppercase tracking-[.12em] ${badge.isEarned ? "text-[#e6bd70]" : "text-[#a6b0a1]"}`}>{badge.isEarned ? "Earned" : "Locked"}</div>
      {badge.achievementType === "multiplier" && <div className="mt-1 text-[9px] text-[#d0c4a3]">{badge.count} earned</div>}
    </button>
  );
}

function SectionHeading({ label, description, count }: { label: string; description: string; count?: number }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-3 border-b border-[#d3a56b]/30 pb-3 sm:mb-5">
      <div className="min-w-0">
        <h3 className="font-['Georgia'] text-base font-bold tracking-wide text-[#f3d99e] sm:text-lg">{label}</h3>
        <p className="mt-1 text-[11px] leading-relaxed text-[#d0c4a3] sm:text-xs">{description}</p>
      </div>
      {count !== undefined && <span className="shrink-0 rounded-full border border-[#d3a56b]/40 bg-[#1c3028] px-2.5 py-1 font-mono text-[9px] uppercase tracking-wider text-[#e0c48a]">{count} {count === 1 ? "award" : "spots"}</span>}
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
    <section className="relative rounded-2xl border border-[#b17b43]/25 bg-[#172c24]/65 p-3.5 sm:p-5">
      <SectionHeading label={label} description={description} count={spotCount} />
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4">
        {badges.flatMap((badge) =>
          badge.achievementType === "tiered"
            ? badge.tiers.map((tier) => <TierSpot key={`${badge.id}-${tier.tier}`} badge={badge} tier={tier} onClick={() => onSelect(badge, tier)} />)
            : [<BadgeSpot key={badge.id} badge={badge} onClick={() => onSelect(badge)} />],
        )}
      </div>
    </section>
  );
}

function CabinetShelf({
  label,
  description,
  count,
  children,
}: {
  label: string;
  description: string;
  count?: number;
  children: ReactNode;
}) {
  return (
    <section className="relative mb-5 rounded-xl border border-[#b87e49]/55 bg-[linear-gradient(180deg,#244036_0%,#1b3028_74%,#17271f_100%)] px-3 pb-4 pt-4 shadow-[inset_0_1px_0_#f5d6a21c,0_12px_18px_#0c1813a3] sm:mb-7 sm:rounded-2xl sm:px-5 sm:pb-6 sm:pt-5">
      <SectionHeading label={label} description={description} count={count} />
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4">
        {children}
      </div>
      <div aria-hidden="true" className="absolute -bottom-2.5 left-1 right-1 h-3 rounded-b-sm border-x border-b border-[#704324] bg-[linear-gradient(180deg,#c18b55_0%,#93603a_48%,#704324_100%)] shadow-[0_8px_10px_#0c120f70] sm:-bottom-3 sm:h-4" />
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

  const earnedCount = data?.sections.reduce((total, section) => total + section.badges.reduce((sectionTotal, badge) => {
    if (section.category === "achievement" && badge.achievementType === "tiered") {
      return sectionTotal + badge.tiers.filter((tier) =>
        badge.earnedTiers.includes(tier.tier) || badge.currentProgress >= tier.threshold,
      ).length;
    }
    return sectionTotal + Number(badge.isEarned);
  }, 0), 0) ?? 0;

  return (
    <div
      className="min-h-screen px-3 pb-24 pt-5 text-[#304038] sm:px-6 sm:pt-8"
      style={{
        backgroundColor: "#e9e1cf",
        backgroundImage: "radial-gradient(ellipse at 50% -15%, #fff9e9 0%, transparent 56%), linear-gradient(115deg, #ded5c0 0%, #f0e9d9 48%, #ddd3bf 100%)",
      }}
    >
      <div className="mx-auto max-w-6xl">
        <div className="mb-5 flex items-center justify-between gap-3">
          <button
            className="inline-flex items-center gap-2 rounded-full border border-[#9d815d]/25 bg-[#f7f0e2]/65 px-3.5 py-2 text-xs font-semibold text-[#6a715f] transition hover:bg-[#fffaf0] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9b713f]"
            onClick={() => navigate("/profile")}
          >
            <ArrowLeft size={15} /> Profile
          </button>
          <div className="flex w-fit items-center gap-3 rounded-2xl border border-[#b49365]/35 bg-[#f6efdf]/75 px-4 py-3 shadow-[0_4px_14px_#73664a12]">
            <span className="flex h-10 w-10 items-center justify-center rounded-full border border-[#c39153]/50 bg-[#e9d3aa] text-[#8b6034]"><Trophy size={18} /></span>
            <div>
              <div className="font-mono text-lg font-bold leading-none text-[#5e4b31]">{earnedCount}</div>
              <div className="mt-1 text-[9px] font-bold uppercase tracking-[.16em] text-[#82745e]">Career honors</div>
            </div>
          </div>
        </div>
        <header className="mb-6 sm:mb-8">
          <h1 className="mt-2 text-4xl font-bold tracking-tight text-[#344238] sm:text-5xl text-center">Trophy Case</h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-[#687367] text-center">League honors, team keepsakes, and milestones.</p>
        </header>
        {ageAccess === "loading" && (
          <div className="rounded-2xl border border-[#b49365]/40 bg-[#f6efdf]/60 p-8 text-center text-[#687367]">Verifying your age…</div>
        )}
        {ageAccess !== "loading" && ageAccess !== "eligible" && (
          <div className="mx-auto max-w-lg rounded-3xl border border-[#b49365]/40 bg-[#f6efdf] p-8 text-center shadow-[0_16px_35px_#54452b18]">
            <Lock className="mx-auto text-[#987040]" size={28} />
            {ageAccess === "testing" ? (
              <>
                <h2 className="mt-4 text-xl font-bold text-[#344238]">In Testing</h2>
                <p className="mt-2 text-sm text-[#687367]">The Trophy Case is currently available only to User U00001.</p>
              </>
            ) : (
              <>
                <h2 className="mt-4 text-xl font-bold text-[#344238]">Age verification required</h2>
                <p className="mt-2 text-sm text-[#687367]">
                  {ageAccess === "under_21"
                    ? "The Trophy Case is available only to users who are 21 or older."
                    : "Enter your date of birth in your profile so we can verify that you are 21 or older."}
                </p>
                <button
                  onClick={() => navigate("/profile")}
                  className="mt-6 rounded-xl border border-[#987040] px-5 py-3 text-xs font-bold uppercase tracking-wider text-[#805723] transition-colors hover:bg-[#ead9b7]"
                >
                  Go to Profile
                </button>
              </>
            )}
          </div>
        )}
        {ageAccess === "eligible" && (
          <>
            {isLoading && <div className="rounded-2xl border border-[#b49365]/40 bg-[#f6efdf]/60 p-8 text-center text-[#687367]">Loading your trophy case…</div>}
            {isError && <div className="rounded-2xl border border-[#a34f3d]/50 bg-[#f5e6dc] p-8 text-center text-[#8b4333]">Could not load your trophy case.</div>}
            {data && (
              <div
                className="relative mx-auto max-w-5xl rounded-[2rem] border-[7px] border-[#5b3925] p-2 shadow-[0_30px_70px_#55452a40,0_8px_18px_#57432d35,inset_0_0_0_2px_#d1a06a] sm:rounded-[2.5rem] sm:border-[12px] sm:p-3 pl-[0px] pt-[0px] pr-[0px] pb-[0px] border-t-[#000000] border-r-[#000000] border-b-[#000000] border-l-[#000000]"
                style={{
                  background: "repeating-linear-gradient(90deg,#754b2d 0,#754b2d 8px,#835637 10px,#6b4127 18px,#815333 29px)",
                  boxShadow: "0 30px 70px #55452a40, 0 8px 18px #57432d35, inset 0 0 0 2px #d1a06a",
                }}
              >
                <div aria-hidden="true" className="pointer-events-none absolute inset-[3px] rounded-[1.6rem] border border-[#e1b678]/60 sm:inset-[5px] sm:rounded-[2rem]" />
                <div
                  className="relative overflow-hidden rounded-[1.4rem] border-[5px] border-[#b37b49] bg-[#1b3028] shadow-[inset_0_0_0_2px_#432c1c,inset_0_0_45px_#070e0a] sm:rounded-[1.8rem] sm:border-[8px]"
                  style={{
                    backgroundImage: "radial-gradient(ellipse at 50% 0%, #b4854e36 0%, transparent 38%), radial-gradient(ellipse at 50% 10%, #dfb56b18 0%, transparent 58%), linear-gradient(90deg,#182a23,#20372d 12%,#1c3229 50%,#20372d 88%,#182a23)",
                  }}
                >
                  <div aria-hidden="true" className="pointer-events-none absolute inset-x-8 top-0 z-10 h-12 bg-[linear-gradient(180deg,#f5d59c42,transparent)] blur-sm sm:inset-x-16 sm:h-16" />
                  <div aria-hidden="true" className="pointer-events-none absolute left-2 top-0 z-10 h-full w-1 bg-gradient-to-b from-[#d7ae72]/60 via-[#a87543]/35 to-transparent sm:left-3 sm:w-1.5" />
                  <div aria-hidden="true" className="pointer-events-none absolute right-2 top-0 z-10 h-full w-1 bg-gradient-to-b from-[#d7ae72]/60 via-[#a87543]/35 to-transparent sm:right-3 sm:w-1.5" />
                  <div className="pointer-events-none absolute inset-0 z-10 bg-[linear-gradient(112deg,transparent_0%,#ffffff08_15%,transparent_31%,transparent_73%,#ffffff06_100%)]" />
                  <div className="relative z-0 px-3 pb-7 pt-5 sm:px-8 sm:pb-9 sm:pt-7">
                    <div className="mb-6 flex items-center justify-between gap-3 border-b border-[#c18b55]/35 pb-4 sm:mb-8 sm:pb-5">
                      <div>
                        <p className="text-[8px] font-bold uppercase tracking-[.26em] text-[#d2ac73] sm:text-[9px]">The collection of</p>
                        <h2 className="mt-1 font-['Georgia'] text-xl font-bold text-[#f1dfb5] sm:text-2xl">Your career, on display</h2>
                      </div>
                      <div className="shrink-0 rounded-md border border-[#c18b55]/50 bg-[#172820]/70 px-2.5 py-1.5 text-center shadow-[inset_0_1px_3px_#0008] sm:px-4">
                        <div className="font-mono text-[10px] font-bold tracking-[.18em] text-[#e8ca8d]">ROSTER HOCKEY</div>
                        <div className="mt-0.5 text-[7px] uppercase tracking-[.17em] text-[#a9a183]">Player honors</div>
                      </div>
                    </div>
                    <div className="space-y-7 sm:space-y-9">
                      {data.sections.filter((section) => section.category !== "achievement").map((section) => {
                        const earnedBadges = section.badges.filter((badge) => badge.isEarned);
                        if (earnedBadges.length === 0) return null;
                        return (
                          <CabinetShelf
                            key={section.category}
                            label={section.label}
                            description={section.category === "nhl_trophy" ? "League-awarded trophies." : "Badges awarded by team captains."}
                            count={earnedBadges.length}
                          >
                            {earnedBadges.map((badge) => <BadgeSpot key={badge.id} badge={badge} onClick={() => selectBadge(badge)} />)}
                          </CabinetShelf>
                        );
                      })}
                      <section className="relative rounded-2xl border border-[#c18b55]/55 bg-[linear-gradient(180deg,#293c31,#1b3028_35%,#172820)] p-3.5 shadow-[inset_0_1px_0_#f5d6a21c,0_12px_18px_#0c1813a3] sm:rounded-3xl sm:p-5">
                        <div className="mb-5 border-b border-[#d3a56b]/30 pb-4 sm:mb-6">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                            <div>
                              <p className="text-[9px] font-bold uppercase tracking-[.25em] text-[#c49a61]">Milestones &amp; records</p>
                              <h2 className="mt-1 font-['Georgia'] text-2xl font-bold text-[#f3d99e] sm:text-3xl">Achievements</h2>
                              <p className="mt-1 max-w-xl text-[11px] leading-relaxed text-[#d0c4a3] sm:text-xs">Every tier has its own spot and progress bar. Progress is capped at that tier’s target.</p>
                            </div>
                            <span className="w-fit rounded-full border border-[#d3a56b]/40 bg-[#1c3028] px-3 py-1.5 font-mono text-[9px] uppercase tracking-wider text-[#e0c48a]">Progress tracked</span>
                          </div>
                        </div>
                        <div className="space-y-5 sm:space-y-6">
                          {ACHIEVEMENT_SECTIONS.filter((group) => !("goalieOnly" in group) || !group.goalieOnly || data.isGoalie).map((group) => {
                            const achievementBadges = data.sections.find((section) => section.category === "achievement")?.badges ?? [];
                            const badges = "slug" in group
                              ? achievementBadges.filter((badge) => badge.slug === group.slug)
                              : achievementBadges.filter((badge) => group.types.includes(badge.achievementType as typeof group.types[number]));
                            return <AchievementSection key={group.key} label={group.label} description={group.description} badges={badges} onSelect={selectBadge} />;
                          })}
                        </div>
                        <div aria-hidden="true" className="absolute -bottom-3 left-1 right-1 h-4 rounded-b-sm border-x border-b border-[#704324] bg-[linear-gradient(180deg,#c18b55_0%,#93603a_48%,#704324_100%)] shadow-[0_8px_10px_#0c120f70]" />
                      </section>
                    </div>
                    <div className="mt-8 flex items-center justify-center gap-2 text-[8px] font-bold uppercase tracking-[.22em] text-[#a58c61] sm:mt-10">
                      <span className="h-px w-8 bg-[#b78950]/40" />
                      Made of good seasons
                      <span className="h-px w-8 bg-[#b78950]/40" />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
      {selected && (
        <div className="badge-detail-stage fixed inset-0 z-50 flex items-center justify-center bg-[#1b241e]/75 p-4 backdrop-blur-sm sm:p-6" onClick={closeBadge}>
          <div className={`badge-detail-card w-full max-w-lg rounded-[2rem] border border-[#c18b55]/55 bg-[#f1e8d6] p-5 text-[#344238] shadow-[0_24px_80px_#131b16a8] sm:p-7 ${revealingId === `${selected.badge.id}:${selected.tier?.tier ?? "badge"}` ? "badge-detail-card-active" : ""}`} onClick={(event) => event.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between gap-3">
              <button onClick={previewAnnouncement} className="inline-flex items-center gap-2 rounded-lg border border-[#9b713f]/50 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-[#805723] transition-colors hover:bg-[#e7d7b9]" aria-label="Preview achievement announcement">
                <Sparkles size={14} />
                Preview announcement
              </button>
              <button onClick={closeBadge} className="rounded-full p-1 text-[#74786c] transition hover:bg-[#dfd4bd]" aria-label="Close badge details"><X size={20} /></button>
            </div>
            <div className={`flex flex-col items-center text-center ${revealingId === `${selected.badge.id}:${selected.tier?.tier ?? "badge"}` ? "badge-detail-reveal" : ""}`}><BadgeArtwork badge={selected.badge} tier={selected.tier} earned={selected.tier ? selected.badge.earnedTiers.includes(selected.tier.tier) || selected.badge.currentProgress >= selected.tier.threshold : selected.badge.isEarned} large /></div>
            <h2 className={`mt-5 text-center font-['Georgia'] text-2xl font-bold ${selected.badge.isEarned ? "text-[#9a6a2f]" : "text-[#71786d]"}`}>{selected.badge.isEarned ? selected.badge.name : "???"}</h2>
            {selected.tier && <p className="mt-1 text-center text-xs font-semibold uppercase tracking-wider text-[#987040]">{formatTier(selected.tier.tier)} · target {selected.tier.threshold}</p>}
            <p className="mt-2 text-center text-sm text-[#687367]">{selected.badge.isEarned ? selected.badge.description : (selected.badge.lockedHint || "Keep playing to discover this badge.")}</p>
            {selected.badge.isEarned && selected.badge.earnedAt && <p className="mt-3 text-center text-xs text-[#828273]">Earned {new Date(selected.badge.earnedAt).toLocaleDateString()}</p>}
            {selected.tier ? <TierProgress badge={selected.badge} tier={selected.tier} /> : selected.badge.tiers.length > 0 && <div className="mt-6 flex flex-wrap justify-center gap-2">{selected.badge.tiers.map((tier) => <span key={tier.tier} className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase ${selected.badge.earnedTiers.includes(tier.tier) ? "border-[#ae7b42]/60 bg-[#ead7b3] text-[#815a31]" : "border-[#c8c4b3] text-[#828273]"}`}>{formatTier(tier.tier)} · {tier.threshold}</span>)}</div>}
            {selected.badge.achievementType === "multiplier" && <p className="mt-5 text-center text-xl font-bold text-[#9a6a2f]">×{selected.badge.count}</p>}
            {!selected.badge.isEarned && <Lock className="mx-auto mt-5 text-[#7d8579]" size={18} />}
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