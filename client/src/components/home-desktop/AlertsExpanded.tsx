import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { format } from 'date-fns';
import { setPageTransitionDirection } from '@/components/PageTransition';
import { apiRequest } from '@/lib/queryClient';
import { cardClass, cardStyle, sectionTitleClass } from './cardStyles';

interface Notification {
  id: string;
  type?: string;
  title?: string;
  message?: string;
  body?: string;
  createdAt?: string;
  link?: string;
  actionUrl?: string;
}

type AlertSeverity = 'red' | 'amber' | 'blue';

interface AlertItem {
  key: string;
  severity: AlertSeverity;
  title: string;
  meta?: string;
  onClick?: () => void;
  testid: string;
}

interface AlertsExpandedProps {
  effectiveLeagueId?: string | null;
  /** All of this user's team IDs, used to figure out the "opponent" for
   *  per-game alerts (verify score, award stars, etc.). */
  userTeamIds?: string[];
}

function formatGameDate(value?: string | Date | null): string | null {
  if (!value) return null;
  try {
    const d = typeof value === 'string' ? new Date(value) : value;
    if (Number.isNaN(d.getTime())) return null;
    return format(d, 'EEE MMM d');
  } catch {
    return null;
  }
}

function formatGameDateTime(value?: string | Date | null): string | null {
  if (!value) return null;
  try {
    const d = typeof value === 'string' ? new Date(value) : value;
    if (Number.isNaN(d.getTime())) return null;
    return format(d, 'EEE MMM d • h:mm a');
  } catch {
    return null;
  }
}

function describeGameMatchup(
  game: any,
  userTeamIds: string[],
): string {
  const home = game?.homeTeam?.name || 'Home';
  const away = game?.awayTeam?.name || 'Away';
  const homeId = game?.homeTeam?.id || game?.homeTeamId;
  const awayId = game?.awayTeam?.id || game?.awayTeamId;
  const ownTeamIds = new Set(userTeamIds || []);

  if (homeId && ownTeamIds.has(homeId)) return `vs ${away}`;
  if (awayId && ownTeamIds.has(awayId)) return `vs ${home}`;
  return `${home} vs ${away}`;
}

const SEVERITY_BORDER: Record<AlertSeverity, string> = {
  red: '#dc2626',
  amber: '#d97706',
  blue: '#2563eb',
};

export function AlertsExpanded({
  effectiveLeagueId,
  userTeamIds = [],
}: AlertsExpandedProps) {
  const [, navigate] = useLocation();

  // ── Data sources (mirror the mobile "Needs Attention" summary in
  //    Dashboard.tsx so the desktop count matches the mobile badge) ───────
  const { data: scrimmageInvites } = useQuery<any[]>({
    queryKey: ['/api/users/scrimmage-invites'],
    staleTime: 30_000,
  });

  const { data: pendingSubApprovals } = useQuery<{
    requests?: any[];
    captain?: any[];
    commissioner?: any[];
    total?: number;
  }>({
    queryKey: [
      '/api/substitute-requests/pending-approvals',
      effectiveLeagueId,
    ],
    enabled: !!effectiveLeagueId,
    queryFn: async () => {
      try {
        const res = await apiRequest(
          'GET',
          `/api/substitute-requests/pending-approvals?leagueId=${effectiveLeagueId}`,
        );
        return await res.json();
      } catch {
        return { requests: [], total: 0 };
      }
    },
    staleTime: 30_000,
  });

  const { data: pendingMembers } = useQuery<any[]>({
    queryKey: ['/api/leagues', effectiveLeagueId, 'pending-members'],
    enabled: !!effectiveLeagueId,
    queryFn: async () => {
      try {
        const res = await apiRequest(
          'GET',
          `/api/leagues/${effectiveLeagueId}/pending-members`,
        );
        if (!res.ok) return [];
        return await res.json();
      } catch {
        return [];
      }
    },
    staleTime: 30_000,
  });

  const { data: gamesNeedingVerification } = useQuery<any[]>({
    queryKey: ['/api/leagues', effectiveLeagueId, 'games-needing-verification'],
    enabled: !!effectiveLeagueId,
    queryFn: async () => {
      try {
        const res = await apiRequest(
          'GET',
          `/api/leagues/${effectiveLeagueId}/games-needing-verification`,
        );
        if (!res.ok) return [];
        return await res.json();
      } catch {
        return [];
      }
    },
    staleTime: 30_000,
  });

  const { data: tournamentMatchesNeedingVerification } = useQuery<any[]>({
    queryKey: [
      '/api/leagues',
      effectiveLeagueId,
      'tournament-matches-needing-verification',
    ],
    enabled: !!effectiveLeagueId,
    queryFn: async () => {
      try {
        const res = await apiRequest(
          'GET',
          `/api/leagues/${effectiveLeagueId}/tournament-matches-needing-verification`,
        );
        if (!res.ok) return [];
        return await res.json();
      } catch {
        return [];
      }
    },
    staleTime: 30_000,
  });

  const { data: gamesNeedingStars } = useQuery<any[]>({
    queryKey: ['/api/user/games-needing-stars', effectiveLeagueId],
    enabled: !!effectiveLeagueId,
    queryFn: async () => {
      try {
        const res = await apiRequest(
          'GET',
          `/api/user/games-needing-stars?leagueId=${effectiveLeagueId}`,
        );
        if (!res.ok) return [];
        return await res.json();
      } catch {
        return [];
      }
    },
    staleTime: 30_000,
  });

  // Mobile uses /api/notifications (all, not just unread) for its Needs
  // Attention badge. Match that so the count agrees across devices.
  const { data: notifications } = useQuery<Notification[]>({
    queryKey: ['/api/notifications'],
    staleTime: 30_000,
  });

  // ── Build alert list ────────────────────────────────────────────────────
  const alerts: AlertItem[] = [];

  // Red: pending substitute approvals (captain-side action required).
  // Endpoint may return either { requests: [...] } (legacy/team scope) or
  // { captain: [...], commissioner: [...] } (current shape).
  const subRequests: any[] = [
    ...(Array.isArray(pendingSubApprovals?.requests)
      ? pendingSubApprovals!.requests!
      : []),
    ...(Array.isArray(pendingSubApprovals?.captain)
      ? pendingSubApprovals!.captain!
      : []),
    ...(Array.isArray(pendingSubApprovals?.commissioner)
      ? pendingSubApprovals!.commissioner!
      : []),
  ];
  for (const req of subRequests.slice(0, 4)) {
    const playerName =
      req?.originalPlayer?.firstName || req?.originalPlayer?.lastName
        ? `${req.originalPlayer.firstName ?? ''} ${req.originalPlayer.lastName ?? ''}`.trim()
        : 'a player';
    const matchup = req?.game ? describeGameMatchup(req.game, userTeamIds) : null;
    const date = formatGameDate(req?.game?.scheduledAt);
    const metaParts: string[] = [];
    if (matchup) metaParts.push(matchup);
    if (date) metaParts.push(date);
    alerts.push({
      key: `sub-${req.id}`,
      severity: 'red',
      title: `Need a sub for ${playerName}`,
      meta: metaParts.length ? metaParts.join(' · ') : 'Approve or deny',
      onClick: () => {
        setPageTransitionDirection('up');
        navigate('/substitute-confirmations');
      },
      testid: `alert-sub-${req.id}`,
    });
  }

  // Red: pending player/member approvals for league commissioners
  const pendingMemberList = Array.isArray(pendingMembers) ? pendingMembers : [];
  for (const m of pendingMemberList.slice(0, 4)) {
    const name =
      `${m?.user?.firstName ?? ''} ${m?.user?.lastName ?? ''}`.trim() ||
      m?.user?.email ||
      'New player';
    alerts.push({
      key: `pending-member-${m.id}`,
      severity: 'red',
      title: `Approve ${name}`,
      meta: m?.assignedTeam?.name
        ? `Wants to join ${m.assignedTeam.name}`
        : 'Pending player approval',
      onClick: () => {
        setPageTransitionDirection('up');
        navigate(`/league-management?leagueId=${effectiveLeagueId}`);
      },
      testid: `alert-pending-member-${m.id}`,
    });
  }

  // Red: games / tournament matches needing score verification
  const verifGames = Array.isArray(gamesNeedingVerification)
    ? gamesNeedingVerification
    : [];
  for (const g of verifGames.slice(0, 4)) {
    const matchup = describeGameMatchup(g, userTeamIds);
    const date = formatGameDate(g?.scheduledAt);
    const meta = [matchup, date].filter(Boolean).join(' · ') || 'Score awaiting confirmation';
    alerts.push({
      key: `verify-game-${g.id}`,
      severity: 'red',
      title: 'Verify game score',
      meta,
      onClick: () => {
        setPageTransitionDirection('up');
        navigate(`/game/${g.id}`);
      },
      testid: `alert-verify-${g.id}`,
    });
  }
  const verifMatches = Array.isArray(tournamentMatchesNeedingVerification)
    ? tournamentMatchesNeedingVerification
    : [];
  for (const m of verifMatches.slice(0, 4)) {
    const matchup =
      m?.team1Name && m?.team2Name
        ? `${m.team1Name} vs ${m.team2Name}`
        : null;
    const date = formatGameDate(m?.scheduledTime);
    const tournamentName = m?.tournamentName || null;
    const metaParts: string[] = [];
    if (matchup) metaParts.push(matchup);
    if (date) metaParts.push(date);
    if (tournamentName && !matchup) metaParts.push(tournamentName);
    alerts.push({
      key: `verify-match-${m.id}`,
      severity: 'red',
      title: tournamentName
        ? `Verify ${tournamentName} match`
        : 'Verify tournament match',
      meta: metaParts.length ? metaParts.join(' · ') : 'Score awaiting confirmation',
      onClick: () => {
        setPageTransitionDirection('up');
        // Mobile routes both regular games and tournament matches through
        // /game/:id (see Dashboard.tsx). Use the same path here.
        navigate(`/game/${m.id}`);
      },
      testid: `alert-verify-match-${m.id}`,
    });
  }

  // Amber: pending scrimmage invites
  const invites = Array.isArray(scrimmageInvites) ? scrimmageInvites : [];
  for (const inv of invites.slice(0, 4)) {
    const title = inv?.title || inv?.scrimmage?.title || 'Scrimmage invite';
    const dateValue =
      inv?.dateTime || inv?.scrimmage?.dateTime || inv?.scheduledAt || null;
    const date = formatGameDateTime(dateValue);
    const venue = inv?.venue || inv?.location || inv?.scrimmage?.venue || null;
    const metaParts: string[] = [];
    if (date) metaParts.push(date);
    if (venue) metaParts.push(venue);
    alerts.push({
      key: `inv-${inv.id}`,
      severity: 'amber',
      title: `RSVP: ${title}`,
      meta: metaParts.length ? metaParts.join(' · ') : 'Awaiting your response',
      onClick: () => {
        setPageTransitionDirection('up');
        navigate('/scrimmage-management');
      },
      testid: `alert-invite-${inv.id}`,
    });
  }

  // Amber: games needing player stars
  const starGames = Array.isArray(gamesNeedingStars) ? gamesNeedingStars : [];
  for (const g of starGames.slice(0, 4)) {
    const matchup = describeGameMatchup(g, userTeamIds);
    const date = formatGameDate(g?.scheduledAt);
    const score =
      g?.homeScore != null && g?.awayScore != null
        ? `${g.homeScore}-${g.awayScore}`
        : null;
    const metaParts: string[] = [];
    if (matchup) metaParts.push(matchup);
    if (score) metaParts.push(`Final ${score}`);
    if (date) metaParts.push(date);
    alerts.push({
      key: `stars-${g.id}`,
      severity: 'amber',
      title: 'Award player stars',
      meta: metaParts.length ? metaParts.join(' · ') : 'Recent game',
      onClick: () => {
        setPageTransitionDirection('up');
        navigate(`/game/${g.id}`);
      },
      testid: `alert-stars-${g.id}`,
    });
  }

  // Blue: notifications (matches the mobile badge total)
  const notifs = Array.isArray(notifications) ? notifications : [];
  for (const n of notifs.slice(0, 8)) {
    const link = n.actionUrl || n.link;
    alerts.push({
      key: `notif-${n.id}`,
      severity: 'blue',
      title: n.title || n.message || 'Notification',
      meta: n.body || (n.message && n.title ? n.message : undefined),
      onClick: link
        ? () => {
            setPageTransitionDirection('up');
            navigate(link);
          }
        : undefined,
      testid: `alert-notif-${n.id}`,
    });
  }

  // Badge total mirrors the mobile "Needs Attention" badge: it counts every
  // underlying item, not just the ones we render in the list (which are
  // capped per category for visual density).
  const totalCount =
    subRequests.length +
    pendingMemberList.length +
    verifGames.length +
    verifMatches.length +
    invites.length +
    starGames.length +
    notifs.length;
  const newCount = totalCount;

  return (
    <div className={cardClass} style={cardStyle} data-testid="card-alerts">
      <div className="flex items-center justify-between">
        <div className={sectionTitleClass}>Alerts</div>
        {newCount > 0 && (
          <span
            className="text-[12px] font-medium px-2 py-0.5 rounded-full text-white"
            style={{ backgroundColor: '#dc2626' }}
            data-testid="alerts-new-count"
          >
            {newCount} new
          </span>
        )}
      </div>

      {newCount === 0 ? (
        <div
          className="mt-3 text-sm text-[#666] py-6 text-center"
          data-testid="alerts-empty"
        >
          You're all caught up.
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-2 max-h-[300px] overflow-y-auto pr-1">
          {alerts.map((a) => (
            <button
              type="button"
              key={a.key}
              onClick={a.onClick}
              disabled={!a.onClick}
              className="text-left rounded-md pl-3 pr-2 py-2 bg-black/[0.02] hover:bg-black/[0.05] transition-colors"
              style={{
                borderLeftWidth: '3px',
                borderLeftStyle: 'solid',
                borderLeftColor: SEVERITY_BORDER[a.severity],
              }}
              data-testid={a.testid}
            >
              <div className="text-[13px] font-medium text-[#212121] truncate">
                {a.title}
              </div>
              {a.meta && (
                <div className="text-[12px] text-[#666] truncate">{a.meta}</div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
