import { useMemo } from "react";
import { useLocation } from "wouter";
import {
  ArrowUpRight,
  ChevronDown,
  CircleHelp,
  Compass,
  House,
  MessagesSquare,
  MoreHorizontal,
  Shield,
  UsersRound,
  WalletCards,
  CalendarDays,
  type LucideIcon,
} from "lucide-react";
import {
  getSkin,
  ROLE_LABELS,
  SKIN_TABS,
  skinPathAllowed,
  type SkinContext,
  type SkinTeam,
} from "@shared/teamSkin";
import "./team-skin-shell.css";

type TeamSkinShellProps = {
  context: SkinContext;
  activeTeam: SkinTeam;
  onTeamChange: (id: string) => void;
};

const TAB_ICONS: Record<string, LucideIcon> = {
  Home: House,
  Schedule: CalendarDays,
  Roster: UsersRound,
  Chat: MessagesSquare,
  More: MoreHorizontal,
  Payments: WalletCards,
  Family: Shield,
  Team: UsersRound,
};

export function TeamSkinShell({ context, activeTeam, onTeamChange }: TeamSkinShellProps) {
  const [location, navigate] = useLocation();
  const childMode = context.actor.type === "child";

  const authorizedTeams = useMemo(
    () =>
      context.teams.filter(
        (team) =>
          team.status === "approved" &&
          (!childMode ||
            (team.program_type === "high_school" && team.role === "player")),
      ),
    [context.teams, childMode],
  );

  const selectedTeam = authorizedTeams.find((team) => team.id === activeTeam.id);
  const safeTeam = selectedTeam ?? authorizedTeams[0];
  let skin: ReturnType<typeof getSkin> | null = null;
  try {
    skin = getSkin(context.actor, safeTeam ?? null);
  } catch {
    skin = null;
  }

  const allowed = Boolean(
    safeTeam &&
      skin &&
      skin !== "adult" &&
      skinPathAllowed(skin, location),
  );

  if (!safeTeam || !skin || skin === "adult") {
    const adultTeamSelected = skin === "adult";
    return (
      <main className="tss tss-denied" data-testid="team-skin-shell">
        <section className="tss-denied-card" data-testid="skin-route-denied">
          <span className="tss-kicker">TEAM ACCESS</span>
          <div className="tss-denied-mark"><CircleHelp size={25} /></div>
          <h1>{adultTeamSelected ? "This team uses a different space" : "No approved team found"}</h1>
          <p>
            {adultTeamSelected
              ? "The adult team experience is outside this high school team space."
              : "This team space is not available in the current approved context."}
          </p>
          <button
            className="tss-return-button"
            type="button"
            onClick={() => navigate("/high-school/home")}
          >
            Return to team home
          </button>
        </section>
      </main>
    );
  }

  const tabs = SKIN_TABS[skin];
  const currentTab = tabs.find((tab) => location === `/high-school/${tab.toLowerCase()}`);
  const roleLabel = ROLE_LABELS[safeTeam.role];

  return (
    <main className="tss" data-testid="team-skin-shell">
      <div className="tss-layout">
        <header className="tss-header">
          <div className="tss-brand">
            <div className="tss-brand-mark" aria-hidden="true"><span /></div>
            <span>Roster<span className="tss-brand-hockey">Hockey</span></span>
            <span className="tss-brand-divider" />
            <span className="tss-brand-context">TEAM SPACE</span>
          </div>
          <div className="tss-header-meta">
            <span className="tss-context-dot" />
            {childMode ? "Player view" : "High school"}
          </div>
        </header>

        <div className="tss-body">
          <section className="tss-teambar">
            <div className="tss-team-identity">
              <div className="tss-team-monogram" aria-hidden="true">
                {safeTeam.name.trim().slice(0, 1).toUpperCase()}
              </div>
              <div className="tss-team-copy">
                <span className="tss-eyebrow">CURRENT TEAM</span>
                <h1>{safeTeam.name}</h1>
                <span className="tss-role" data-testid="skin-role-label">
                  <span className="tss-role-pin" />
                  {roleLabel}
                </span>
              </div>
            </div>
            {!childMode && (
              <label className="tss-switcher-wrap" data-testid="skin-team-switcher">
                <span className="tss-switcher-label">Switch team</span>
                <span className="tss-switcher-control">
                  <select
                    aria-label="Choose active team"
                    value={safeTeam.id}
                    disabled={authorizedTeams.length < 2}
                    onChange={(event) => onTeamChange(event.currentTarget.value)}
                  >
                    {authorizedTeams.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name} — {ROLE_LABELS[team.role]}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={17} aria-hidden="true" />
                </span>
              </label>
            )}
          </section>

          <div className="tss-content">
            {allowed ? (
              <section className="tss-welcome" aria-live="polite">
                <div className="tss-welcome-top">
                  <span className="tss-kicker"><span className="tss-live-dot" /> APPROVED TEAM SPACE</span>
                  <span className="tss-section-index">01 / FOUNDATION</span>
                </div>
                <div className="tss-welcome-copy">
                  <span className="tss-overline">YOUR TEAM. YOUR ROLE.</span>
                  <h2>{currentTab === "Home" || !currentTab ? "One team, right now." : `${currentTab}, for this team.`}</h2>
                  <p>
                    You’re here as <strong>{roleLabel}</strong> with <strong>{safeTeam.name}</strong>.
                    Team tools and operational content are awaiting the next approved phase.
                  </p>
                </div>
                <div className="tss-note">
                  <div className="tss-note-icon"><Compass size={19} /></div>
                  <div>
                    <strong>A clear place to start</strong>
                    <span>This foundation confirms your team and role. No games, messages, or transactions are active here yet.</span>
                  </div>
                  <ArrowUpRight className="tss-note-arrow" size={18} />
                </div>
              </section>
            ) : (
              <section className="tss-denied-card" data-testid="skin-route-denied">
                <span className="tss-kicker">NOT AVAILABLE IN THIS TEAM SPACE</span>
                <div className="tss-denied-mark"><Shield size={25} /></div>
                <h2>That destination isn’t available here.</h2>
                <p>This route is outside the approved experience for your current team and role.</p>
                <button className="tss-return-button" type="button" onClick={() => navigate("/high-school/home")}>
                  Return to team home
                </button>
              </section>
            )}
          </div>
        </div>

        <nav className="tss-tabs" aria-label="Team navigation">
          {tabs.map((tab) => {
            const Icon = TAB_ICONS[tab] ?? House;
            const active = location === `/high-school/${tab.toLowerCase()}`;
            return (
              <button
                key={tab}
                type="button"
                className={`tss-tab${active ? " is-active" : ""}`}
                onClick={() => navigate(`/high-school/${tab.toLowerCase()}`)}
                aria-current={active ? "page" : undefined}
                data-testid={`skin-tab-${tab.toLowerCase()}`}
              >
                <span className="tss-tab-icon"><Icon size={19} strokeWidth={active ? 2.25 : 1.8} /></span>
                <span>{tab}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </main>
  );
}
