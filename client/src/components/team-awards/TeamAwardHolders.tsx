import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { Award, CircleDot } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { apiRequest } from '@/lib/queryClient';
import { AwardMark } from './AwardMark';
import type { HeldTeamAward } from '@shared/teamAwards';

export function useTeamAwardHolders() {
  const config = useQuery<{ enabled: boolean }>({
    queryKey: ['/api/team-awards/config'],
    queryFn: async () => (await apiRequest('GET', '/api/team-awards/config')).json(),
    staleTime: 60_000,
  });
  const holders = useQuery<HeldTeamAward[]>({
    queryKey: ['/api/team-awards/holders'],
    queryFn: async () => (await apiRequest('GET', '/api/team-awards/holders')).json(),
    enabled: config.data?.enabled === true,
    refetchInterval: () => typeof document !== 'undefined' && document.visibilityState === 'visible' ? 15_000 : false,
    refetchOnWindowFocus: true,
    retry: false,
  });
  return {
    ...holders,
    data: config.data?.enabled ? holders.data : undefined,
    isLoading: config.isLoading || (!!config.data?.enabled && holders.isLoading),
    isError: config.data?.enabled === true && holders.isError,
  };
}

/** Receives shared parent data, so roster rows never create their own polling observers. */
export function PlayerAwardBadges({ playerId, teamId, holders = [], isError = false }: {
  playerId: string; teamId?: string; holders?: HeldTeamAward[]; isError?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const awards = holders.filter((item) => item.playerId === playerId && (!teamId || item.teamId === teamId));
  if (!awards.length && !isError) return null;
  const visible = awards.slice(0, 2);
  return <div className="relative inline-flex items-center gap-0.5" aria-label={`${awards.length} team awards held`} onClick={(event) => event.stopPropagation()}>
    {visible.map((item) => <button key={item.id} type="button" title={`${item.name} · ${item.teamName}`} aria-label={`${item.name}, ${item.teamName}`} onClick={() => setOpen(true)} className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full border border-background bg-primary/10 text-primary shadow-sm">
      <AwardMark imageUrl={item.imageUrl} presetIcon={item.presetIcon} iconClassName="h-3.5 w-3.5" />
    </button>)}
    {awards.length > 2 && <button type="button" onClick={() => setOpen(true)} className="flex h-7 min-w-7 items-center justify-center rounded-full border border-background bg-muted px-1.5 text-[10px] font-semibold" aria-label={`Show all ${awards.length} awards`}>+{awards.length - 2}</button>}
    {isError && !awards.length && <button type="button" title="Award holders unavailable" aria-label="Award holder list unavailable; open for details" onClick={() => setOpen(true)} className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-muted-foreground"><CircleDot className="h-3.5 w-3.5" /></button>}
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[85dvh] w-[calc(100%-2rem)] max-w-sm overflow-y-auto rounded-2xl">
        <DialogHeader><DialogTitle>Awards held</DialogTitle><DialogDescription>{isError && !awards.length ? 'Holder names are unavailable right now.' : 'Current awards held by this player.'}</DialogDescription></DialogHeader>
        {awards.length > 0 && <ul className="space-y-2">{awards.map((item) => <li key={item.id} className="flex items-center gap-3 rounded-lg bg-muted/40 p-2.5"><span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg bg-primary/10 text-primary"><AwardMark imageUrl={item.imageUrl} presetIcon={item.presetIcon} /></span><span className="min-w-0"><strong className="block truncate text-sm">{item.name}</strong><span className="block truncate text-xs text-muted-foreground">{item.teamName}</span></span></li>)}</ul>}
        <button onClick={() => setOpen(false)} className="mt-1 w-full rounded-md bg-secondary px-3 py-2 text-sm font-medium">Close</button>
      </DialogContent>
    </Dialog>
  </div>;
}

export function TeamAwardHolderStrip({ playerId }: { playerId?: string }) {
  const { data, isLoading, isError } = useTeamAwardHolders();
  const [open, setOpen] = useState(false);
  const [, navigate] = useLocation();
  const awards = playerId ? (data ?? []).filter((item) => item.playerId === playerId) : [];
  if (isLoading || (!awards.length && !isError)) return null;
  return <div className="relative flex items-center gap-1" aria-label="Your team awards">
    {awards.slice(0, 2).map((item) => <button key={`${item.teamId}-${item.id}`} type="button" title={`${item.name} · ${item.teamName}`} aria-label={`Open ${item.name} for ${item.teamName}`} onClick={() => setOpen(true)} className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-border/70 bg-card text-primary hover:bg-primary/5">
      <AwardMark imageUrl={item.imageUrl} presetIcon={item.presetIcon} />
    </button>)}
    {awards.length > 2 && <button type="button" onClick={() => setOpen(true)} aria-label={`Show all ${awards.length} awards`} className="flex h-9 min-w-9 items-center justify-center rounded-full border border-border/70 bg-card px-2 text-xs font-semibold text-primary">+{awards.length - 2}</button>}
    {isError && <button type="button" onClick={() => setOpen(true)} aria-label="Award holders unavailable" className="flex h-9 w-9 items-center justify-center rounded-full border border-border/70 bg-card text-muted-foreground"><Award className="h-4 w-4" /></button>}
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[85dvh] w-[calc(100%-2rem)] max-w-sm overflow-y-auto rounded-2xl">
        <DialogHeader><DialogTitle>Your team awards</DialogTitle><DialogDescription>{isError ? 'Award holders are temporarily unavailable.' : 'Choose an award to open its team page.'}</DialogDescription></DialogHeader>
        {awards.length > 0 && <ul className="space-y-2">{awards.map((item) => <li key={`${item.teamId}-${item.id}`}><button onClick={() => { setOpen(false); navigate(`/teams?awardTeam=${encodeURIComponent(item.teamId)}`); }} className="flex w-full items-center gap-3 rounded-lg bg-muted/40 p-2.5 text-left hover:bg-muted"><span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg bg-primary/10 text-primary"><AwardMark imageUrl={item.imageUrl} presetIcon={item.presetIcon} /></span><span><strong className="block text-sm">{item.name}</strong><span className="text-xs text-muted-foreground">{item.teamName}</span></span></button></li>)}</ul>}
        <button onClick={() => setOpen(false)} className="mt-1 w-full rounded-md bg-secondary px-3 py-2 text-sm font-medium">Close</button>
      </DialogContent>
    </Dialog>
  </div>;
}

