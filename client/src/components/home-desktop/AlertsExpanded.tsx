import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
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
}

const SEVERITY_BORDER: Record<AlertSeverity, string> = {
  red: '#dc2626',
  amber: '#d97706',
  blue: '#2563eb',
};

export function AlertsExpanded({ effectiveLeagueId }: AlertsExpandedProps) {
  const [, navigate] = useLocation();

  const { data: scrimmageInvites } = useQuery<any[]>({
    queryKey: ['/api/users/scrimmage-invites'],
    staleTime: 30_000,
  });

  const { data: pendingSubApprovals } = useQuery<{
    requests?: any[];
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

  const { data: unreadNotifications } = useQuery<Notification[]>({
    queryKey: ['/api/notifications/unread'],
    staleTime: 30_000,
  });

  // Build alert list
  const alerts: AlertItem[] = [];

  // Red: pending substitute approvals (captain-side action required)
  const subRequests = Array.isArray(pendingSubApprovals?.requests)
    ? pendingSubApprovals!.requests!
    : [];
  for (const req of subRequests.slice(0, 4)) {
    const playerName =
      req?.originalPlayer?.firstName || req?.originalPlayer?.lastName
        ? `${req.originalPlayer.firstName ?? ''} ${req.originalPlayer.lastName ?? ''}`.trim()
        : 'a player';
    alerts.push({
      key: `sub-${req.id}`,
      severity: 'red',
      title: `Need a sub for ${playerName}`,
      meta: req?.requestingTeam?.name || 'Approve or deny',
      onClick: () => {
        setPageTransitionDirection('up');
        navigate('/substitute-confirmations');
      },
      testid: `alert-sub-${req.id}`,
    });
  }

  // Amber: pending scrimmage invites
  const invites = Array.isArray(scrimmageInvites) ? scrimmageInvites : [];
  for (const inv of invites.slice(0, 4)) {
    const title = inv?.title || inv?.scrimmage?.title || 'Scrimmage invite';
    alerts.push({
      key: `inv-${inv.id}`,
      severity: 'amber',
      title: `RSVP: ${title}`,
      meta: 'Awaiting your response',
      onClick: () => {
        setPageTransitionDirection('up');
        navigate('/scrimmage-management');
      },
      testid: `alert-invite-${inv.id}`,
    });
  }

  // Blue: recent unread notifications
  const notifs = Array.isArray(unreadNotifications) ? unreadNotifications : [];
  for (const n of notifs.slice(0, 6)) {
    alerts.push({
      key: `notif-${n.id}`,
      severity: 'blue',
      title: n.title || n.message || 'Notification',
      meta: n.body || (n.message && n.title ? n.message : undefined),
      onClick: n.link
        ? () => {
            setPageTransitionDirection('up');
            navigate(n.link!);
          }
        : undefined,
      testid: `alert-notif-${n.id}`,
    });
  }

  const newCount = alerts.length;

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
