import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Users } from 'lucide-react';
import { useLocation } from 'wouter';
import { getImageUrl } from '@/lib/queryClient';

export default function TeamSearch() {
  const [search, setSearch] = useState('');
  const [, navigate] = useLocation();

  const { data: teams, isLoading } = useQuery({
    queryKey: ['/api/teams/search', { search }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      
      const response = await fetch(`/api/teams/search?${params}`);
      if (!response.ok) throw new Error('Failed to fetch teams');
      return response.json();
    },
    enabled: search.trim().length > 0,
  });


  return (
    <div className="min-h-screen flex flex-col pb-24" data-testid="team-search-page">
      {/* Header */}
      <div className="p-6 pt-12">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Find a Team</h1>
          <button 
            onClick={() => navigate('/')}
            className="text-primary text-sm"
            data-testid="button-skip"
          >
            Skip
          </button>
        </div>
        
        {/* Search Bar */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
          <input 
            type="text" 
            placeholder="Search by team ID..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-input border border-border rounded-lg pl-10 pr-4 py-3 text-foreground"
            data-testid="input-search"
          />
        </div>
      </div>
      
      {/* Team List */}
      <div className="flex-1 px-6">
        {search.trim().length === 0 ? (
          <div className="text-center py-12" data-testid="initial-search-message">
            <Users className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Search for Teams</h3>
            <p className="text-muted-foreground">
              Enter a team ID to find teams you can join
            </p>
          </div>
        ) : isLoading ? (
          <div className="space-y-4" data-testid="loading-teams">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-card rounded-xl border border-border p-4 animate-pulse">
                <div className="h-20 bg-muted rounded"></div>
              </div>
            ))}
          </div>
        ) : teams && teams.length > 0 ? (
          <div className="space-y-4">
            {teams.map((team: any) => (
              <div key={team.id} className="bg-card rounded-xl border border-border p-4" data-testid={`card-team-${team.id}`}>
                <div className="flex items-start gap-4">
                  {team.logoUrl && (
                    <img 
                      src={getImageUrl(team.logoUrl) || ''} 
                      alt={team.name}
                      className="w-16 h-16 rounded-lg object-cover"
                    />
                  )}
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg mb-1" data-testid={`text-team-name-${team.id}`}>
                      {team.name}
                    </h3>
                    {team.uniqueTeamId && (
                      <p className="text-sm text-muted-foreground font-mono mb-2" data-testid={`text-team-id-${team.id}`}>
                        ID: {team.uniqueTeamId}
                      </p>
                    )}
                    {team.league && (
                      <p className="text-sm text-muted-foreground" data-testid={`text-team-league-${team.id}`}>
                        League: {team.league.name}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12" data-testid="empty-teams">
            <Search className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">No teams found</p>
            <p className="text-sm text-muted-foreground mt-2">Try adjusting your search</p>
          </div>
        )}
      </div>
    </div>
  );
}
