import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import {
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  List as ListIcon,
  Trophy,
  MapPin,
  Clock,
  Plus,
} from 'lucide-react';
import { setPageTransitionDirection } from '@/components/PageTransition';
import {
  cardClass,
  cardStyle,
  sectionTitleClass,
  EVENT_COLORS,
} from './cardStyles';

interface ScheduleCalendarProps {
  selectedTeamId?: string | null;
  effectiveLeagueId?: string | null;
  userTeamIds: string[];
  /** When true, the user has selected a league. Filter to events involving
   *  any team the user belongs to in that league rather than a single team. */
  isLeagueScope?: boolean;
  leagueTeamIds?: string[];
  /** Opens the global add-event dialog (rendered in Dashboard.tsx). When
   *  provided, an "+ Add" button appears in the Schedule header. */
  onAddEvent?: () => void;
}

export type EventType = 'game' | 'practice' | 'social' | 'tournament';

interface ScheduleEvent {
  id: string;
  date: Date;
  type: EventType;
  title: string;
  // For games we may have an opposing team to navigate to a game detail page
  navigateTo?: string;
  location?: string | null;
  // User-selected color from the Add Event dialog (hex string), if any
  color?: string | null;
}

export function ScheduleCalendar({
  selectedTeamId,
  effectiveLeagueId: _effectiveLeagueId,
  userTeamIds,
  isLeagueScope = false,
  leagueTeamIds,
  onAddEvent,
}: ScheduleCalendarProps) {
  const [, navigate] = useLocation();
  const [view, setView] = useState<'calendar' | 'list'>('calendar');
  const [cursorMonth, setCursorMonth] = useState<Date>(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const { data: rawGames } = useQuery<any[]>({
    queryKey: ['/api/user/games/upcoming'],
    staleTime: 30_000,
  });

  const { data: rawTeamEvents } = useQuery<any[]>({
    queryKey: ['/api/user/team-events'],
    staleTime: 30_000,
  });

  // Normalize all incoming events to a unified schedule shape
  const events = useMemo<ScheduleEvent[]>(() => {
    const out: ScheduleEvent[] = [];

    const leagueScopeSet =
      isLeagueScope && Array.isArray(leagueTeamIds) && leagueTeamIds.length
        ? new Set(leagueTeamIds)
        : null;

    if (Array.isArray(rawGames)) {
      for (const g of rawGames) {
        if (!g?.scheduledAt) continue;
        const d = new Date(g.scheduledAt);
        if (Number.isNaN(d.getTime())) continue;
        // Filter by selected team when applicable
        if (selectedTeamId) {
          const myMatch =
            g.homeTeam?.id === selectedTeamId ||
            g.awayTeam?.id === selectedTeamId ||
            g.homeTeamId === selectedTeamId ||
            g.awayTeamId === selectedTeamId ||
            g.isScrimmage; // keep scrimmages visible
          if (!myMatch) continue;
        } else if (leagueScopeSet) {
          // League-scope: only show games involving a user-team in this league.
          // Keep scrimmages visible since they aren't strictly league-bound.
          const inLeague =
            g.isScrimmage ||
            (g.homeTeam?.id && leagueScopeSet.has(g.homeTeam.id)) ||
            (g.awayTeam?.id && leagueScopeSet.has(g.awayTeam.id)) ||
            (g.homeTeamId && leagueScopeSet.has(g.homeTeamId)) ||
            (g.awayTeamId && leagueScopeSet.has(g.awayTeamId));
          if (!inLeague) continue;
        }
        const ourTeamId = userTeamIds.find(
          (id) =>
            id === g.homeTeam?.id ||
            id === g.awayTeam?.id ||
            id === g.homeTeamId ||
            id === g.awayTeamId,
        );
        const opponent =
          ourTeamId && (g.homeTeam || g.awayTeam)
            ? g.homeTeam?.id === ourTeamId
              ? g.awayTeam
              : g.homeTeam
            : null;
        const title = g.isScrimmage
          ? g.scrimmageTitle || 'Scrimmage'
          : opponent?.name
            ? `vs ${opponent.name}`
            : g.homeTeam && g.awayTeam
              ? `${g.homeTeam.name} vs ${g.awayTeam.name}`
              : 'Game';
        out.push({
          id: `game-${g.id}`,
          date: d,
          type: 'game',
          title,
          navigateTo: `/game/${g.id}`,
          location: g.venue || g.location || null,
          color: g.color ?? null,
        });
      }
    }

    if (Array.isArray(rawTeamEvents)) {
      for (const e of rawTeamEvents) {
        if (!e?.scheduledAt) continue;
        const d = new Date(e.scheduledAt);
        if (Number.isNaN(d.getTime())) continue;
        if (selectedTeamId && e.teamId !== selectedTeamId) continue;
        if (
          !selectedTeamId &&
          leagueScopeSet &&
          e.teamId &&
          !leagueScopeSet.has(e.teamId)
        ) {
          continue;
        }
        const t = (e.eventType || '').toLowerCase();
        let type: EventType = 'practice';
        if (t.includes('social')) type = 'social';
        else if (t.includes('tournament')) type = 'tournament';
        else if (t.includes('practice')) type = 'practice';
        else if (t.includes('scrimmage') || t === 'game') type = 'game';
        else type = 'practice';
        out.push({
          id: `tevent-${e.id}`,
          date: d,
          type,
          title: e.title || e.eventType || 'Event',
          navigateTo: `/team-event/${e.id}`,
          location: e.location || null,
          color: e.color ?? null,
        });
      }
    }

    out.sort((a, b) => a.date.getTime() - b.date.getTime());
    return out;
  }, [
    rawGames,
    rawTeamEvents,
    selectedTeamId,
    userTeamIds,
    isLeagueScope,
    leagueTeamIds,
  ]);

  // Group events by yyyy-MM-dd
  const eventsByDay = useMemo(() => {
    const map = new Map<string, ScheduleEvent[]>();
    for (const e of events) {
      const key = format(e.date, 'yyyy-MM-dd');
      const arr = map.get(key) || [];
      arr.push(e);
      map.set(key, arr);
    }
    return map;
  }, [events]);

  const goPrev = () => setCursorMonth((d) => addMonths(d, -1));
  const goNext = () => setCursorMonth((d) => addMonths(d, 1));

  // Build the 6-week grid
  const monthStart = startOfMonth(cursorMonth);
  const monthEnd = endOfMonth(cursorMonth);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const days: Date[] = [];
  for (let d = gridStart; d <= gridEnd; d = new Date(d.getTime() + 86_400_000)) {
    days.push(new Date(d));
  }

  return (
    <div
      className={cardClass}
      style={cardStyle}
      data-testid="card-schedule-calendar"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className={sectionTitleClass}>Schedule</div>
          <div
            className="flex items-center text-[12px] rounded-md p-0.5 bg-black/[0.04]"
            role="tablist"
            aria-label="Schedule view"
          >
            <button
              type="button"
              onClick={() => setView('calendar')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded transition-colors ${
                view === 'calendar'
                  ? 'bg-white text-[#212121]'
                  : 'text-[#666] hover:text-[#212121]'
              }`}
              style={
                view === 'calendar'
                  ? {
                      borderWidth: '0.5px',
                      borderStyle: 'solid',
                      borderColor: 'rgba(0,0,0,0.15)',
                    }
                  : undefined
              }
              data-testid="schedule-toggle-calendar"
            >
              <CalendarIcon className="w-3.5 h-3.5" /> Calendar
            </button>
            <button
              type="button"
              onClick={() => setView('list')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded transition-colors ${
                view === 'list'
                  ? 'bg-white text-[#212121]'
                  : 'text-[#666] hover:text-[#212121]'
              }`}
              style={
                view === 'list'
                  ? {
                      borderWidth: '0.5px',
                      borderStyle: 'solid',
                      borderColor: 'rgba(0,0,0,0.15)',
                    }
                  : undefined
              }
              data-testid="schedule-toggle-list"
            >
              <ListIcon className="w-3.5 h-3.5" /> List
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 text-[#212121]">
          {view === 'calendar' && (
            <>
              <button
                type="button"
                onClick={goPrev}
                className="p-1 rounded hover:bg-black/[0.05]"
                aria-label="Previous month"
                data-testid="schedule-prev-month"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div
                className="text-[14px] font-medium min-w-[120px] text-center"
                data-testid="schedule-month-label"
              >
                {format(cursorMonth, 'MMMM yyyy')}
              </div>
              <button
                type="button"
                onClick={goNext}
                className="p-1 rounded hover:bg-black/[0.05]"
                aria-label="Next month"
                data-testid="schedule-next-month"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </>
          )}
          {onAddEvent && (
            <button
              type="button"
              onClick={onAddEvent}
              className="ml-1 inline-flex items-center gap-1 rounded-md bg-primary text-primary-foreground text-[12px] font-medium px-2.5 py-1 hover:bg-primary/90 transition-colors"
              aria-label="Add event"
              data-testid="schedule-add-event"
            >
              <Plus className="w-3.5 h-3.5" /> Add
            </button>
          )}
        </div>
      </div>

      {view === 'calendar' ? (
        <CalendarGrid
          days={days}
          monthStart={monthStart}
          eventsByDay={eventsByDay}
          onEventClick={(e) => {
            if (!e.navigateTo) return;
            setPageTransitionDirection('up');
            navigate(e.navigateTo);
          }}
        />
      ) : (
        <ListView
          events={events}
          onClick={(e) => {
            if (!e.navigateTo) return;
            setPageTransitionDirection('up');
            navigate(e.navigateTo);
          }}
        />
      )}

    </div>
  );
}

function CalendarGrid({
  days,
  monthStart,
  eventsByDay,
  onEventClick,
}: {
  days: Date[];
  monthStart: Date;
  eventsByDay: Map<string, ScheduleEvent[]>;
  onEventClick: (e: ScheduleEvent) => void;
}) {
  const today = new Date();

  return (
    <div className="mt-3" data-testid="schedule-grid">
      <div className="grid grid-cols-7 text-[11px] text-[#888] mb-1.5">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <div key={d} className="text-center py-1">
            {d}
          </div>
        ))}
      </div>
      <div
        className="grid grid-cols-7 gap-px bg-border rounded-md overflow-hidden border border-border"
      >
        {days.map((d) => {
          const inMonth = isSameMonth(d, monthStart);
          const key = format(d, 'yyyy-MM-dd');
          const dayEvents = eventsByDay.get(key) || [];
          const isToday = isSameDay(d, today);
          return (
            <div
              key={key}
              className={`min-h-[96px] p-1 flex flex-col gap-1 text-[11px] ${inMonth ? 'bg-card' : 'bg-muted/40'}`}
              data-testid={`day-cell-${key}`}
            >
              <div className="flex items-center justify-between px-0.5">
                <span
                  className={`${isToday ? 'inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-[11px] font-medium' : 'text-foreground/70'} ${!inMonth ? 'opacity-50' : ''}`}
                >
                  {d.getDate()}
                </span>
              </div>
              <div className="flex flex-col gap-1 min-h-0">
                {dayEvents.slice(0, 3).map((ev) => {
                  const c = EVENT_COLORS[ev.type];
                  // Prefer the user-chosen color; fall back to the type-based tint.
                  const bg = ev.color || c.bg;
                  const text = ev.color ? getReadableTextColor(ev.color) : c.text;
                  return (
                    <button
                      type="button"
                      key={ev.id}
                      onClick={() => onEventClick(ev)}
                      disabled={!ev.navigateTo}
                      className="text-left rounded px-1.5 py-0.5 text-[10.5px] leading-tight flex flex-col"
                      style={{ backgroundColor: bg, color: text }}
                      title={`${ev.title} — ${format(ev.date, 'h:mm a')}`}
                      data-testid={`event-pill-${ev.id}`}
                    >
                      <span className="truncate font-medium">{ev.title}</span>
                      <span className="truncate text-[9.5px] opacity-90">
                        {format(ev.date, 'h:mm a').toLowerCase()}
                      </span>
                    </button>
                  );
                })}
                {dayEvents.length > 3 && (
                  <div className="text-[10px] text-[#888] px-1">
                    +{dayEvents.length - 3} more
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ListView({
  events,
  onClick,
}: {
  events: ScheduleEvent[];
  onClick: (e: ScheduleEvent) => void;
}) {
  if (events.length === 0) {
    return (
      <div
        className="mt-4 text-sm text-[#666] py-8 text-center"
        data-testid="schedule-list-empty"
      >
        No upcoming events.
      </div>
    );
  }
  return (
    <div className="mt-3 flex flex-col gap-2 max-h-[480px] overflow-y-auto">
      {events.map((e) => {
        const c = EVENT_COLORS[e.type];
        return (
          <button
            type="button"
            key={e.id}
            onClick={() => onClick(e)}
            disabled={!e.navigateTo}
            className="w-full text-left flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-black/[0.03] transition-colors"
            style={{
              borderWidth: '0.5px',
              borderStyle: 'solid',
              borderColor: 'rgba(0,0,0,0.12)',
            }}
            data-testid={`schedule-list-${e.id}`}
          >
            <div
              className="w-10 h-10 rounded-md flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: c.bg }}
            >
              <Trophy className="w-4 h-4" style={{ color: c.text }} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-medium text-[#212121] truncate">
                {e.title}
              </div>
              <div className="mt-0.5 flex items-center gap-3 text-[12px] text-[#666]">
                <span className="inline-flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {format(e.date, 'EEE MMM d • h:mm a')}
                </span>
                {e.location && (
                  <span className="inline-flex items-center gap-1 truncate">
                    <MapPin className="w-3 h-3" />
                    <span className="truncate">{e.location}</span>
                  </span>
                )}
              </div>
            </div>
            <span
              className="text-[10px] rounded px-2 py-0.5 capitalize"
              style={{ backgroundColor: c.bg, color: c.text }}
            >
              {e.type}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// Pick black or white text for the best contrast against an arbitrary hex bg.
function getReadableTextColor(hex: string): string {
  const m = hex.replace('#', '').trim();
  if (m.length !== 6) return '#fff';
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  if ([r, g, b].some((v) => Number.isNaN(v))) return '#fff';
  // Relative luminance (Rec. 709)
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance > 0.6 ? '#1f2937' : '#ffffff';
}
