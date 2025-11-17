import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, Clock, CheckCircle } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useLocation } from 'wouter';
import { apiRequest } from '@/lib/queryClient';
import { isUnauthorizedError } from '@/lib/authUtils';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

const sportBadgeColors: Record<string, string> = {
  hockey: 'bg-primary text-primary-foreground',
};

export default function LeagueSearch() {
  const [search, setSearch] = useState('');
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  const { data: leagues, isLoading, error } = useQuery({
    queryKey: ['/api/leagues', 'hockey', search],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append('sport', 'hockey');
      if (search) params.append('search', search.trim());
      
      console.log('Searching leagues with:', params.toString());
      const fullUrl = `${API_BASE_URL}/api/leagues?${params}`;
      console.log('Full API URL:', fullUrl);
      const response = await fetch(fullUrl);
      if (!response.ok) {
        const errorText = await response.text();
        console.error('League search failed:', response.status, errorText);
        throw new Error('Failed to fetch leagues');
      }
      const data = await response.json();
      console.log('League search results:', data);
      return data;
    },
    enabled: search.trim().length > 0, // Only fetch when there's a search term
  });

  const joinLeagueMutation = useMutation({
    mutationFn: async (leagueId: string) => {
      const response = await apiRequest('POST', `/api/leagues/${leagueId}/join`);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Membership Requested",
        description: "Your request has been sent to the league administrators",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/leagues'] });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Redirecting to login...",
          variant: "destructive",
        });
        setTimeout(() => {
          navigate('/');
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: "Failed to request membership",
        variant: "destructive",
      });
    },
  });

  return (
    <div className="min-h-screen flex flex-col pb-24" data-testid="league-search-page">
      {/* Header */}
      <div className="p-6 pt-12">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Find Your League</h1>
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
            placeholder="Search leagues..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-input border border-border rounded-lg pl-10 pr-4 py-3 text-foreground"
            data-testid="input-search"
          />
        </div>
      </div>
      
      {/* League List */}
      <div className="flex-1 px-6">
        {search.trim().length === 0 ? (
          // No search performed yet - show initial message
          <div className="text-center py-12" data-testid="initial-search-message">
            <Search className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Search for Leagues</h3>
            <p className="text-muted-foreground">
              Enter a league name, location, or ID to find leagues in your area
            </p>
          </div>
        ) : isLoading ? (
          // Searching - show loading state
          <div className="space-y-4" data-testid="loading-leagues">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-card rounded-xl border border-border p-4 animate-pulse">
                <div className="h-20 bg-muted rounded"></div>
              </div>
            ))}
          </div>
        ) : leagues && leagues.length > 0 ? (
          // Search results found - show leagues
          <div className="space-y-4">
            {leagues.map((league: any) => (
              <div key={league.id} className="bg-card rounded-xl border border-border p-4" data-testid={`card-league-${league.id}`}>
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h3 className="font-semibold text-lg" data-testid={`text-league-name-${league.id}`}>
                      {league.name}
                    </h3>
                    <p className="text-muted-foreground text-sm" data-testid={`text-league-location-${league.id}`}>
                      {league.location} • {league.maxTeams} teams max
                    </p>
                  </div>
                  <span 
                    className={`tier-badge text-xs px-2 py-1 rounded-full font-semibold ${
                      sportBadgeColors[league.sport] || 'bg-secondary text-secondary-foreground'
                    }`}
                    data-testid={`badge-sport-${league.id}`}
                  >
                    {league.sport.toUpperCase()}
                  </span>
                </div>
                {league.description && (
                  <p className="text-sm text-muted-foreground mb-4" data-testid={`text-league-description-${league.id}`}>
                    {league.description}
                  </p>
                )}
                <div className="flex justify-between items-center">
                  <div className="text-sm">
                    <span className="text-muted-foreground">Season:</span>
                    <span className="ml-1" data-testid={`text-league-season-${league.id}`}>
                      {league.season || 'Active'}
                    </span>
                  </div>
                  <button
                    onClick={() => joinLeagueMutation.mutate(league.id)}
                    disabled={joinLeagueMutation.isPending}
                    className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm disabled:opacity-50"
                    data-testid={`button-join-league-${league.id}`}
                  >
                    {joinLeagueMutation.isPending ? 'Requesting...' : 'Request to Join'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          // Search performed but no results found
          <div className="text-center py-12" data-testid="empty-leagues">
            <Search className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">No leagues found</p>
            <p className="text-sm text-muted-foreground mt-2">Try adjusting your search or sport filter</p>
          </div>
        )}
      </div>
    </div>
  );
}
