import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ChevronLeft, ChevronRight, Clock, MapPin, Trophy } from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isToday, isSameMonth } from 'date-fns';

export default function Calendar() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<'month' | 'week'>('month');

  const { data: upcomingGames, isLoading } = useQuery({
    queryKey: ['/api/user/games/upcoming'],
  });

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calendarDays = eachDayOfInterval({ start: monthStart, end: monthEnd });

  const getGameForDate = (date: Date) => {
    if (!upcomingGames) return null;
    return upcomingGames.find((game: any) => 
      isSameDay(new Date(game.scheduledAt), date)
    );
  };

  const navigateMonth = (direction: 'prev' | 'next') => {
    const newDate = new Date(currentDate);
    newDate.setMonth(currentDate.getMonth() + (direction === 'next' ? 1 : -1));
    setCurrentDate(newDate);
  };

  const todaysGames = upcomingGames?.filter((game: any) => 
    isSameDay(new Date(game.scheduledAt), new Date())
  ) || [];

  return (
    <div className="min-h-screen flex flex-col pb-24" data-testid="calendar-page">
      {/* Header */}
      <div className="p-6 pt-12">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Schedule</h1>
          <div className="flex gap-2">
            <button
              onClick={() => setViewMode('month')}
              className={`px-3 py-1 rounded-lg text-sm transition-colors ${
                viewMode === 'month' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground'
              }`}
              data-testid="button-view-month"
            >
              Month
            </button>
            <button
              onClick={() => setViewMode('week')}
              className={`px-3 py-1 rounded-lg text-sm transition-colors ${
                viewMode === 'week' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground'
              }`}
              data-testid="button-view-week"
            >
              Week
            </button>
          </div>
        </div>
        
        {/* Month Navigation */}
        <div className="flex items-center justify-between mb-4">
          <button 
            onClick={() => navigateMonth('prev')}
            className="p-2 text-muted-foreground hover:text-foreground"
            data-testid="button-prev-month"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h2 className="text-lg font-semibold" data-testid="text-current-month">
            {format(currentDate, 'MMMM yyyy')}
          </h2>
          <button 
            onClick={() => navigateMonth('next')}
            className="p-2 text-muted-foreground hover:text-foreground"
            data-testid="button-next-month"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>
      
      {/* Calendar Grid */}
      <div className="px-6 mb-6">
        <div className="grid grid-cols-7 gap-1 mb-4">
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => (
            <div key={index} className="text-center text-xs font-medium text-muted-foreground py-2" data-testid={`header-day-${index}`}>
              {day}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {calendarDays.map((day, index) => {
            const hasGame = getGameForDate(day);
            const isCurrentDay = isToday(day);
            const isCurrentMonth = isSameMonth(day, currentDate);
            
            return (
              <div 
                key={index}
                className={`aspect-square flex items-center justify-center text-sm relative transition-colors ${
                  isCurrentDay 
                    ? 'bg-primary text-primary-foreground rounded-lg' 
                    : isCurrentMonth
                      ? 'text-foreground hover:bg-muted rounded-lg'
                      : 'text-muted-foreground'
                }`}
                data-testid={`calendar-day-${format(day, 'yyyy-MM-dd')}`}
              >
                {format(day, 'd')}
                {hasGame && !isCurrentDay && (
                  <div className="absolute bottom-1 left-1/2 transform -translate-x-1/2 w-1 h-1 bg-primary rounded-full" data-testid={`game-indicator-${format(day, 'yyyy-MM-dd')}`} />
                )}
              </div>
            );
          })}
        </div>
      </div>
      
      {/* Today's Events */}
      <div className="px-6">
        <h2 className="text-lg font-semibold mb-4" data-testid="text-todays-events-title">Today's Events</h2>
        
        {isLoading ? (
          <div className="space-y-3" data-testid="loading-todays-events">
            {[1, 2].map((i) => (
              <div key={i} className="bg-card rounded-xl border border-border p-4 animate-pulse">
                <div className="h-16 bg-muted rounded"></div>
              </div>
            ))}
          </div>
        ) : todaysGames.length > 0 ? (
          <div className="space-y-3">
            {todaysGames.map((game: any) => (
              <div key={game.id} className="bg-card rounded-xl border border-border p-4" data-testid={`card-todays-game-${game.id}`}>
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-warning rounded-lg flex items-center justify-center">
                    <Trophy className="w-6 h-6 text-black" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold" data-testid={`text-game-matchup-${game.id}`}>
                      {game.homeTeam.name} vs {game.awayTeam.name}
                    </h3>
                    <p className="text-sm text-muted-foreground" data-testid={`text-game-time-${game.id}`}>
                      {format(new Date(game.scheduledAt), 'h:mm a')} - {format(new Date(new Date(game.scheduledAt).getTime() + 90 * 60000), 'h:mm a')}
                    </p>
                    {game.venue && (
                      <div className="flex items-center gap-2 mt-1">
                        <MapPin className="w-3 h-3 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground" data-testid={`text-game-venue-${game.id}`}>
                          {game.venue}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="text-right">
                    <span className="tier-badge bg-success text-accent-foreground text-xs px-2 py-1 rounded-full" data-testid={`badge-game-status-${game.id}`}>
                      TODAY
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-card rounded-xl border border-border p-8 text-center" data-testid="empty-todays-events">
            <Clock className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">No games scheduled for today</p>
          </div>
        )}
      </div>
    </div>
  );
}
