import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { SubscriptionGate } from '@/components/SubscriptionGate';
import { useSubscription } from '@/context/SubscriptionContext';
import { useLocation } from 'wouter';
import { Trophy, Users, TrendingUp, Clock, Search } from 'lucide-react';
import { format } from 'date-fns';

export default function Dashboard() {
  const { user } = useAuth();
  const { tier } = useSubscription();
  const [, navigate] = useLocation();

  const { data: upcomingGames, isLoading: gamesLoading } = useQuery({
    queryKey: ['/api/user/games/upcoming'],
  });

  const { data: userTeams } = useQuery({
    queryKey: ['/api/user/teams'],
  });

  const primaryTeam = Array.isArray(userTeams) && userTeams.length > 0 ? userTeams[0] : null;

  return (
    <div className="min-h-screen flex flex-col pb-24" data-testid="dashboard-page">
      {/* Header */}
      <div className="p-6 pt-12">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-welcome">
              Welcome back, {user?.firstName || 'Player'}
            </h1>
            {primaryTeam && (
              <p className="text-muted-foreground" data-testid="text-primary-team">
                {primaryTeam.name}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span 
              className={`tier-badge text-xs px-2 py-1 rounded-full font-semibold ${
                tier === 'commissioner' 
                  ? 'bg-warning text-black' 
                  : tier === 'player_plus' 
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary text-secondary-foreground'
              }`}
              data-testid="badge-subscription-tier"
            >
              {tier === 'commissioner' ? 'COMMISSIONER' : tier === 'player_plus' ? 'PLAYER PLUS' : 'FREE'}
            </span>
            <button 
              onClick={() => navigate('/profile')}
              className="w-8 h-8 bg-primary rounded-full flex items-center justify-center"
              data-testid="button-profile"
            >
              <span className="text-primary-foreground text-sm font-semibold">
                {user?.firstName?.[0] || 'U'}
              </span>
            </button>
          </div>
        </div>
      </div>
      
      {/* Quick Stats */}
      {primaryTeam && (
        <div className="px-6 mb-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-card rounded-xl border border-border p-4" data-testid="card-games-stat">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
                  <Trophy className="w-5 h-5 text-primary-foreground" />
                </div>
                <div>
                  <p className="text-2xl font-bold" data-testid="text-games-played">
                    {primaryTeam.wins + primaryTeam.losses + primaryTeam.ties}
                  </p>
                  <p className="text-xs text-muted-foreground">Games Played</p>
                </div>
              </div>
            </div>
            <div className="bg-card rounded-xl border border-border p-4" data-testid="card-record-stat">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-accent rounded-lg flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-accent-foreground" />
                </div>
                <div>
                  <p className="text-2xl font-bold" data-testid="text-team-record">
                    {primaryTeam.wins}-{primaryTeam.losses}-{primaryTeam.ties}
                  </p>
                  <p className="text-xs text-muted-foreground">Team Record</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Find a League Section */}
      <div className="px-6 mb-6">
        <div className="bg-card rounded-xl border border-border p-6 text-center">
          <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center mx-auto mb-4">
            <Search className="w-8 h-8 text-primary-foreground" />
          </div>
          <h3 className="text-lg font-semibold mb-2">Looking for a League?</h3>
          <p className="text-muted-foreground mb-4">
            Discover leagues in your area and join the action
          </p>
          <button
            onClick={() => navigate('/league-search')}
            className="bg-primary text-primary-foreground px-6 py-3 rounded-lg hover:bg-primary/90 font-medium"
            data-testid="button-find-league"
          >
            Find a League
          </button>
        </div>
      </div>
      
      {/* Upcoming Games */}
      <div className="px-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold" data-testid="text-upcoming-games-title">Upcoming Games</h2>
          <button 
            onClick={() => navigate('/calendar')}
            className="text-primary text-sm"
            data-testid="button-view-all-games"
          >
            View All
          </button>
        </div>
        
        {gamesLoading ? (
          <div className="bg-card rounded-xl border border-border p-4 animate-pulse" data-testid="loading-upcoming-games">
            <div className="h-16 bg-muted rounded"></div>
          </div>
        ) : Array.isArray(upcomingGames) && upcomingGames.length > 0 ? (
          <div className="space-y-3">
            {upcomingGames.slice(0, 2).map((game: any) => (
              <div key={game.id} className="bg-card rounded-xl border border-border p-4" data-testid={`card-game-${game.id}`}>
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-primary rounded-lg flex items-center justify-center">
                    {(() => {
                      const opponentTeam = game.homeTeam.id === primaryTeam?.id ? game.awayTeam : game.homeTeam;
                      return opponentTeam.logoUrl ? (
                        <img 
                          src={opponentTeam.logoUrl} 
                          alt={`${opponentTeam.name} logo`}
                          className="w-full h-full rounded-lg object-cover"
                          data-testid={`img-opponent-logo-${game.id}`}
                        />
                      ) : (
                        <Trophy className="w-6 h-6 text-primary-foreground" />
                      );
                    })()}
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold" data-testid={`text-game-opponent-${game.id}`}>
                      vs {game.homeTeam.id === primaryTeam?.id ? game.awayTeam.name : game.homeTeam.name}
                    </h3>
                    <p className="text-sm text-muted-foreground" data-testid={`text-game-time-${game.id}`}>
                      {format(new Date(game.scheduledAt), 'MMM d • h:mm a')}
                    </p>
                    {game.venue && (
                      <p className="text-xs text-muted-foreground" data-testid={`text-game-venue-${game.id}`}>
                        {game.venue}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <span className="tier-badge bg-success text-accent-foreground text-xs px-2 py-1 rounded-full" data-testid={`badge-game-status-${game.id}`}>
                      UPCOMING
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-card rounded-xl border border-border p-8 text-center" data-testid="empty-upcoming-games">
            <Clock className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">No upcoming games scheduled</p>
          </div>
        )}
      </div>
      
      {/* Team Performance */}
      {primaryTeam && (
        <div className="px-6 mb-6">
          <h2 className="text-lg font-semibold mb-4" data-testid="text-team-performance-title">Team Performance</h2>
          <div className="bg-card rounded-xl border border-border p-4">
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span>Wins</span>
                  <span data-testid="text-wins-stat">
                    {primaryTeam.wins} / {primaryTeam.wins + primaryTeam.losses + primaryTeam.ties}
                  </span>
                </div>
                <div className="h-1 bg-muted rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-success rounded-full" 
                    style={{ 
                      width: `${((primaryTeam.wins / Math.max(1, primaryTeam.wins + primaryTeam.losses + primaryTeam.ties)) * 100)}%` 
                    }}
                    data-testid="progress-wins"
                  />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span>Goals For</span>
                  <span data-testid="text-goals-for-stat">{primaryTeam.goalsFor}</span>
                </div>
                <div className="h-1 bg-muted rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-primary rounded-full" 
                    style={{ width: `${Math.min(100, (primaryTeam.goalsFor / 50) * 100)}%` }}
                    data-testid="progress-goals-for"
                  />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span>Goals Against</span>
                  <span data-testid="text-goals-against-stat">{primaryTeam.goalsAgainst}</span>
                </div>
                <div className="h-1 bg-muted rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-warning rounded-full" 
                    style={{ width: `${Math.min(100, (primaryTeam.goalsAgainst / 50) * 100)}%` }}
                    data-testid="progress-goals-against"
                  />
                </div>
              </div>
            </div>
            
            <SubscriptionGate requiredTier="player_plus">
              <div className="text-sm text-muted-foreground">
                Advanced stats available with Player Plus
              </div>
            </SubscriptionGate>
          </div>
        </div>
      )}
      
      {/* Recent Activity */}
      <div className="px-6">
        <h2 className="text-lg font-semibold mb-4" data-testid="text-recent-activity-title">Recent Activity</h2>
        <div className="space-y-3">
          <div className="bg-card rounded-lg border border-border p-3" data-testid="card-activity-placeholder">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-muted rounded-full flex items-center justify-center mt-1">
                <Users className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="flex-1">
                <p className="text-sm text-muted-foreground">
                  Join a team to see recent activity
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
