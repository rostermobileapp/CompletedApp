import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, ChevronDown, Clock3, History, Pencil, Plus, Settings2, Trophy, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { awardIcons, awardPresets } from './icons';
import { AwardImageEditor } from './AwardImageEditor';
import { AwardMark } from './AwardMark';
import { getAwardHolderLabel } from './teamAwardPresentation';
import type { AwardCadence, AwardPreset, SaveTeamAward, TeamAward, TeamAwardsBundle } from '@shared/teamAwards';

const cadenceLabels: Record<AwardCadence, string> = { game: 'Every game', week: 'Weekly', month: 'Monthly', season: 'Seasonal' };
const bundleKey = (teamId: string) => ['/api/teams', teamId, 'awards'];
const configKey = ['/api/team-awards/config'];

function ErrorLine({ message, retry }: { message: string; retry: () => void }) {
  return <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{message} <button className="ml-2 underline" onClick={retry}>Try again</button></div>;
}

export function TeamAwardsSection({ teamId }: { teamId: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [editing, setEditing] = useState<TeamAward | null>(null);
  const [creating, setCreating] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [timezone, setTimezone] = useState('');
  const [timezoneOpen, setTimezoneOpen] = useState(false);
  const [grantAward, setGrantAward] = useState<TeamAward | null>(null);
  const [grantPlayer, setGrantPlayer] = useState('');
  const [reassign, setReassign] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const config = useQuery<{ enabled: boolean; setupRequired?: boolean }>({
    queryKey: configKey, queryFn: async () => (await apiRequest('GET', '/api/team-awards/config')).json(),
    staleTime: 60_000,
  });
  const bundle = useQuery<TeamAwardsBundle>({
    queryKey: bundleKey(teamId), queryFn: async () => (await apiRequest('GET', `/api/teams/${teamId}/awards`)).json(),
    enabled: !!teamId && config.data?.enabled === true,
    refetchInterval: () => typeof document !== 'undefined' && document.visibilityState === 'visible' ? 15_000 : false,
    refetchOnWindowFocus: true,
  });
  const refresh = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['/api/teams'] }),
      qc.invalidateQueries({ queryKey: ['/api/team-awards/holders'] }),
      qc.invalidateQueries({ queryKey: bundleKey(teamId) }),
      qc.invalidateQueries({ queryKey: ['/api/team-awards/events/pending'] }),
    ]);
  };
  const mutation = useMutation({
    mutationFn: async ({ method, path, data }: { method: string; path: string; data?: unknown }) => {
      const res = await apiRequest(method, path, data);
      return res.status === 204 ? null : res.json().catch(() => null);
    },
    onSuccess: () => { void refresh(); },
    onError: (error: any) => toast({ title: 'Could not save award', description: error?.message || 'Please try again.', variant: 'destructive' }),
  });
  const save = async (data: SaveTeamAward) => {
    try {
      const res = await apiRequest('POST', `/api/teams/${teamId}/awards`, data);
      const result = await res.json();
      await refresh();
      return result as { id: string };
    } catch (error: any) {
      toast({ title: 'Could not save award', description: error?.message || 'Please try again.', variant: 'destructive' });
      return null;
    }
  };
  const awards = bundle.data?.awards ?? [];
  const visibleAwards = awards.filter((award) => award.archived === showArchived);
  const activeCount = awards.filter((award) => !award.archived).length;
  const zones = useMemo(() => {
    try { return (Intl as any).supportedValuesOf?.('timeZone') as string[] ?? []; } catch { return []; }
  }, []);
  if (config.data && !config.data.enabled) return null;

  return (
    <section aria-label="Custom team awards">
      <Collapsible open={expanded} onOpenChange={setExpanded}>
          <Card className="overflow-hidden border-border/70 bg-card shadow-sm">
          <CardHeader className="p-0">
            <CollapsibleTrigger className="flex min-h-12 w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset sm:px-5 pt-[2px] pb-[2px]">
              <span className="text-sm font-semibold">Custom Team Awards</span>
              <ChevronDown aria-hidden="true" className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
            </CollapsibleTrigger>
          </CardHeader>
          <CollapsibleContent>
            <CardContent className="space-y-2.5 border-t border-border/60 p-3 sm:p-4">
              {config.isLoading && <div aria-label="Loading award settings" className="space-y-2 animate-pulse"><div className="h-4 w-48 rounded bg-muted" /><div className="h-14 rounded-xl bg-muted" /></div>}
              {config.isError && <ErrorLine message="Award settings could not be loaded." retry={() => void config.refetch()} />}
              {config.data?.enabled && config.data.setupRequired && !bundle.data && !bundle.isError && <div className="flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2"><Clock3 className="h-4 w-4 shrink-0 text-muted-foreground" /><p className="text-sm text-muted-foreground">Team award setup is in progress.</p></div>}
              {config.data?.enabled && (!config.data.setupRequired || !!bundle.data || bundle.isError) && <>
                {bundle.data && <div className="flex min-h-10 items-center justify-between gap-1">
                  <div className="min-w-0 text-xs text-muted-foreground" aria-label={`${activeCount} of ${bundle.data.activeLimit ?? 5} active awards`}>
                    <span className="font-medium tabular-nums text-foreground">{activeCount}/{bundle.data.activeLimit ?? 5}</span><span> active</span>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {bundle.data.canManage && <Button className="h-10 w-10" variant="ghost" size="icon" onClick={() => setTimezoneOpen(true)} aria-label="Award timezone settings" title="Award timezone settings"><Settings2 className="h-4 w-4" /></Button>}
                    <Button className="h-10 w-10" variant="ghost" size="icon" onClick={() => setShowArchived((v) => !v)} aria-label={showArchived ? 'Show active awards' : 'Show award history'} title={showArchived ? 'Show active awards' : 'Show award history'}><History className="h-4 w-4" /></Button>
                    {bundle.data.canManage && !showArchived && <Button className="h-10 w-10" size="icon" onClick={() => setCreating(true)} disabled={activeCount >= (bundle.data?.activeLimit ?? 5)} aria-label="Create Award" title="Create Award"><Plus className="h-4 w-4" /></Button>}
                  </div>
                </div>}
                {bundle.isLoading && <div aria-label="Loading awards" className="space-y-1.5 animate-pulse"><div className="h-12 rounded-lg bg-muted" /><div className="h-12 rounded-lg bg-muted" /></div>}
                {bundle.isError && <ErrorLine message="Awards could not be loaded." retry={() => void bundle.refetch()} />}
                {bundle.data && <>
            {!visibleAwards.length && <div className="flex items-center gap-3 rounded-lg border border-dashed border-border px-3 py-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><Trophy className="h-4 w-4" /></div><div><h3 className="text-sm font-semibold">{showArchived ? 'No awards in the archives' : 'No awards yet'}</h3><p className="text-xs text-muted-foreground">{showArchived ? 'Archived awards will appear here.' : 'Create an award to start a team tradition.'}</p></div></div>}
            <div className="grid gap-1.5">
              {visibleAwards.map((award) => <AwardRow key={award.id} award={award} canManage={bundle.data!.canManage} onEdit={() => setEditing(award)} onArchive={() => mutation.mutate({ method: 'PATCH', path: `/api/teams/${teamId}/awards/${award.id}`, data: { archived: true } })} onGrant={() => { setGrantAward(award); setGrantPlayer(''); setReassign(false); }} />)}
            </div>
                </>}
              </>}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>
      {timezoneOpen && bundle.data?.canManage && <Dialog open onOpenChange={setTimezoneOpen}>
        <DialogContent className="w-[calc(100%-2rem)] max-w-sm rounded-xl p-4 sm:p-5">
          <DialogHeader><DialogTitle>Award timezone</DialogTitle><DialogDescription>Sets the timezone used for award periods. Current: {bundle.data.timezone}</DialogDescription></DialogHeader>
          <div><Label htmlFor={`award-zone-${teamId}`}>Timezone</Label><Input id={`award-zone-${teamId}`} list={`award-zones-${teamId}`} value={timezone || bundle.data.timezone} onChange={(e) => setTimezone(e.target.value)} className="mt-1 h-10" placeholder="America/New_York" /><datalist id={`award-zones-${teamId}`}>{zones.map((zone) => <option key={zone} value={zone} />)}</datalist></div>
          <div className="flex justify-end gap-2"><Button variant="ghost" className="min-h-10" onClick={() => setTimezoneOpen(false)}>Cancel</Button><Button className="min-h-10" disabled={!timezone || timezone === bundle.data.timezone || mutation.isPending} onClick={() => mutation.mutate({ method: 'PATCH', path: `/api/teams/${teamId}/award-settings`, data: { timezone } })}>{mutation.isPending ? 'Saving…' : 'Save timezone'}</Button></div>
        </DialogContent>
      </Dialog>}
      {(creating || editing) && <AwardDialog teamId={teamId} award={editing} onClose={() => { setEditing(null); setCreating(false); }} onSave={save} onImageSaved={refresh} onError={(message) => toast({ title: 'Image update', description: message, variant: 'destructive' })} />}
      {grantAward && bundle.data && <Dialog open onOpenChange={(open) => { if (!open) setGrantAward(null); }}>
        <DialogContent className="max-h-[90dvh] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-2xl p-5 sm:p-6">
          <DialogHeader><DialogTitle>Pass on {grantAward.name}</DialogTitle><DialogDescription>{grantAward.window.opensAt ? `Award window: ${new Date(grantAward.window.opensAt).toLocaleDateString()}${grantAward.window.closesAt ? ` – ${new Date(grantAward.window.closesAt).toLocaleDateString()}` : ''}` : 'No current award window is open.'}</DialogDescription></DialogHeader>
          <Label className="mt-4 block" htmlFor="award-player">Choose a roster player</Label><select id="award-player" value={grantPlayer} onChange={(e) => setGrantPlayer(e.target.value)} className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="">Select a player</option>{bundle.data.roster.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}</select>
          {grantAward.currentGrant && <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm"><p><strong>{grantAward.currentGrant.playerName}</strong> currently holds this award for this period.</p><label className="mt-2 flex cursor-pointer items-center gap-2"><input type="checkbox" checked={reassign} onChange={(e) => setReassign(e.target.checked)} />Confirm reassigning it to another player</label></div>}
          <div className="mt-5 flex justify-end gap-2"><Button variant="ghost" onClick={() => setGrantAward(null)}>Cancel</Button><Button disabled={!grantPlayer || mutation.isPending || (!!grantAward.currentGrant && !reassign) || !grantAward.window.periodKey} onClick={() => {
            const chosen = grantPlayer;
            apiRequest('POST', `/api/teams/${teamId}/awards/${grantAward.id}/grants`, { playerId: chosen, periodKey: grantAward.window.periodKey, reassign }).then(async (r) => { const result = await r.json(); await refresh(); setGrantAward(null); toast({ title: result.changed ? 'Award passed on' : 'No change', description: result.changed ? 'The roster has a new holder.' : 'That player already holds the award.' }); }).catch((e: any) => toast({ title: 'Could not pass on award', description: e?.message || 'Please try again.', variant: 'destructive' }));
          }}>Grant award</Button></div>
        </DialogContent>
      </Dialog>}
    </section>
  );

}

function AwardRow({ award, canManage, onEdit, onArchive, onGrant }: { award: TeamAward; canManage: boolean; onEdit: () => void; onArchive: () => void; onGrant: () => void }) {
  const [open, setOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  return <article className="flex min-w-0 flex-wrap items-center gap-1 rounded-lg border border-border/70 px-1.5 py-1 sm:gap-2 sm:px-2">
    <div className={`flex h-8 w-8 shrink-0 items-center justify-center text-primary ${award.imageUrl ? 'bg-transparent' : 'overflow-hidden rounded-md bg-primary/10'}`}><AwardMark imageUrl={award.imageUrl} presetIcon={award.presetIcon} iconClassName="h-4 w-4" /></div>
    <button type="button" className="min-h-10 min-w-0 flex-1 rounded py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setDetailsOpen(true)} aria-label={`View details for ${award.name}`} title="View award details">
      <span className="block truncate text-xs font-semibold leading-4 sm:text-sm">{award.name}</span>
      <span className="block truncate text-[10px] leading-4 text-muted-foreground sm:text-[11px]">{getAwardHolderLabel(award.holder?.name)} · {cadenceLabels[award.cadence]}</span>
    </button>
    <div className="flex shrink-0 items-center gap-0 sm:gap-0.5">
      {canManage && !award.archived && <>
        <Button className="h-10 w-10" size="icon" variant="ghost" onClick={onGrant} disabled={!award.window.periodKey} aria-label="Grant" title="Grant"><Users className="h-4 w-4" /></Button>
        <Button className="h-10 w-10" size="icon" variant="ghost" onClick={onEdit} aria-label="Edit" title="Edit"><Pencil className="h-4 w-4" /></Button>
        <Button className="h-10 w-10" size="icon" variant="ghost" aria-label={`Archive ${award.name}`} title={`Archive ${award.name}`} onClick={onArchive}><Archive className="h-4 w-4" /></Button>
      </>}
      {!!award.history.length && <Button className="h-10 w-10" size="icon" variant="ghost" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label={open ? 'Hide award history' : 'Show award history'} title={open ? 'Hide award history' : 'Show award history'}><History className="h-4 w-4" /></Button>}
    </div>
    {open && <ul className="basis-full border-t border-border/60 px-2 pt-1 text-xs text-muted-foreground">{award.history.map((grant) => <li className="py-1" key={grant.id}><span className="font-medium text-foreground">{grant.periodKey}</span> · {grant.playerName} · <time dateTime={grant.grantedAt}>{new Date(grant.grantedAt).toLocaleString()}</time>{grant.grantedByName && <> · by {grant.grantedByName}</>}</li>)}</ul>}
    <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
      <DialogContent className="max-h-[85dvh] w-[calc(100%-2rem)] max-w-sm overflow-y-auto rounded-xl">
        <DialogHeader><DialogTitle>{award.name}</DialogTitle><DialogDescription>{cadenceLabels[award.cadence]} · {getAwardHolderLabel(award.holder?.name)}</DialogDescription></DialogHeader>
        {award.description && <p className="whitespace-pre-wrap break-words text-sm">{award.description}</p>}
        {award.window.closesAt && <p className="text-xs text-muted-foreground">Award window closes {new Date(award.window.closesAt).toLocaleString()}</p>}
      </DialogContent>
    </Dialog>
  </article>;
}

function AwardDialog({ teamId, award, onClose, onSave, onImageSaved, onError }: { teamId: string; award: TeamAward | null; onClose: () => void; onSave: (data: SaveTeamAward) => Promise<{ id: string } | null>; onImageSaved: () => void; onError: (message: string) => void }) {
  const [name, setName] = useState(award?.name ?? '');
  const [description, setDescription] = useState(award?.description ?? '');
  const [cadence, setCadence] = useState<AwardCadence>(award?.cadence ?? 'game');
  const [presetIcon, setPresetIcon] = useState<AwardPreset>(award?.presetIcon ?? 'trophy');
  const [savedId, setSavedId] = useState<string | null>(award?.id ?? null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [imageRemoved, setImageRemoved] = useState(false);
  const cadenceOptions: AwardCadence[] = ['game', 'week', 'month', 'season'];
  async function submit(e: FormEvent) {
    e.preventDefault(); if (!name.trim()) return;
    setBusy(true);
    const result = await onSave({ ...(savedId ? { id: savedId } : {}), name: name.trim(), description: description.trim(), cadence, presetIcon });
    if (result) { setSavedId(result.id); setSaved(true); }
    setBusy(false);
  }
  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
    <DialogContent className="max-h-[92dvh] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-2xl p-5 sm:p-6">
      <form onSubmit={submit} className="space-y-4">
        <DialogHeader><DialogTitle>{award ? 'Edit team award' : 'Create a team award'}</DialogTitle><DialogDescription>Give your team something fun to pass around.</DialogDescription></DialogHeader>
        <div><Label htmlFor="award-name">Name</Label><Input id="award-name" autoFocus maxLength={40} required value={name} onChange={(e) => { setName(e.target.value); setSaved(false); }} placeholder="The locker-room spark" /><p className="mt-1 text-right text-xs text-muted-foreground">{name.length}/40</p></div>
        <div><Label htmlFor="award-description">What earns it?</Label><textarea id="award-description" maxLength={140} value={description} onChange={(e) => { setDescription(e.target.value); setSaved(false); }} placeholder="For the teammate who brings the good energy." className="mt-1 min-h-20 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" /><p className="mt-1 text-right text-xs text-muted-foreground">{description.length}/140</p></div>
        <div><Label>Cadence</Label><div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">{cadenceOptions.map((item) => <button type="button" key={item} disabled={!!savedId} onClick={() => { setCadence(item); setSaved(false); }} className={`rounded-lg border px-2 py-2 text-sm ${cadence === item ? 'border-primary bg-primary/10 text-primary' : 'border-border'} disabled:cursor-not-allowed disabled:opacity-60`}>{cadenceLabels[item]}</button>)}</div>{savedId && <p className="mt-1 text-xs text-muted-foreground">Cadence is fixed after an award is created.</p>}</div>
        <div><Label>Choose a holder icon</Label><div className="mt-2 flex flex-wrap gap-2">{awardPresets.map((preset) => { const Icon = awardIcons[preset]; return <button type="button" key={preset} aria-label={`Use ${preset} icon`} aria-pressed={presetIcon === preset} onClick={() => { setPresetIcon(preset); setSaved(false); }} className={`flex h-10 w-10 items-center justify-center rounded-lg border ${presetIcon === preset ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'}`}><Icon className="h-5 w-5" /></button>; })}</div></div>
        {!savedId && <p className="rounded-lg bg-muted/40 p-3 text-sm text-muted-foreground">Save the award first. You can then add optional artwork. Transparent PNGs keep their transparency.</p>}
        {savedId && <AwardImageEditor teamId={teamId} awardId={savedId} imageUrl={imageRemoved ? null : award?.imageUrl} onSaved={onImageSaved} onError={onError} onRemove={async () => {
          setBusy(true);
          const result = await onSave({ id: savedId, name: name.trim(), description: description.trim(), cadence, presetIcon, removeImage: true });
          if (result) { setImageRemoved(true); setSaved(true); }
          setBusy(false);
        }} />}
        {saved && <p role="status" className="text-sm text-primary">Saved. Choose Done when you’re finished.</p>}
        <div className="flex flex-wrap justify-end gap-2 border-t border-border/60 pt-4"><Button type="button" variant="ghost" onClick={onClose}>Done</Button><Button type="submit" disabled={busy || !name.trim()}>{busy ? 'Saving…' : savedId ? 'Save changes' : 'Save award'}</Button></div>
      </form>
    </DialogContent>
  </Dialog>;
}
