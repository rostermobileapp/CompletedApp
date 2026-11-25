import type { ReactNode } from 'react';
import {
  Award,
  BarChart3,
  Bell,
  BrickWall,
  Camera,
  ChevronDown,
  ChevronRight,
  Menu,
  Plus,
  RefreshCw,
  Trophy,
  Users,
} from 'lucide-react';
import lightModeLogo from '@assets/Light_Mode_Logo_1768322748282.png';
import darkModeLogo from '@assets/Dark_Mode_Logo_1770738054930.png';
import { Button } from '@/components/ui/button';

export interface HomeHeaderProps {
  dark: boolean;
  avatar?: ReactNode;
  avatarHasImage?: boolean;
  onProfile: () => void;
  onRefresh: () => void;
  refreshing?: boolean;
  onMenu: () => void;
  extra?: ReactNode;
}

export function HomeHeader({
  dark,
  avatar,
  avatarHasImage = false,
  onProfile,
  onRefresh,
  refreshing = false,
  onMenu,
  extra,
}: HomeHeaderProps) {
  return (
    <div className="sticky top-0 z-50 bg-background p-3 flex items-center pr-[16px] mb-[0px] pt-[0px] pb-[0px] mt-[4px] pl-[4px]">
      <div className="flex items-center justify-between w-full mt-[4px] mb-[4px] pt-[8px] pb-[8px]">
        <div className="flex items-center gap-2">
          <img
            src={dark ? darkModeLogo : lightModeLogo}
            alt="RosterHockey logo"
            className="h-[50px] pl-[12px] pr-[12px]"
            data-testid="img-roster-logo"
          />
        </div>
        <div className="flex items-center gap-3">
          {extra}
          <button
            onClick={onProfile}
            aria-label="Profile"
            className={`w-[48px] h-[48px] rounded-full flex items-center justify-center overflow-hidden ${avatarHasImage ? "bg-transparent" : "bg-primary"}`}
            data-testid="button-profile"
          >
            {avatar ?? <span className="text-primary-foreground text-lg font-semibold">U</span>}
          </button>
          <button
            onClick={onRefresh}
            aria-label="Refresh Home"
            className="w-8 h-8 flex items-center justify-center hover:bg-card/50 rounded-lg transition-colors text-muted-foreground hover:text-foreground"
            data-testid="button-refresh-home"
            disabled={refreshing}
          >
            <RefreshCw className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={onMenu}
            aria-label="Open menu"
            className="w-8 h-8 flex items-center justify-center hover:bg-card/50 rounded-lg transition-colors"
            data-testid="button-hamburger-menu"
          >
            <Menu className="w-8 h-8 text-foreground" />
          </button>
        </div>
      </div>
    </div>
  );
}

export interface HomeShortcutCardsProps {
  onWall: () => void;
  onPhotos: () => void;
  onStats: () => void;
  onStandings: () => void;
  wallBadge?: ReactNode;
}

export function HomeShortcutCards({
  onWall,
  onPhotos,
  onStats,
  onStandings,
  wallBadge,
}: HomeShortcutCardsProps) {
  return (
    <div className="px-6 mb-[8px]">
      <div className="grid grid-cols-4 gap-3">
        <div
          className="rounded-xl hairline elev-rest p-[17px] min-h-[61px] relative cursor-pointer hover:bg-muted/50 transition-colors bg-[#e2e2e2] dark:bg-[#212121]"
          data-testid="card-announcements"
          onClick={onWall}
          role="button" tabIndex={0}
          onKeyDown={event => { if (event.key === "Enter" || event.key === " ") {event.preventDefault(); onWall();} }}
        >
          <div className="h-full flex flex-col items-center justify-center">
            <BrickWall className="w-8 h-8 text-blue-500 mb-[10px]" />
            <p className="text-xs font-medium text-center">Wall</p>
          </div>
          {wallBadge}
        </div>
        <div
          className="rounded-xl hairline elev-rest p-[17px] min-h-[61px] cursor-pointer hover:bg-muted/50 transition-colors bg-[#e2e2e2] dark:bg-[#212121]"
          data-testid="card-photos"
          onClick={onPhotos}
          role="button" tabIndex={0}
          onKeyDown={event => { if (event.key === "Enter" || event.key === " ") {event.preventDefault(); onPhotos();} }}
        >
          <div className="h-full flex flex-col items-center justify-center">
            <Camera className="w-8 h-8 text-blue-500 mb-[10px]" />
            <p className="text-xs font-medium">Photos</p>
          </div>
        </div>
        <button
          type="button"
          className="w-full text-left rounded-xl hairline elev-rest p-[17px] min-h-[61px] cursor-pointer hover:bg-muted/50 transition-colors bg-[#e2e2e2] dark:bg-[#212121] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          data-testid="card-stats"
          onClick={onStats}
        >
          <div className="h-full flex flex-col items-center justify-center">
            <BarChart3 className="w-8 h-8 text-blue-500 mb-[10px]" />
            <p className="text-xs font-medium">Stats</p>
          </div>
        </button>
        <div
          className="rounded-xl hairline elev-rest p-[17px] min-h-[61px] cursor-pointer hover:bg-muted/50 transition-colors bg-[#e2e2e2] dark:bg-[#212121]"
          data-testid="card-standings"
          onClick={onStandings}
          role="button" tabIndex={0}
          onKeyDown={event => { if (event.key === "Enter" || event.key === " ") {event.preventDefault(); onStandings();} }}
        >
          <div className="h-full flex flex-col items-center justify-center">
            <Award className="w-8 h-8 text-blue-500 mb-[10px]" />
            <p className="text-xs font-medium">Standings</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export interface HomeScheduleToolbarProps {
  view: 'list' | 'calendar';
  onViewChange: (view: 'list' | 'calendar') => void;
  onViewAll: () => void;
  onAdd?: () => void;
}

export function HomeScheduleToolbar({
  view,
  onViewChange,
  onViewAll,
  onAdd,
}: HomeScheduleToolbarProps) {
  return (
    <div className="flex min-h-[58px] items-center justify-between mb-[4px] whitespace-nowrap">
      <div className="flex shrink-0 items-center gap-2">
        <h2 className="text-sm font-semibold" data-testid="text-schedule-title">Schedule</h2>
        {onAdd && (
          <Button
            onClick={onAdd}
            className="w-[25.6px] h-[25.6px] p-0 bg-blue-500 hover:bg-blue-600 text-white rounded-full"
            data-testid="button-add-event"
          >
            <Plus className="w-[12.8px] h-[12.8px]" />
          </Button>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <div
          className="grid w-[106px] shrink-0 grid-cols-2 items-center rounded-md p-0.5 bg-muted text-[11px] sm:w-[140px] sm:text-xs"
          role="tablist"
          aria-label="Schedule view"
        >
          <button
            type="button"
            onClick={() => onViewChange('list')}
            className={`px-1 py-0.5 rounded transition-colors text-center ${
              view === 'list' ? 'bg-blue-500 text-white shadow-sm' : 'text-muted-foreground'
            }`}
            aria-pressed={view === 'list'}
            data-testid="mobile-schedule-toggle-list"
          >
            List
          </button>
          <button
            type="button"
            onClick={() => onViewChange('calendar')}
            className={`px-1 py-0.5 rounded transition-colors text-center ${
              view === 'calendar' ? 'bg-blue-500 text-white shadow-sm' : 'text-muted-foreground'
            }`}
            aria-pressed={view === 'calendar'}
            data-testid="mobile-schedule-toggle-calendar"
          >
            Calendar
          </button>
        </div>
        <button
          onClick={onViewAll}
          className="text-primary text-xs sm:text-sm"
          data-testid="button-view-all-games"
        >
          View All
        </button>
      </div>
    </div>
  );
}

export interface HomeTeamSelectorProps {
  label: string;
  open?: boolean;
  onClick: () => void;
  children?: ReactNode;
}

export function HomeTeamSelector({
  label,
  open = false,
  onClick,
  children,
}: HomeTeamSelectorProps) {
  return (
    <div className="px-6 mt-[4px] mb-[8px]">
      <div className="relative">
        <button
          onClick={onClick}
          className="w-full hairline elev-rest rounded-lg p-3 flex items-center justify-between hover:bg-muted/50 transition-colors bg-[#e2e2e2] dark:bg-[#212121] pt-[8px] pb-[8px] pl-[4px] pr-[4px]"
          data-testid="button-selector"
          aria-label="Choose active team"
          aria-expanded={open}
        >
          <div className="flex items-center gap-2 min-w-0">
            <Users className="w-4 h-4 text-primary" />
            <span className="font-medium pl-[8px] pr-[8px] text-[12px] truncate">{label}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs mr-1 text-[#3c83f6] font-bold">Select</span>
            <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
          </div>
        </button>
        {open && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-card hairline elev-lift rounded-lg z-50 max-h-[400px] overflow-y-auto">
            {children}
          </div>
        )}
      </div>
    </div>
  );
}

export interface HomeSummaryCardsProps {
  gamesRemaining: number;
  teamName?: string;
  teamLogoUrl?: string;
  onAchievements: () => void;
  onAlerts: () => void;
  alerts?: number;
}

export function HomeSummaryCards({
  gamesRemaining,
  teamName,
  teamLogoUrl,
  onAchievements,
  onAlerts,
  alerts = 0,
}: HomeSummaryCardsProps) {
  return (
    <div className="px-6 mb-2">
      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        <div className="min-w-0 min-h-[72px] rounded-xl hairline elev-rest px-1 py-0.5 sm:px-2 bg-[#e2e2e2] dark:bg-[#212121]" data-testid="card-games-stat">
          <div className="flex h-full flex-col items-center justify-center gap-0.5">
            <div className={`w-11 h-11 sm:w-12 sm:h-12 shrink-0 rounded-lg flex items-center justify-center ${teamLogoUrl ? 'bg-transparent' : 'bg-primary'}`}>
              {teamLogoUrl ? (
                <img
                  src={teamLogoUrl}
                  alt={teamName ? `${teamName} logo` : 'Team logo'}
                  className="w-full h-full rounded-lg object-cover bg-transparent"
                  data-testid="img-team-logo"
                />
              ) : (
                <Trophy className="w-6 h-6 text-primary-foreground" />
              )}
            </div>
            <div className="min-w-0 flex items-baseline justify-center gap-1">
              <p className="text-base sm:text-lg font-bold leading-none" data-testid="text-games-remaining">
                {gamesRemaining}
              </p>
              <p className="text-muted-foreground text-[11px] sm:text-base leading-none whitespace-nowrap">Games Left</p>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onAchievements}
          className="min-w-0 min-h-[72px] w-full inline-flex flex-col items-center justify-center gap-0.5 rounded-xl hairline elev-rest bg-[#e2e2e2] dark:bg-[#212121] text-[#212121] dark:text-white text-sm font-medium hover:bg-muted/50 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          data-testid="button-patches-home"
        >
          <img src="/patches-home-icon.png?v=20260927" alt="" aria-hidden="true" className="w-[3.3rem] h-[3.3rem] sm:w-[3.6rem] sm:h-[3.6rem] shrink-0 object-contain" />
          <span>Achievements</span>
        </button>
        <div className="min-w-0 min-h-[72px] rounded-xl hairline elev-rest bg-[#e2e2e2] dark:bg-[#212121]">
          <button
            type="button"
            onClick={onAlerts}
            className="w-full h-full flex flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            data-testid="button-needs-attention-permanent"
          >
            <Bell className="w-[35px] h-[35px] sm:w-[38px] sm:h-[38px] shrink-0 text-[#212121] dark:text-white" />
            <span className="flex items-center justify-center gap-1">
              <span className="font-medium text-xs sm:text-sm text-[#212121] dark:text-white">Alerts</span>
              {alerts > 0 && (
                <span className="min-w-5 h-5 px-1 bg-red-500 rounded-full flex items-center justify-center">
                  <span className="text-white text-xs font-bold">{alerts}</span>
                </span>
              )}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

export interface HomeScheduleCardProps {
  title: string;
  subtitle?: string;
  badge?: string;
  onView: () => void;
  children?: ReactNode;
}

export function HomeScheduleCard({
  title,
  subtitle,
  badge,
  onView,
  children,
}: HomeScheduleCardProps) {
  return (
    <div
      className="rounded-xl hairline elev-rest p-4 min-h-[80px] relative cursor-pointer hover:bg-muted/50 transition-colors pt-[5px] pb-[5px] pl-[20px] pr-[4px] bg-[#e2e2e2] dark:bg-[#212121]"
      onClick={onView}
      role="button" tabIndex={0}
      aria-label={`View ${title}`}
      onKeyDown={event => {if (event.key === "Enter" || event.key === " ") {event.preventDefault();onView();}}}
    >
      <div className="flex items-center gap-4 bg-[212121]">
        <div className="w-12 h-12 shrink-0" aria-hidden="true" />
        <div className="absolute left-[20px] top-1/2 -translate-y-1/2 w-12 h-12 rounded-lg flex items-center justify-center bg-primary">
          <Trophy className="w-6 h-6 text-primary-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold truncate">{title}</h3>
            {badge && (
              <span className="text-xs bg-primary text-white px-2 py-0.5 rounded font-medium">{badge}</span>
            )}
          </div>
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        <div className="w-[68px] shrink-0" aria-hidden="true" />
        <div className="absolute right-1 top-[33.3333%] flex -translate-y-1/2 items-center gap-2">
          <span className="shrink-0 whitespace-nowrap text-sm font-medium text-primary">View</span>
          <ChevronRight className="w-8 h-8 shrink-0 text-primary -ml-1" />
        </div>
      </div>
      {children && <div className="ml-16">{children}</div>}
    </div>
  );
}
