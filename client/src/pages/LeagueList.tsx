import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { setPageTransitionDirection } from '@/components/PageTransition';
import { ArrowLeft, Plus, Users, Trophy, Calendar, Search } from 'lucide-react';
import { usePermissions } from '@/context/SubscriptionContext';

type League = {
  id: string;
  name: string;
  sport: string;
  description?: string;
  location?: string;
  isActive: boolean;
  uniqueLeagueId: string;
};

type StatusFilter = 'active' | 'inactive' | 'all';

export default function LeagueList() {
  const [, navigate] = useLocation();
  const { canManageLeague } = usePermissions();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');

  const { data: leagues, isLoading } = useQuery<League[]>({
    queryKey: ['/api/leagues/commissioner'],
    retry: false,
  });

  // Filter leagues by search term and active status
  const filteredLeagues = leagues?.filter(league => {
    const matchesSearch =
      (league.uniqueLeagueId || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (league.name || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' && league.isActive) ||
      (statusFilter === 'inactive' && !league.isActive);
    return matchesSearch && matchesStatus;
  }) || [];

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

  const totalActive = leagues?.filter(l => l.isActive).length ?? 0;
  const totalInactive = leagues?.filter(l => !l.isActive).length ?? 0;

  return (
    <div className="min-h-screen flex flex-col pb-24">
      {/* Header */}
      <div className="p-6 pt-12">
        <div className="flex items-center gap-4 mb-6">
          <button 
            onClick={() => {
              setPageTransitionDirection('down');
              navigate('/');
            }}
            className="text-muted-foreground"
            data-testid="button-back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-2xl font-bold">My Leagues</h1>
        </div>
      </div>

      {/* Create League Button */}
      <div className="px-6 mb-4">
        <button
          onClick={() => navigate('/create-league')}
          className="w-full bg-primary text-primary-foreground rounded-lg px-4 py-3 flex items-center justify-center gap-2 font-medium"
          data-testid="button-create-league"
        >
          <Plus className="w-5 h-5" />
          Create New League
        </button>
      </div>

      {/* Status Filter Toggle */}
      {leagues && leagues.length > 0 && (
        <div className="px-6 mb-4">
          <div className="flex bg-muted rounded-lg p-1 gap-1">
            {([
              { value: 'active', label: 'Active', count: totalActive },
              { value: 'all', label: 'All', count: (leagues?.length ?? 0) },
              { value: 'inactive', label: 'Inactive', count: totalInactive },
            ] as { value: StatusFilter; label: string; count: number }[]).map(({ value, label, count }) => (
              <button
                key={value}
                onClick={() => setStatusFilter(value)}
                className={`flex-1 py-1.5 px-2 rounded-md text-sm font-medium transition-colors flex items-center justify-center gap-1.5 ${
                  statusFilter === value
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                data-testid={`filter-${value}`}
              >
                {label}
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                  statusFilter === value ? 'bg-primary/10 text-primary' : 'bg-muted-foreground/20'
                }`}>
                  {count}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Search Input */}
      {leagues && leagues.length > 0 && (
        <div className="px-6 mb-6">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by name or League ID..."
            className="w-full bg-card hairline elev-inset rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            data-testid="input-search-league"
          />
        </div>
      )}

      {/* Leagues List */}
      <div className="px-6">
        {!leagues || leagues.length === 0 ? (
          <div className="bg-card rounded-xl hairline elev-rest p-8 text-center">
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
        ) : filteredLeagues.length === 0 ? (
          <div className="bg-card rounded-xl hairline elev-rest p-8 text-center">
            <Search className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No leagues found</h3>
            <p className="text-muted-foreground mb-4">
              {searchTerm
                ? `No ${statusFilter !== 'all' ? statusFilter : ''} leagues match "${searchTerm}".`
                : `No ${statusFilter} leagues. Switch the filter above to see all leagues.`}
            </p>
            <button
              onClick={() => { setSearchTerm(''); setStatusFilter('all'); }}
              className="bg-primary text-primary-foreground rounded-lg px-6 py-2 font-medium"
              data-testid="button-clear-search"
            >
              Show All Leagues
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredLeagues.map((league) => (
              <div
                key={league.id}
                className={`bg-card rounded-xl p-6 cursor-pointer hover:bg-card/80 transition-colors ${
                  league.isActive
                    ? 'hairline elev-rest'
                    : 'border border-dashed border-border opacity-75'
                }`}
                onClick={() => navigate(`/league-management?leagueId=${league.id}`)}
                data-testid={`league-card-${league.id}`}
              >
                <div className="mb-3">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="text-lg font-semibold">{league.name}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      league.isActive
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                        : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                    }`}>
                      {league.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                    <span className="font-mono bg-muted px-2 py-0.5 rounded" data-testid={`league-id-${league.id}`}>
                      {league.uniqueLeagueId}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span className="capitalize">{league.sport}</span>
                    {league.location && (
                      <>
                        <span>•</span>
                        <span>{league.location}</span>
                      </>
                    )}
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
