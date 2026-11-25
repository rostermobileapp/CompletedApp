import { useState } from 'react';
import {
  Award,
  BarChart3,
  Bell,
  BrickWall,
  Camera,
  ChevronDown,
  ChevronRight,
  DollarSign,
  Menu,
  MessageCircle,
  Plus,
  RefreshCw,
  Trophy,
  Users,
  User,
} from 'lucide-react';
import './_group.css';

const headerLogo = '/__mockup/images/account-home/header.png';
const homeLogo = '/__mockup/images/account-home/home.png';
const patchIcon = '/__mockup/images/account-home/achievements.png';

export function Current() {
  const [scheduleView, setScheduleView] = useState<'list' | 'calendar'>('list');
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState('North Shore Wolves');
  const [notice, setNotice] = useState('');

  return (
    <main className="dark min-h-screen flex flex-col bg-background text-foreground pb-24" data-testid="dashboard-page">
      <header className="sticky top-0 z-50 bg-background p-3 flex items-center pr-[16px] mb-[0px] pt-[0px] pb-[0px] mt-[4px] pl-[4px]">
        <div className="flex items-center justify-between w-full mt-[4px] mb-[4px] pt-[8px] pb-[8px]">
          <div className="flex items-center gap-2">
            <img src={headerLogo} alt="RosterHockey logo" className="h-[50px] pl-[12px] pr-[12px] object-contain" data-testid="img-roster-logo" />
          </div>
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setNotice('Team awards')} aria-label="Team awards" className="text-primary text-sm font-semibold">3</button>
            <button type="button" onClick={() => setNotice('Profile')} className="w-[48px] h-[48px] rounded-full flex items-center justify-center overflow-hidden bg-primary" data-testid="button-profile">
              <span className="text-primary-foreground text-lg font-semibold">M</span>
            </button>
            <button type="button" onClick={() => setNotice('Home refreshed')} className="w-8 h-8 flex items-center justify-center hover:bg-card/50 rounded-lg transition-colors text-muted-foreground hover:text-foreground" data-testid="button-refresh-home">
              <RefreshCw className="w-5 h-5" />
            </button>
            <button type="button" onClick={() => setNotice('Menu')} className="w-8 h-8 flex items-center justify-center hover:bg-card/50 rounded-lg transition-colors" data-testid="button-hamburger-menu">
              <Menu className="w-8 h-8 text-foreground" />
            </button>
          </div>
        </div>
      </header>

      <div className="px-6 mt-[4px] mb-[8px]">
        <div className="relative">
          <button
            type="button"
            onClick={() => setSelectorOpen((value) => !value)}
            className="w-full hairline elev-rest rounded-lg p-3 flex items-center justify-between hover:bg-muted/50 transition-colors bg-[#e2e2e2] dark:bg-[#212121] pt-[8px] pb-[8px] pl-[4px] pr-[4px]"
            data-testid="button-selector"
          >
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" />
              <span className="font-medium pl-[8px] pr-[8px] text-[12px]">{selectedTeam}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs mr-1 text-[#3c83f6] font-bold">Select</span>
              <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${selectorOpen ? 'rotate-180' : ''}`} />
            </div>
          </button>
          {selectorOpen && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-card hairline elev-lift rounded-lg z-50">
              {['North Shore Wolves', 'Harbor City Falcons'].map((team) => (
                <button
                  key={team}
                  type="button"
                  onClick={() => { setSelectedTeam(team); setSelectorOpen(false); }}
                  className="w-full p-3 text-left hover:bg-muted/50 transition-colors"
                >
                  <span className="font-medium text-sm">{team}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="px-6 mb-[8px]">
        <div className="grid grid-cols-4 gap-3">
          <button type="button" className="rounded-xl hairline elev-rest p-[17px] min-h-[61px] relative cursor-pointer hover:bg-muted/50 transition-colors bg-[#e2e2e2] dark:bg-[#212121]" data-testid="card-announcements" onClick={() => setNotice('Wall')}>
            <div className="h-full flex flex-col items-center justify-center"><BrickWall className="w-8 h-8 text-blue-500 mb-[10px]" /><p className="text-xs font-medium text-center">Wall</p></div>
          </button>
          <button type="button" className="rounded-xl hairline elev-rest p-[17px] min-h-[61px] cursor-pointer hover:bg-muted/50 transition-colors bg-[#e2e2e2] dark:bg-[#212121]" data-testid="card-photos" onClick={() => setNotice('Photos')}>
            <div className="h-full flex flex-col items-center justify-center"><Camera className="w-8 h-8 text-blue-500 mb-[10px]" /><p className="text-xs font-medium">Photos</p></div>
          </button>
          <button type="button" className="w-full text-left rounded-xl hairline elev-rest p-[17px] min-h-[61px] cursor-pointer hover:bg-muted/50 transition-colors bg-[#e2e2e2] dark:bg-[#212121] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" data-testid="card-stats" onClick={() => setNotice('Stats')}>
            <div className="h-full flex flex-col items-center justify-center"><BarChart3 className="w-8 h-8 text-blue-500 mb-[10px]" /><p className="text-xs font-medium">Stats</p></div>
          </button>
          <button type="button" className="rounded-xl hairline elev-rest p-[17px] min-h-[61px] cursor-pointer hover:bg-muted/50 transition-colors bg-[#e2e2e2] dark:bg-[#212121]" data-testid="card-standings" onClick={() => setNotice('Standings')}>
            <div className="h-full flex flex-col items-center justify-center"><Award className="w-8 h-8 text-blue-500 mb-[10px]" /><p className="text-xs font-medium">Standings</p></div>
          </button>
        </div>
      </div>

      <div className="px-6 mb-2">
        <div className="grid grid-cols-3 gap-2 sm:gap-4">
          <div className="min-w-0 min-h-[72px] rounded-xl hairline elev-rest px-1 py-0.5 sm:px-2 bg-[#e2e2e2] dark:bg-[#212121]" data-testid="card-games-stat">
            <div className="flex h-full flex-col items-center justify-center gap-0.5">
              <div className="w-11 h-11 sm:w-12 sm:h-12 shrink-0 rounded-lg flex items-center justify-center bg-primary"><Trophy className="w-6 h-6 text-primary-foreground" /></div>
              <div className="min-w-0 flex items-baseline justify-center gap-1"><p className="text-base sm:text-lg font-bold leading-none" data-testid="text-games-remaining">4</p><p className="text-muted-foreground text-[11px] sm:text-base leading-none whitespace-nowrap">Games Left</p></div>
            </div>
          </div>
          <button type="button" onClick={() => setNotice('Achievements')} className="min-w-0 min-h-[72px] w-full inline-flex flex-col items-center justify-center gap-0.5 rounded-xl hairline elev-rest bg-[#e2e2e2] dark:bg-[#212121] text-[#212121] dark:text-white text-sm font-medium hover:bg-muted/50 transition-colors" data-testid="button-patches-home">
            <img src={patchIcon} alt="" aria-hidden="true" className="w-[3.3rem] h-[3.3rem] sm:w-[3.6rem] sm:h-[3.6rem] shrink-0 object-contain" /><span>Achievements</span>
          </button>
          <button type="button" onClick={() => setNotice('Alerts')} className="min-w-0 min-h-[72px] rounded-xl hairline elev-rest bg-[#e2e2e2] dark:bg-[#212121] w-full flex flex-col items-center justify-center gap-0.5" data-testid="button-needs-attention-permanent">
            <Bell className="w-[35px] h-[35px] sm:w-[38px] sm:h-[38px] shrink-0 text-[#212121] dark:text-white" /><span className="font-medium text-xs sm:text-sm text-[#212121] dark:text-white">Alerts</span>
          </button>
        </div>
      </div>

      <section className="px-6 mt-0 mb-[8px]">
        <div className="flex min-h-[58px] items-center justify-between mb-[4px] whitespace-nowrap">
          <div className="flex shrink-0 items-center gap-2">
            <h2 className="text-sm font-semibold" data-testid="text-schedule-title">Schedule</h2>
            <button type="button" onClick={() => setNotice('Add event')} className="w-[25.6px] h-[25.6px] p-0 bg-blue-500 hover:bg-blue-600 text-white rounded-full flex items-center justify-center" data-testid="button-add-event"><Plus className="w-[12.8px] h-[12.8px]" /></button>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <div className="grid w-[106px] shrink-0 grid-cols-2 items-center rounded-md p-0.5 bg-muted text-[11px] sm:w-[140px] sm:text-xs" role="tablist" aria-label="Schedule view">
              <button type="button" onClick={() => setScheduleView('list')} className={`px-1 py-0.5 rounded transition-colors text-center ${scheduleView === 'list' ? 'bg-blue-500 text-white shadow-sm' : 'text-muted-foreground'}`} aria-pressed={scheduleView === 'list'} data-testid="mobile-schedule-toggle-list">List</button>
              <button type="button" onClick={() => setScheduleView('calendar')} className={`px-1 py-0.5 rounded transition-colors text-center ${scheduleView === 'calendar' ? 'bg-blue-500 text-white shadow-sm' : 'text-muted-foreground'}`} aria-pressed={scheduleView === 'calendar'} data-testid="mobile-schedule-toggle-calendar">Calendar</button>
            </div>
            <button type="button" onClick={() => setNotice('View all schedule')} className="text-primary text-xs sm:text-sm" data-testid="button-view-all-games">View All</button>
          </div>
        </div>
        {scheduleView === 'list' ? (
          <div className="rounded-xl hairline elev-rest p-4 relative cursor-pointer hover:bg-muted/50 transition-colors pt-[5px] pb-[5px] pl-[20px] pr-[4px] bg-[#e2e2e2] dark:bg-[#212121]" onClick={() => setNotice('Game details')} data-testid="card-game-demo">
            <div className="flex items-center gap-4 bg-[212121]">
              <div className="w-12 h-12 shrink-0" aria-hidden="true" />
              <div className="absolute left-[20px] top-1/2 -translate-y-1/2 w-12 h-12 rounded-lg flex items-center justify-center bg-primary"><Trophy className="w-6 h-6 text-primary-foreground" /></div>
              <div className="flex-1">
                <div className="flex items-center gap-2"><h3 className="font-semibold">vs Harbor City Falcons</h3><span className="text-xs bg-primary text-white px-2 py-0.5 rounded font-medium">Game</span></div>
                <p className="text-sm text-muted-foreground">Oct 18 · 7:30 PM</p>
              </div>
              <div className="w-[68px] shrink-0" aria-hidden="true" />
              <div className="absolute right-1 top-[33.3333%] flex -translate-y-1/2 items-center gap-2"><span className="shrink-0 whitespace-nowrap text-sm font-medium text-primary">View</span><ChevronRight className="w-8 h-8 shrink-0 text-primary -ml-1" /></div>
            </div>
          </div>
        ) : (
          <div className="rounded-xl hairline elev-rest p-4 text-center bg-[#e2e2e2] dark:bg-[#212121]">Calendar view</div>
        )}
      </section>

      {notice && <div role="status" className="fixed top-3 left-1/2 -translate-x-1/2 z-[120] bg-card hairline elev-rest rounded-lg px-4 py-2 text-sm">{notice}<button type="button" className="ml-3 text-primary" onClick={() => setNotice('')}>Dismiss</button></div>}

      <nav className="fixed bottom-0 left-0 right-0 bg-card border-t border-border z-[100]" data-testid="bottom-navigation" style={{ paddingBottom: 'var(--native-inset-bottom, env(safe-area-inset-bottom, 0px))', minHeight: '60px' }}>
        <div className="grid py-2 grid-cols-5 bg-[#e2e2e2] dark:bg-[#212121] pt-[2px] pb-[2px]">
          {[
            { id: 'teams', label: 'My Team', icon: Users },
            { id: 'messages', label: 'Messages', icon: MessageCircle },
            { id: 'home', label: 'Home', icon: null },
            { id: 'payments', label: 'Payments', icon: DollarSign },
            { id: 'profile', label: 'Profile', icon: User },
          ].map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" onClick={() => setNotice(label)} className={`flex flex-col items-center py-2 w-full transition-colors ${id === 'home' ? 'text-primary' : 'text-[#212121]/70 dark:text-muted-foreground'}`} data-testid={`nav-${id}`}>
              <div className="relative h-[35px] w-full flex items-center justify-center mb-1">
                {id === 'home' ? <div className="absolute -top-6 w-12 h-12 rounded-full bg-[#212121] hairline elev-lift flex items-center justify-center" style={{left:"50%",marginLeft:-24}}>
                  <img src={homeLogo} alt="Home" className="w-7 h-7" />
                </div> : Icon && <Icon className="w-[25px] h-[25px]" />}
              </div>
              <span className={`text-xs ${id === 'home' ? 'font-bold' : 'font-medium'}`}>{label}</span>
            </button>
          ))}
        </div>
      </nav>
    </main>
  );
}
