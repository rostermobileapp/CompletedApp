import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Lock } from 'lucide-react';
import { useLocation } from 'wouter';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { setPageTransitionDirection } from '@/components/PageTransition';
import { apiRequest, getImageUrl } from '@/lib/queryClient';
import { usePermissions } from '@/context/SubscriptionContext';
import { cardClass, cardStyle, sectionTitleClass } from './cardStyles';

interface TeamLeadersCardProps {
  effectiveLeagueId?: string | null;
  seasonId?: string | null;
  seasonLabel?: string;
}

interface SkaterStat {
  type: 'skater';
  userId: string;
  user?: {
    firstName?: string | null;
    lastName?: string | null;
    profileImageUrl?: string | null;
  };
  jerseyNumber?: number | string | null;
  position?: string | null;
  goals?: number;
  assists?: number;
  points?: number;
  gamesPlayed?: number;
}

const POINTS_BG = '#E5EEFB';
const POINTS_BG_ACCENT = '#3b82f6';
const GOALS_BG = '#FBEDD8';
const GOALS_BG_ACCENT = '#d97706';

export function TeamLeadersCard({
  effectiveLeagueId,
  seasonId,
  seasonLabel,
}: TeamLeadersCardProps) {
  const { canAccessPremiumFeatures } = usePermissions();
  const [, navigate] = useLocation();
  const [mode, setMode] = useState<'season' | 'playoffs'>('season');

  const isLocked = !canAccessPremiumFeatures();

  const { data: seasonStats, isLoading: seasonLoading } = useQuery<SkaterStat[]>({
    queryKey: [
      '/api/leagues',
      effectiveLeagueId,
      'stats',
      { seasonId: seasonId || undefined, playerType: 'non-goalies' },
    ],
    enabled: !!effectiveLeagueId && !isLocked && mode === 'season',
    queryFn: async () => {
      const params = new URLSearchParams();
      if (seasonId) params.append('seasonId', seasonId);
      params.append('playerType', 'non-goalies');
      const res = await apiRequest(
        'GET',
        `/api/leagues/${effectiveLeagueId}/stats?${params.toString()}`,
      );
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: playoffStats, isLoading: playoffLoading } = useQuery<SkaterStat[]>({
    queryKey: [
      '/api/leagues',
      effectiveLeagueId,
      'playoff-stats',
      { seasonId: seasonId || undefined },
    ],
    enabled: !!effectiveLeagueId && !isLocked && mode === 'playoffs',
    queryFn: async () => {
      const params = new URLSearchParams();
      if (seasonId) params.append('seasonId', seasonId);
      const res = await apiRequest(
        'GET',
        `/api/leagues/${effectiveLeagueId}/playoff-stats?${params.toString()}`,
      );
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const stats = mode === 'playoffs' ? playoffStats : seasonStats;
  const isLoading = mode === 'playoffs' ? playoffLoading : seasonLoading;

  const skaters = Array.isArray(stats)
    ? stats.filter((s): s is SkaterStat => s.type === 'skater')
    : [];

  const topPoints = [...skaters]
    .sort((a, b) => (b.points || 0) - (a.points || 0))
    .slice(0, 5);
  const topGoals = [...skaters]
    .sort((a, b) => (b.goals || 0) - (a.goals || 0))
    .slice(0, 5);

  const seasonText = seasonLabel
    ? `${seasonLabel} Team leaders`
    : 'Team leaders';

  return (
    <div
      className={cardClass}
      style={cardStyle}
      data-testid="card-team-leaders"
    >
      <div className="flex items-center justify-between gap-2">
        <div className={sectionTitleClass}>{seasonText}</div>
        <div
          className="flex items-center text-[12px] rounded-md p-0.5 bg-black/[0.04]"
          role="tablist"
          aria-label="Team leader range"
        >
          <button
            type="button"
            onClick={() => setMode('season')}
            className={`px-2.5 py-1 rounded transition-colors ${
              mode === 'season'
                ? 'bg-white text-[#212121]'
                : 'text-[#666] hover:text-[#212121]'
            }`}
            style={
              mode === 'season'
                ? {
                    borderWidth: '0.5px',
                    borderStyle: 'solid',
                    borderColor: 'rgba(0,0,0,0.15)',
                  }
                : undefined
            }
            data-testid="leaders-toggle-season"
          >
            Season
          </button>
          <button
            type="button"
            onClick={() => setMode('playoffs')}
            className={`px-2.5 py-1 rounded transition-colors ${
              mode === 'playoffs'
                ? 'bg-white text-[#212121]'
                : 'text-[#666] hover:text-[#212121]'
            }`}
            style={
              mode === 'playoffs'
                ? {
                    borderWidth: '0.5px',
                    borderStyle: 'solid',
                    borderColor: 'rgba(0,0,0,0.15)',
                  }
                : undefined
            }
            data-testid="leaders-toggle-playoffs"
          >
            Playoffs
          </button>
        </div>
      </div>

      {isLocked ? (
        <button
          type="button"
          onClick={() => {
            setPageTransitionDirection('up');
            navigate('/subscription');
          }}
          className="mt-4 w-full flex flex-col items-center gap-2 py-6 text-[#666] hover:text-[#212121]"
          data-testid="leaders-locked"
        >
          <Lock className="w-5 h-5" />
          <span className="text-[13px]">
            Upgrade to view team leaders
          </span>
        </button>
      ) : !effectiveLeagueId ? (
        <div className="mt-3 text-sm text-[#666] py-4 text-center">
          Select a league to view leaders.
        </div>
      ) : isLoading ? (
        <div className="mt-3 grid grid-cols-2 gap-4">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="h-48 rounded-lg bg-black/[0.04] animate-pulse"
            />
          ))}
        </div>
      ) : skaters.length === 0 ? (
        <div
          className="mt-3 text-sm text-[#666] py-4 text-center"
          data-testid={
            mode === 'playoffs' ? 'leaders-empty-playoffs' : 'leaders-empty-season'
          }
        >
          {mode === 'playoffs' ? 'No playoff stats yet.' : 'No stats recorded yet.'}
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <LeaderColumn
            label="Points"
            category="points"
            leaders={topPoints}
            accentBg={POINTS_BG}
            accentColor={POINTS_BG_ACCENT}
          />
          <LeaderColumn
            label="Goals"
            category="goals"
            leaders={topGoals}
            accentBg={GOALS_BG}
            accentColor={GOALS_BG_ACCENT}
          />
        </div>
      )}
    </div>
  );
}

function getName(s: SkaterStat) {
  const f = s.user?.firstName || '';
  const l = s.user?.lastName || '';
  if (f || l) return `${f} ${l}`.trim();
  return 'Unknown';
}

function getInitials(s: SkaterStat) {
  const f = s.user?.firstName?.[0] || '';
  const l = s.user?.lastName?.[0] || '';
  return (f + l).toUpperCase() || 'P';
}

function getValue(s: SkaterStat, category: 'points' | 'goals') {
  return category === 'points' ? s.points || 0 : s.goals || 0;
}

function LeaderColumn({
  label,
  category,
  leaders,
  accentBg,
  accentColor,
}: {
  label: string;
  category: 'points' | 'goals';
  leaders: SkaterStat[];
  accentBg: string;
  accentColor: string;
}) {
  const top = leaders[0];
  if (!top) {
    return (
      <div className="text-sm text-[#666]" data-testid={`leader-${category}-empty`}>
        No leaders yet.
      </div>
    );
  }
  const headlineNum = getValue(top, category);

  return (
    <div data-testid={`leader-column-${category}`}>
      {/* Featured leader */}
      <div className="flex items-center gap-3">
        <Avatar className="w-11 h-11">
          <AvatarImage src={getImageUrl(top.user?.profileImageUrl) || undefined} />
          <AvatarFallback
            className="text-[12px]"
            style={{ backgroundColor: accentBg, color: accentColor }}
          >
            {getInitials(top)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] uppercase tracking-wide text-[#888]">
            {label}
          </div>
          <div className="text-[13px] font-medium text-[#212121] truncate">
            {getName(top)}
          </div>
          <div className="text-[11px] text-[#777]">
            {[top.jerseyNumber ? `#${top.jerseyNumber}` : null, top.position]
              .filter(Boolean)
              .join(' · ') || ' '}
          </div>
        </div>
        <div className="text-[26px] font-medium leading-none text-[#212121]">
          {headlineNum}
        </div>
      </div>

      {/* Top-5 list */}
      <div className="mt-3 flex flex-col">
        {leaders.map((p, idx) => {
          const isFirst = idx === 0;
          return (
            <div
              key={p.userId + '-' + category}
              className="grid grid-cols-[20px_1fr_auto] items-center gap-2 px-2 py-1.5 rounded text-[12px]"
              style={{
                backgroundColor: isFirst ? accentBg : 'transparent',
                color: '#212121',
              }}
              data-testid={`leader-${category}-row-${idx}`}
            >
              <div
                className="text-[11px]"
                style={{ color: isFirst ? accentColor : '#888' }}
              >
                {idx + 1}
              </div>
              <div className="truncate">{getName(p)}</div>
              <div
                className="font-medium"
                style={{ color: isFirst ? accentColor : '#212121' }}
              >
                {getValue(p, category)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
