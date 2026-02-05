import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { Users } from 'lucide-react';
import { useLocation } from 'wouter';

export default function Roster() {
  const { user } = useAuth();
  const [, navigate] = useLocation();

  const { data: userTeams, isLoading } = useQuery({
    queryKey: ['/api/user/teams'],
  });

  const primaryTeam = Array.isArray(userTeams) && userTeams.length > 0 ? userTeams[0] : null;

  useEffect(() => {
    if (primaryTeam?.id) {
      navigate(`/team/${primaryTeam.id}`, { replace: true });
    }
  }, [primaryTeam?.id, navigate]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!primaryTeam) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6" data-testid="no-team-state">
        <Users className="w-16 h-16 text-muted-foreground mb-4" />
        <h2 className="text-xl font-bold mb-2">No Team Found</h2>
        <p className="text-muted-foreground text-center mb-6">
          You need to join a team to view the roster
        </p>
        <button 
          onClick={() => navigate('/league-search')}
          className="bg-primary text-primary-foreground px-6 py-3 rounded-lg font-semibold"
          data-testid="button-find-league"
        >
          Find a League
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
    </div>
  );
}
