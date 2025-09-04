import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { ArrowLeft, Plus, Users, Trophy, Calendar } from 'lucide-react';
import { useSubscription } from '@/context/SubscriptionContext';

type League = {
  id: string;
  name: string;
  sport: string;
  description?: string;
  location?: string;
  isActive: boolean;
};

export default function LeagueList() {
  const [, navigate] = useLocation();
  const { hasAccess } = useSubscription();

  const { data: leagues, isLoading } = useQuery<League[]>({
    queryKey: ['/api/leagues/commissioner'],
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading your leagues...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col pb-24">
      {/* Header */}
      <div className="p-6 pt-12">
        <div className="flex items-center gap-4 mb-6">
          <button 
            onClick={() => navigate('/more')}
            className="text-muted-foreground"
            data-testid="button-back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-2xl font-bold">My Leagues</h1>
        </div>
      </div>

      {/* Create League Button */}
      <div className="px-6 mb-6">
        <button
          onClick={() => navigate('/create-league')}
          className="w-full bg-primary text-primary-foreground rounded-lg px-4 py-3 flex items-center justify-center gap-2 font-medium"
          data-testid="button-create-league"
        >
          <Plus className="w-5 h-5" />
          Create New League
        </button>
      </div>

      {/* Leagues List */}
      <div className="px-6">
        {!leagues || leagues.length === 0 ? (
          <div className="bg-card rounded-xl border border-border p-8 text-center">
            <Trophy className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No leagues yet</h3>
            <p className="text-muted-foreground mb-4">
              Create your first league to get started with managing teams and games.
            </p>
            <button
              onClick={() => navigate('/create-league')}
              className="bg-primary text-primary-foreground rounded-lg px-6 py-2 font-medium"
              data-testid="button-create-first-league"
            >
              Create Your First League
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {leagues.map((league) => (
              <div
                key={league.id}
                className="bg-card rounded-xl border border-border p-6 cursor-pointer hover:bg-card/80 transition-colors"
                onClick={() => navigate(`/league-management?leagueId=${league.id}`)}
                data-testid={`league-card-${league.id}`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold mb-1">{league.name}</h3>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span className="capitalize">{league.sport}</span>
                      {league.location && (
                        <>
                          <span>•</span>
                          <span>{league.location}</span>
                        </>
                      )}
                      <span>•</span>
                      <span className={league.isActive ? 'text-green-600/50' : 'text-yellow-600/50'}>
                        {league.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/league-management?leagueId=${league.id}&edit=true`);
                      }}
                      className="text-sm text-primary hover:underline"
                      data-testid={`button-edit-league-${league.id}`}
                    >
                      Edit League
                    </button>
                  </div>
                </div>
                
                {league.description && (
                  <p className="text-muted-foreground text-sm mb-3 line-clamp-2">
                    {league.description}
                  </p>
                )}

                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Users className="w-3 h-3" />
                    <span>Teams</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    <span>Games</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Trophy className="w-3 h-3" />
                    <span>Standings</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}