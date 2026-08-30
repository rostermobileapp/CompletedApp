import { useState, useEffect } from 'react';
import { useDemo } from '@/context/DemoContext';

// Custom event for notifying same-tab changes
export const DASHBOARD_SELECTION_CHANGE_EVENT = 'dashboardSelectionChange';

// Helper function to dispatch selection change event
export function notifyDashboardSelectionChange() {
  window.dispatchEvent(new CustomEvent(DASHBOARD_SELECTION_CHANGE_EVENT));
}

export function useDashboardSelection() {
  const { isActive: isDemoActive } = useDemo();
  const typeKey = isDemoActive ? 'roster.demo.dashboardSelectedType' : 'dashboardSelectedType';
  const idKey = isDemoActive ? 'roster.demo.dashboardSelectedId' : 'dashboardSelectedId';
  const [selectedType, setSelectedType] = useState<'team' | 'league' | 'tournament' | null>(() => {
    const saved = localStorage.getItem(typeKey);
    return (saved === 'team' || saved === 'league' || saved === 'tournament') ? saved : null;
  });
  
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    return localStorage.getItem(idKey) || null;
  });

  // Listen for changes to localStorage from other tabs AND same tab via custom event
  useEffect(() => {
    const updateFromLocalStorage = () => {
      const type = localStorage.getItem(typeKey);
      const id = localStorage.getItem(idKey);
      setSelectedType((type === 'team' || type === 'league' || type === 'tournament') ? type : null);
      setSelectedId(id);
    };
    // Switching Demo mode changes the storage namespace in this same mounted
    // hook instance; storage events do not fire in the originating tab.
    updateFromLocalStorage();

    // Cross-tab changes via storage event
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === typeKey || e.key === idKey) {
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
  }, [typeKey, idKey]);

  const selectedTeamId = selectedType === 'team' ? selectedId : null;
  const selectedLeagueId = selectedType === 'league' ? selectedId : null;
  const selectedTournamentId = selectedType === 'tournament' ? selectedId : null;

  // Setter functions to update the selection
  const setTeamSelection = (teamId: string) => {
    localStorage.setItem(typeKey, 'team');
    localStorage.setItem(idKey, teamId);
    setSelectedType('team');
    setSelectedId(teamId);
    notifyDashboardSelectionChange();
  };

  const setLeagueSelection = (leagueId: string) => {
    localStorage.setItem(typeKey, 'league');
    localStorage.setItem(idKey, leagueId);
    setSelectedType('league');
    setSelectedId(leagueId);
    notifyDashboardSelectionChange();
  };
  
  const setTournamentSelection = (tournamentId: string) => {
    localStorage.setItem(typeKey, 'tournament');
    localStorage.setItem(idKey, tournamentId);
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
