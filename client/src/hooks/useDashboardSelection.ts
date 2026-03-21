import { useState, useEffect } from 'react';

// Custom event for notifying same-tab changes
export const DASHBOARD_SELECTION_CHANGE_EVENT = 'dashboardSelectionChange';

// Helper function to dispatch selection change event
export function notifyDashboardSelectionChange() {
  window.dispatchEvent(new CustomEvent(DASHBOARD_SELECTION_CHANGE_EVENT));
}

export function useDashboardSelection() {
  const [selectedType, setSelectedType] = useState<'team' | 'league' | 'tournament' | null>(() => {
    const saved = localStorage.getItem('dashboardSelectedType');
    return (saved === 'team' || saved === 'league' || saved === 'tournament') ? saved : null;
  });
  
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    return localStorage.getItem('dashboardSelectedId') || null;
  });

  // Listen for changes to localStorage from other tabs AND same tab via custom event
  useEffect(() => {
    const updateFromLocalStorage = () => {
      const type = localStorage.getItem('dashboardSelectedType');
      const id = localStorage.getItem('dashboardSelectedId');
      setSelectedType((type === 'team' || type === 'league' || type === 'tournament') ? type : null);
      setSelectedId(id);
    };

    // Cross-tab changes via storage event
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'dashboardSelectedType' || e.key === 'dashboardSelectedId') {
        updateFromLocalStorage();
      }
    };

    // Same-tab changes via custom event
    const handleCustomEvent = () => {
      updateFromLocalStorage();
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener(DASHBOARD_SELECTION_CHANGE_EVENT, handleCustomEvent);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener(DASHBOARD_SELECTION_CHANGE_EVENT, handleCustomEvent);
    };
  }, []);

  const selectedTeamId = selectedType === 'team' ? selectedId : null;
  const selectedLeagueId = selectedType === 'league' ? selectedId : null;
  const selectedTournamentId = selectedType === 'tournament' ? selectedId : null;

  // Setter functions to update the selection
  const setTeamSelection = (teamId: string) => {
    localStorage.setItem('dashboardSelectedType', 'team');
    localStorage.setItem('dashboardSelectedId', teamId);
    setSelectedType('team');
    setSelectedId(teamId);
    notifyDashboardSelectionChange();
  };

  const setLeagueSelection = (leagueId: string) => {
    localStorage.setItem('dashboardSelectedType', 'league');
    localStorage.setItem('dashboardSelectedId', leagueId);
    setSelectedType('league');
    setSelectedId(leagueId);
    notifyDashboardSelectionChange();
  };
  
  const setTournamentSelection = (tournamentId: string) => {
    localStorage.setItem('dashboardSelectedType', 'tournament');
    localStorage.setItem('dashboardSelectedId', tournamentId);
    setSelectedType('tournament');
    setSelectedId(tournamentId);
    notifyDashboardSelectionChange();
  };

  return {
    selectedType,
    selectedId,
    selectedTeamId,
    selectedLeagueId,
    selectedTournamentId,
    setTeamSelection,
    setLeagueSelection,
    setTournamentSelection,
  };
}
