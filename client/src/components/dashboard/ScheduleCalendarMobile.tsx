import { useMemo, useState } from 'react';
import { useLocation } from 'wouter';
import { useMutation, useQueryClient } from '@tanstack/react-query';
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
import { ChevronLeft, ChevronRight, Trophy, Clock, Calendar as CalendarIcon } from 'lucide-react';
import { EVENT_COLORS } from '@/components/home-desktop/cardStyles';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

type EventKind =
  | 'invite'
  | 'scrimmage'
  | 'reminder'
  | 'team-event'
  | 'team-event-scrimmage'
  | 'tournament'
  | 'game';

interface MobileCalendarEvent {
  id: string;
  date: Date;
  kind: EventKind;
  title: string;
  subtitle?: string | null;
  color: string;
  navigateTo?: string;
  teamAssignment?: string | null;
  scrimmageId?: string;
  isPending?: boolean;
}

interface ScheduleCalendarMobileProps {
  scrimmageInvites: any[];
  scrimmageRequests: any[];
  personalReminders: any[];
  teamEvents: any[];
  upcomingGames: any[];
  visibleTournaments: any[];
  primaryTeam?: { id?: string; name?: string } | null;
}

// Fallback colors mirror the desktop ScheduleCalendar palette (cardStyles.ts)
// where a corresponding type exists, so list/calendar/desktop look consistent.
// User-selected event colors always take precedence over these fallbacks.
const KIND_FALLBACK_COLOR: Record<EventKind, string> = {
  invite: '#eab308', // yellow — matches existing mobile invite badge
  scrimmage: EVENT_COLORS.game.borderTint, // approved scrimmage → desktop 'game'
  reminder: EVENT_COLORS.practice.borderTint, // green — closest desktop tone
  'team-event': EVENT_COLORS.practice.borderTint, // general team event → 'practice'
  'team-event-scrimmage': EVENT_COLORS.game.borderTint, // scrimmage → 'game'
  tournament: '#FFD700', // gold — matches existing mobile tournament card
  game: EVENT_COLORS.game.borderTint,
};

const KIND_BADGE_LABEL: Record<EventKind, string> = {
  invite: 'Invite',
  scrimmage: 'Scrimmage',
  reminder: 'Reminder',
  'team-event': 'Event',
  'team-event-scrimmage': 'Scrimmage',
  tournament: 'Bracket',
  game: 'Game',
};

function getReadableTextColor(hex: string): string {
  const m = hex.replace('#', '');
  if (m.length !== 3 && m.length !== 6) return '#ffffff';
  const full = m.length === 3 ? m.split('').map((c) => c + c).join('') : m;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? '#212121' : '#ffffff';
}

export function ScheduleCalendarMobile({
  scrimmageInvites,
  scrimmageRequests,
  personalReminders,
  teamEvents,
  upcomingGames,
  visibleTournaments,
  primaryTeam,
}: ScheduleCalendarMobileProps) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const joinInviteMutation = useMutation({
    mutationFn: async (scrimmageId: string) => {
      return await apiRequest('POST', `/api/scrimmages/${scrimmageId}/requests`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/users/scrimmage-invites'] });
      queryClient.invalidateQueries({ queryKey: ['/api/users/scrimmage-requests'] });
      queryClient.invalidateQueries({ queryKey: ['/api/user/games/upcoming'] });
      toast({ title: "You're In!", description: 'Your join request has been submitted and is pending approval.' });
    },
    onError: (error: any) => {
      toast({ title: 'Failed', description: error.message || 'Failed to send request.', variant: 'destructive' });
    },
  });

  const declineInviteMutation = useMutation({
    mutationFn: async (scrimmageId: string) => {
      return await apiRequest('POST', `/api/scrimmages/${scrimmageId}/decline-invite`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/users/scrimmage-invites'] });
      queryClient.invalidateQueries({ queryKey: ['/api/users/scrimmage-requests'] });
      queryClient.invalidateQueries({ queryKey: ['/api/user/games/upcoming'] });
      toast({ title: 'Invite Declined', description: "You've declined this scrimmage invite." });
    },
    onError: (error: any) => {
      toast({ title: 'Failed', description: error.message || 'Failed to decline invite.', variant: 'destructive' });
    },
  });

  const [cursorMonth, setCursorMonth] = useState<Date>(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [selectedDay, setSelectedDay] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });

  const events = useMemo<MobileCalendarEvent[]>(() => {
    const out: MobileCalendarEvent[] = [];

    if (Array.isArray(scrimmageInvites)) {
      for (const i of scrimmageInvites) {
        if (!i?.dateTime) continue;
        const d = new Date(i.dateTime);
        if (Number.isNaN(d.getTime())) continue;
        out.push({
          id: `invite-${i.id}`,
          date: d,
          kind: 'invite',
          title: i.title || 'Scrimmage Invite',
          subtitle: i.location || null,
          color: i.color || KIND_FALLBACK_COLOR.invite,
          navigateTo: `/scrimmage/${i.id}`,
          scrimmageId: i.id,
        });
      }
    }

    if (Array.isArray(scrimmageRequests)) {
      for (const r of scrimmageRequests) {
        if ((r?.status !== 'approved' && r?.status !== 'pending') || !r.scrimmage?.dateTime) continue;
        const s = r.scrimmage;
        const d = new Date(s.dateTime);
        if (Number.isNaN(d.getTime())) continue;
        out.push({
          id: `scrimmage-${s.id}`,
          date: d,
          kind: 'scrimmage',
          title: s.title || 'Scrimmage',
          subtitle: s.location || null,
          color: r.status === 'pending' ? '#f59e0b' : (s.color || KIND_FALLBACK_COLOR.scrimmage),
          navigateTo: `/scrimmage/${s.id}`,
          teamAssignment: r.teamAssignment ?? null,
          isPending: r.status === 'pending',
        });
      }
    }

    if (Array.isArray(personalReminders)) {
      for (const r of personalReminders) {
        if (r?.isCompleted || !r.scheduledAt) continue;
        const d = new Date(r.scheduledAt);
        if (Number.isNaN(d.getTime())) continue;
        out.push({
          id: `reminder-${r.id}`,
          date: d,
          kind: 'reminder',
          title: r.title || 'Reminder',
          subtitle: r.description || null,
          color: r.color || KIND_FALLBACK_COLOR.reminder,
        });
      }
    }

    if (Array.isArray(teamEvents)) {
      for (const e of teamEvents) {
        if (!e?.scheduledAt) continue;
        const d = new Date(e.scheduledAt);
        if (Number.isNaN(d.getTime())) continue;
        const isScrim = (e.eventType || '').toLowerCase() === 'scrimmage';
        out.push({
          id: `team-event-${e.id}`,
          date: d,
          kind: isScrim ? 'team-event-scrimmage' : 'team-event',
          title: e.title || (isScrim ? 'Scrimmage' : 'Event'),
          subtitle: e.location || e.teamName || null,
          color:
            e.color ||
            (isScrim
              ? KIND_FALLBACK_COLOR['team-event-scrimmage']
              : KIND_FALLBACK_COLOR['team-event']),
          navigateTo: `/team-event/${e.id}`,
        });
      }
    }

    if (Array.isArray(visibleTournaments)) {
      for (const t of visibleTournaments) {
        const ds = t?.startDate ?? t?.startsAt;
        if (!ds) continue;
        const d = new Date(ds);
        if (Number.isNaN(d.getTime())) continue;
        out.push({
          id: `tournament-${t.id}`,
          date: d,
          kind: 'tournament',
          title: t.name || 'Tournament',
          subtitle: t.leagueName || null,
          color: t.color || KIND_FALLBACK_COLOR.tournament,
          navigateTo: `/tournaments/${t.id}?tab=bracket&readonly=true`,
        });
      }
    }

    if (Array.isArray(upcomingGames)) {
      for (const g of upcomingGames) {
        if (!g?.scheduledAt) continue;
        const d = new Date(g.scheduledAt);
        if (Number.isNaN(d.getTime())) continue;
        let title = 'Game';
        if (g.isScrimmage) {
          title = g.scrimmageTitle || 'Scrimmage';
        } else if (g.isTournamentMatch) {
          const opp =
            g.homeTeam?.name?.toLowerCase() === primaryTeam?.name?.toLowerCase()
              ? g.awayTeam?.name
              : g.homeTeam?.name;
          title = opp ? `vs ${opp}` : 'Playoff';
        } else {
          const opp =
            g.homeTeam?.id === primaryTeam?.id ? g.awayTeam?.name : g.homeTeam?.name;
          title = opp ? `vs ${opp}` : 'Game';
        }
        out.push({
          id: `game-${g.id}`,
          date: d,
          kind: 'game',
          title,
          subtitle: g.venue || g.location || null,
          color: g.color || KIND_FALLBACK_COLOR.game,
          navigateTo: `/game/${g.id}`,
        });
      }
    }

    out.sort((a, b) => a.date.getTime() - b.date.getTime());
    return out;
  }, [
    scrimmageInvites,
    scrimmageRequests,
    personalReminders,
    teamEvents,
    upcomingGames,
    visibleTournaments,
    primaryTeam,
  ]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, MobileCalendarEvent[]>();
    for (const e of events) {
      const key = format(e.date, 'yyyy-MM-dd');
      const arr = map.get(key) || [];
      arr.push(e);
      map.set(key, arr);
    }
    return map;
  }, [events]);

  const monthStart = startOfMonth(cursorMonth);
  const monthEnd = endOfMonth(cursorMonth);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const days: Date[] = [];
  for (let d = gridStart; d <= gridEnd; d = new Date(d.getTime() + 86_400_000)) {
    days.push(new Date(d));
  }

  const today = new Date();
  const selectedKey = format(selectedDay, 'yyyy-MM-dd');
  const selectedDayEvents = eventsByDay.get(selectedKey) || [];

  const handleEventClick = (ev: MobileCalendarEvent) => {
    if (ev.navigateTo) navigate(ev.navigateTo);
  };

  return (
    <div
      className="rounded-xl hairline elev-rest bg-card overflow-hidden w-full max-w-full min-w-0"
      data-testid="schedule-calendar-mobile"
    >
      {/* Month header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border pb-[0px] pt-[0px]">
        <button
          type="button"
          onClick={() => setCursorMonth((d) => addMonths(d, -1))}
          className="p-1.5 rounded hover:bg-muted text-foreground"
          aria-label="Previous month"
          data-testid="mobile-schedule-prev-month"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div
          className="text-sm font-semibold text-foreground"
          data-testid="mobile-schedule-month-label"
        >
          {format(cursorMonth, 'MMMM yyyy')}
        </div>
        <button
          type="button"
          onClick={() => setCursorMonth((d) => addMonths(d, 1))}
          className="p-1.5 rounded hover:bg-muted text-foreground"
          aria-label="Next month"
          data-testid="mobile-schedule-next-month"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
      {/* Weekday header */}
      <div className="grid grid-cols-7 text-[10px] uppercase tracking-wide text-muted-foreground bg-muted/30">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <div key={`${d}-${i}`} className="text-center py-1.5 min-w-0">
            {d}
          </div>
        ))}
      </div>
      {/* Day grid */}
      <div
        className="grid grid-cols-7 gap-px bg-border"
        data-testid="mobile-schedule-grid"
      >
        {days.map((d) => {
          const inMonth = isSameMonth(d, monthStart);
          const key = format(d, 'yyyy-MM-dd');
          const dayEvents = eventsByDay.get(key) || [];
          const isToday = isSameDay(d, today);
          const isSelected = isSameDay(d, selectedDay);
          const visibleDots = dayEvents.slice(0, 3);
          const overflow = dayEvents.length - visibleDots.length;
          return (
            <button
              type="button"
              key={key}
              onClick={() => setSelectedDay(d)}
              className={`relative min-w-0 aspect-square flex flex-col items-center justify-start py-1 px-0.5 transition-colors ${
                inMonth ? 'bg-card' : 'bg-muted/30'
              } ${isSelected ? 'ring-2 ring-primary ring-inset' : ''}`}
              data-testid={`mobile-day-cell-${key}`}
              aria-label={format(d, 'PPP')}
              aria-pressed={isSelected}
            >
              <span
                className={`text-[11px] leading-none flex items-center justify-center ${
                  isToday
                    ? 'w-5 h-5 rounded-full bg-primary text-primary-foreground font-semibold'
                    : inMonth
                      ? 'text-foreground'
                      : 'text-muted-foreground/60'
                }`}
              >
                {d.getDate()}
              </span>
              {dayEvents.length > 0 && (
                <div className="mt-1.5 flex items-center justify-center gap-1 flex-wrap max-w-full px-0.5">
                  {visibleDots.map((ev) => (
                    <span
                      key={ev.id}
                      className="w-2.5 h-2.5 rounded-full inline-block"
                      style={{ backgroundColor: ev.color }}
                    />
                  ))}
                  {overflow > 0 && (
                    <span className="text-[10px] leading-none text-muted-foreground ml-[1px]">
                      +{overflow}
                    </span>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>
      {/* Day detail strip */}
      <div className="border-t border-border p-3 bg-card pt-[4px] pb-[4px]">
        <div className="text-xs font-medium text-muted-foreground mb-2">
          {format(selectedDay, 'EEEE, MMM d')}
        </div>
        {selectedDayEvents.length === 0 ? (
          <div
            className="flex items-center gap-2 text-xs text-muted-foreground py-3 justify-center"
            data-testid="mobile-day-empty"
          >
            <CalendarIcon className="w-3.5 h-3.5" />
            No events
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {selectedDayEvents.map((ev) => {
              const textColor = getReadableTextColor(ev.color);
              const Icon = ev.kind === 'reminder' ? Clock : Trophy;
              const isInvite = ev.kind === 'invite' && !!ev.scrimmageId;
              const isMutating = joinInviteMutation.isPending || declineInviteMutation.isPending;
              return (
                <div
                  key={ev.id}
                  className="w-full text-left flex items-stretch gap-3 rounded-lg overflow-hidden border border-border bg-card"
                  data-testid={`mobile-day-event-${ev.id}`}
                >
                  <div
                    className="w-1.5 flex-shrink-0"
                    style={{ backgroundColor: ev.color }}
                  />
                  <button
                    type="button"
                    onClick={() => handleEventClick(ev)}
                    disabled={!ev.navigateTo}
                    className={`flex items-center gap-3 flex-1 min-w-0 py-2 ${isInvite ? 'pr-1' : 'pr-3'} ${
                      ev.navigateTo ? 'hover:bg-muted/50 transition-colors cursor-pointer' : 'cursor-default'
                    }`}
                  >
                    <div
                      className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: ev.color, color: textColor }}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm font-semibold text-foreground truncate">
                          {ev.title}
                        </span>
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                          style={{ backgroundColor: ev.color, color: textColor }}
                        >
                          {KIND_BADGE_LABEL[ev.kind]}
                        </span>
                        {ev.kind === 'scrimmage' && ev.isPending && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-amber-500 text-white">
                            Pending
                          </span>
                        )}
                        {ev.kind === 'scrimmage' && !ev.isPending && ev.teamAssignment === 'light' && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-white text-gray-800 border border-gray-300">
                            Team Light
                          </span>
                        )}
                        {ev.kind === 'scrimmage' && !ev.isPending && ev.teamAssignment === 'dark' && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-gray-800 text-white">
                            Team Dark
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {format(ev.date, 'h:mm a')}
                      </div>
                      {ev.subtitle && (
                        <div className="text-xs text-muted-foreground truncate">
                          {ev.subtitle}
                        </div>
                      )}
                    </div>
                  </button>
                  {isInvite && (
                    <div className="flex items-center gap-1.5 pr-2 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => joinInviteMutation.mutate(ev.scrimmageId!)}
                        disabled={isMutating}
                        className="bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700 transition-colors font-semibold text-xs disabled:opacity-50"
                        data-testid={`mobile-rsvp-in-${ev.id}`}
                      >
                        In
                      </button>
                      <button
                        type="button"
                        onClick={() => declineInviteMutation.mutate(ev.scrimmageId!)}
                        disabled={isMutating}
                        className="bg-red-600 text-white px-3 py-1.5 rounded-lg hover:bg-red-700 transition-colors font-semibold text-xs disabled:opacity-50"
                        data-testid={`mobile-rsvp-out-${ev.id}`}
                      >
                        Out
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
