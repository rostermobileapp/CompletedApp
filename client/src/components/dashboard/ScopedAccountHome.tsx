import { useState, useSyncExternalStore, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { BottomNavigationView } from "@/components/BottomNavigationView";
import type { MainScreenId } from "@/lib/mainNavRoutes";
import { useKeyboard } from "@/hooks/use-keyboard";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  HomeHeader, HomeShortcutCards, HomeSummaryCards, HomeTeamSelector,
  HomeScheduleToolbar, HomeScheduleCard,
} from "./HomePresentation";

/** Presentation only. This file must not import adult account data hooks. */
export interface ScopedHomeEvent {
  id: string;
  title?: string;
  startsAt?: string;
  location?: string;
  opponent?: string;
  teamId?: string;
  status?: string;
}
export interface ScopedHomeTeam { id: string; name: string; role?: string }

function subscribeTheme(change: () => void) {
  const observer = new MutationObserver(change);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}
const darkSnapshot = () => document.documentElement.classList.contains("dark");

export function ScopedAccountFrame({ name, teams, selectedTeamId, onTeamChange, activeId, onNavigate,
  onRefresh, refreshing, onSignOut, menu, children }: {
  name: string;
  teams: ScopedHomeTeam[];
  selectedTeamId?: string;
  onTeamChange: (id: string) => void;
  activeId: MainScreenId;
  onNavigate: (id: MainScreenId) => void;
  onRefresh: () => void;
  refreshing?: boolean;
  onSignOut?: () => void;
  menu?: ReactNode;
  children: ReactNode;
}) {
  const dark = useSyncExternalStore(subscribeTheme, darkSnapshot, () => true);
  const keyboard = useKeyboard();
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const selected = teams.find(team => team.id === selectedTeamId) ?? teams[0];
  return <div className="min-h-screen flex flex-col bg-background text-foreground pb-[calc(100px+var(--native-inset-bottom,env(safe-area-inset-bottom,0px)))]"
    data-testid="scoped-account-home">
    <HomeHeader dark={dark}
      avatar={<span className="text-primary-foreground text-lg font-semibold">{name.charAt(0).toUpperCase() || "U"}</span>}
      onProfile={() => onNavigate("profile")} onRefresh={onRefresh} refreshing={refreshing}
      onMenu={() => setMenuOpen(true)} />
    <HomeTeamSelector label={selected ? `${selected.name}${selected.role ? ` · ${selected.role}` : ""}` : "No team connected"} open={selectorOpen} onClick={() => setSelectorOpen(open => !open)}>
      {teams.length ? teams.map(team => <button key={team.id} type="button"
        className="w-full p-3 text-left hover:bg-muted/50 transition-colors text-sm"
        aria-current={selected?.id === team.id ? "true" : undefined}
        onClick={() => { onTeamChange(team.id); setSelectorOpen(false); }}>
        {team.name}{team.role && <span className="block text-xs text-muted-foreground">{team.role}</span>}
      </button>) : <p className="p-3 text-sm text-muted-foreground">Your approved team will appear here when it is connected.</p>}
    </HomeTeamSelector>
    {selected?.role && <p className="sr-only" data-testid="skin-role-label">{selected.role}</p>}
    {children}
    {!keyboard.isOpen && <BottomNavigationView activeId={activeId} onNavigate={onNavigate} />}
    <Dialog open={menuOpen} onOpenChange={setMenuOpen}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Menu</DialogTitle><DialogDescription>{name}{selected ? ` · ${selected.name}` : ""}</DialogDescription></DialogHeader>
        <div className="grid gap-2 [&_button]:min-h-11 [&_button]:rounded-lg [&_button]:border [&_button]:px-4 [&_button]:text-left">
          <button type="button" onClick={() => { onNavigate("home"); setMenuOpen(false); }}>Home</button>
          <button type="button" onClick={() => { onNavigate("teams"); setMenuOpen(false); }}>My Team</button>
          <button type="button" onClick={() => { onNavigate("messages"); setMenuOpen(false); }}>Messages</button>
          {menu}
          {onSignOut && <button type="button" onClick={onSignOut}>Sign out of player session</button>}
        </div>
      </DialogContent>
    </Dialog>
  </div>;
}

export function ScopedHomeNotice({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent>
      <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription asChild><div>{children}</div></DialogDescription></DialogHeader>
    </DialogContent>
  </Dialog>;
}

export function ScopedHomeFeed({ events, teamName, onUnavailable, onAlerts, alerts = 0, onAdd, onAll,
  onEvent, fullSchedule = false, status }: {
  events: ScopedHomeEvent[];
  teamName?: string;
  onUnavailable: (feature: string) => void;
  onAlerts: () => void;
  alerts?: number;
  onAdd?: () => void;
  onAll: () => void;
  onEvent?: (event: ScopedHomeEvent) => void;
  fullSchedule?: boolean;
  status?: ReactNode;
}) {
  const [view, setView] = useState<"list" | "calendar">("list");
  const [selectedEvent, setSelectedEvent] = useState<ScopedHomeEvent>();
  const upcoming = events.filter(event => event.status !== "final" &&
    (!event.startsAt || Date.parse(event.startsAt) >= Date.now()))
    .sort((a, b) => (Date.parse(a.startsAt ?? "") || 0) - (Date.parse(b.startsAt ?? "") || 0));
  const visible = fullSchedule ? upcoming : upcoming.slice(0, 5);
  const openEvent = (event: ScopedHomeEvent) => onEvent ? onEvent(event) : setSelectedEvent(event);
  return <>
    {!fullSchedule && <>
      <HomeShortcutCards onWall={() => onUnavailable("Wall")} onPhotos={() => onUnavailable("Photos")}
        onStats={() => onUnavailable("Stats")} onStandings={() => onUnavailable("Standings")} />
      <HomeSummaryCards gamesRemaining={upcoming.filter(event => !!event.opponent).length} teamName={teamName}
        onAchievements={() => onUnavailable("Achievements")} onAlerts={onAlerts} alerts={alerts} />
    </>}
    <section className="px-6 mt-0 mb-[8px]">
      <HomeScheduleToolbar view={view} onViewChange={setView} onViewAll={onAll} onAdd={onAdd} />
      {view === "calendar" ? <ScopedScheduleCalendar events={upcoming} onEvent={openEvent} /> :
        visible.length ? <div className="space-y-3">{visible.map(event =>
          <HomeScheduleCard key={event.id} title={event.opponent ? `vs ${event.opponent}` : event.title || "Team event"}
            subtitle={eventDate(event)} badge={event.opponent ? "Game" : "Event"} onView={() => openEvent(event)} />
        )}</div> : <div className="rounded-xl hairline elev-rest p-4 bg-[#e2e2e2] dark:bg-[#212121]">
          <p className="text-sm text-muted-foreground">No schedule items yet.</p>
        </div>}
      {status && <div className="mt-4">{status}</div>}
    </section>
    {selectedEvent && <ScopedHomeNotice title={selectedEvent.opponent ? `vs ${selectedEvent.opponent}` : selectedEvent.title || "Team event"}
      onClose={() => setSelectedEvent(undefined)}>
      <p>{eventDate(selectedEvent) || "Time to be confirmed"}</p>
      {selectedEvent.location && <p className="mt-2">{selectedEvent.location}</p>}
    </ScopedHomeNotice>}
  </>;
}

function eventDate(event: ScopedHomeEvent) {
  if (!event.startsAt || !Number.isFinite(Date.parse(event.startsAt))) return "";
  return new Date(event.startsAt).toLocaleString(undefined, {month:"short",day:"numeric",hour:"numeric",minute:"2-digit"});
}

/** Authorized event values only; unlike the adult calendar, it has no mutations or API imports. */
function ScopedScheduleCalendar({ events, onEvent }: { events: ScopedHomeEvent[]; onEvent: (event: ScopedHomeEvent) => void }) {
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const dayCount = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  return <div className="rounded-xl hairline elev-rest p-3 bg-[#e2e2e2] dark:bg-[#212121]" aria-label="Team schedule calendar">
    <div className="flex justify-between items-center mb-3">
      <button className="p-2" aria-label="Previous month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronLeft size={18}/></button>
      <h3 className="text-sm font-semibold">{month.toLocaleString(undefined, {month:"long",year:"numeric"})}</h3>
      <button className="p-2" aria-label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><ChevronRight size={18}/></button>
    </div>
    <div className="grid grid-cols-7 gap-1 text-center text-xs">
      {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(day => <div key={day} className="text-muted-foreground py-2">{day}</div>)}
      {Array.from({length:month.getDay()}, (_, i) => <div key={`blank-${i}`}/>)}
      {Array.from({length:dayCount}, (_, i) => {
        const date = new Date(month.getFullYear(), month.getMonth(), i + 1);
        const dayEvents = events.filter(event => event.startsAt && new Date(event.startsAt).toDateString() === date.toDateString());
        return <div key={i} className="min-h-14 rounded border border-border py-1 min-w-0">
          <span>{i + 1}</span>
          {dayEvents.map(event => <button key={event.id} onClick={() => onEvent(event)}
            className="block w-full rounded bg-blue-500/20 text-primary p-0.5 text-[9px] truncate text-left"
            aria-label={`${event.title || "Team event"}, ${eventDate(event)}`}>{event.title || "Team event"}</button>)}
        </div>;
      })}
    </div>
  </div>;
}

export function ScopedPageHeading({ title, children, onBack }: { title: string; children?: ReactNode; onBack?: () => void }) {
  return <div className="px-6 py-4">
    <div className="flex items-center justify-between gap-3 mb-3"><h1 className="text-lg font-semibold">{title}</h1>
      {onBack && <button type="button" aria-label="Back" className="p-2" onClick={onBack}><X size={18}/></button>}</div>
    {children}
  </div>;
}
