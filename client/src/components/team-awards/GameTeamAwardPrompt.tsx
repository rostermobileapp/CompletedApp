import { useState } from 'react';
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { AwardMark } from './AwardMark';
import { getAwardHolderLabel } from './teamAwardPresentation';
import type { TeamAward, TeamAwardsBundle } from '@shared/teamAwards';

export function GameTeamAwardPrompt({ teamIds, gameId }: { teamIds: string[]; gameId?: string }) {
  const [choice, setChoice] = useState<{ teamId: string; award: TeamAward; roster: TeamAwardsBundle['roster'] } | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState('');
  const [reassign, setReassign] = useState(false);
  const qc = useQueryClient();
  const { toast } = useToast();
  const uniqueIds = Array.from(new Set(teamIds.filter(Boolean)));
  const configQuery = useQuery<{ enabled: boolean }>({
    queryKey: ['/api/team-awards/config'],
    queryFn: async () => (await apiRequest('GET', '/api/team-awards/config')).json(),
    enabled: !!gameId && uniqueIds.length > 0,
    staleTime: 60_000,
  });
  const enabled = configQuery.data?.enabled === true;
  const bundles = useQueries({ queries: uniqueIds.map((teamId) => ({
    queryKey: ['/api/teams', teamId, 'awards', 'game', gameId],
    queryFn: async () => (await apiRequest('GET', `/api/teams/${teamId}/awards`)).json() as Promise<TeamAwardsBundle>,
    enabled: !!gameId && enabled,
    refetchInterval: () => typeof document !== 'undefined' && document.visibilityState === 'visible' ? 15_000 : false,
    refetchOnWindowFocus: true,
  })) });
  const promptAwards = bundles.flatMap((query, index) => (query.data?.awards ?? [])
    .filter((award) => !award.archived && award.window.gameId === gameId && !!award.window.periodKey)
    .map((award) => ({ teamId: uniqueIds[index], award, roster: query.data!.roster, canManage: query.data!.canManage })));
  if (configQuery.isLoading || configQuery.isError || !enabled || !promptAwards.length) return null;
  const onGrant = async () => {
    if (!choice) return;
    try {
      const response = await apiRequest('POST', `/api/teams/${choice.teamId}/awards/${choice.award.id}/grants`, {
        playerId: selectedPlayer, periodKey: choice.award.window.periodKey, reassign,
      });
      const result = await response.json();
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['/api/teams', choice.teamId, 'awards'] }),
        qc.invalidateQueries({ queryKey: ['/api/team-awards/holders'] }),
        qc.invalidateQueries({ queryKey: ['/api/team-awards/events/pending'] }),
      ]);
      toast({ title: result.changed ? 'Award passed on' : 'No change', description: result.changed ? 'The game’s award holder has been updated.' : 'That player already holds the award.' });
      setChoice(null);
    } catch (error: any) {
      toast({ title: 'Could not pass on award', description: error?.message || 'Please try again.', variant: 'destructive' });
    }
  };
  return <>
    <section aria-label="Game award prompts" className="rounded-xl border border-primary/20 bg-primary/[0.035] p-4">
      <div className="mb-3 flex items-center gap-2"><Trophy className="h-4 w-4 text-primary" /><h2 className="font-semibold">Team award moments</h2></div>
      <div className="grid gap-2 sm:grid-cols-2">{promptAwards.map(({ teamId, award, canManage }) => {
        return <article key={`${teamId}-${award.id}`} className="flex items-center gap-3 rounded-lg bg-background/80 p-3">
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center text-primary ${award.imageUrl ? 'bg-transparent' : 'overflow-hidden rounded-lg bg-primary/10'}`}><AwardMark imageUrl={award.imageUrl} presetIcon={award.presetIcon} /></span>
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{award.name}</p><p className="truncate text-xs text-muted-foreground">{getAwardHolderLabel(award.holder?.name)}</p></div>
          {canManage && <Button size="sm" variant="outline" onClick={() => { setChoice({ teamId, award, roster: promptAwards.find((x) => x.teamId === teamId)?.roster ?? [] }); setSelectedPlayer(''); setReassign(false); }}>Choose holder</Button>}
        </article>;
      })}</div>
    </section>
    {choice && <GameGrantDialog
      choice={choice} close={() => setChoice(null)} submit={onGrant}
      selectedPlayer={selectedPlayer} setSelectedPlayer={setSelectedPlayer}
      reassign={reassign} setReassign={setReassign}
    />}
  </>;
}

// Keep this tiny modal separate from award configuration to make the game
// prompt an action, not a second place to manage award definitions.
function GameGrantDialog({ choice, close, submit, selectedPlayer, setSelectedPlayer, reassign, setReassign }: {
  choice: { teamId: string; award: TeamAward; roster: TeamAwardsBundle['roster'] }; close: () => void; submit: () => void;
  selectedPlayer: string; setSelectedPlayer: (value: string) => void; reassign: boolean; setReassign: (value: boolean) => void;
}) {
  return <Dialog open onOpenChange={(open) => { if (!open) close(); }}>
    <DialogContent className="max-h-[90dvh] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-2xl">
      <DialogHeader><DialogTitle>Choose a holder for {choice.award.name}</DialogTitle><DialogDescription>Choose a player on this team’s game roster.</DialogDescription></DialogHeader>
      <label className="mt-4 block text-sm font-medium" htmlFor="game-award-player">Roster player</label>
      <select id="game-award-player" value={selectedPlayer} onChange={(e) => setSelectedPlayer(e.target.value)} className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="">Select a player</option>{choice.roster.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}</select>
      {choice.award.currentGrant && <label className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/30 p-3 text-sm"><input type="checkbox" checked={reassign} onChange={(e) => setReassign(e.target.checked)} /><span>Reassign from {choice.award.currentGrant.playerName}</span></label>}
      <div className="mt-5 flex justify-end gap-2"><Button variant="ghost" onClick={close}>Cancel</Button><Button disabled={!selectedPlayer || (!!choice.award.currentGrant && !reassign)} onClick={submit}>Pass it on</Button></div>
    </DialogContent>
  </Dialog>;
}
