import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, ChevronDown, Clock3, History, Plus, Trophy, Users } from 'lucide-react';
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

  return <section aria-label="Custom team awards">
    <Collapsible open={expanded} onOpenChange={setExpanded}>
      <Card className="overflow-hidden border-border/70 bg-card shadow-sm">
        <CardHeader className="p-0">
          <CollapsibleTrigger className="flex min-h-12 w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset sm:px-5">
            <span className="text-sm font-semibold">Custom Team Awards</span>
            <ChevronDown aria-hidden="true" className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
          </CollapsibleTrigger>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="space-y-4 border-t border-border/60 p-4 sm:p-5">
            {config.isLoading && <div aria-label="Loading award settings" className="space-y-2 animate-pulse"><div className="h-4 w-48 rounded bg-muted" /><div className="h-14 rounded-xl bg-muted" /></div>}
            {config.isError && <ErrorLine message="Award settings could not be loaded." retry={() => void config.refetch()} />}
            {config.data?.enabled && config.data.setupRequired && !bundle.data && !bundle.isError && <div className="flex items-start gap-3 rounded-xl border border-dashed border-border p-4"><Clock3 className="mt-0.5 h-5 w-5 text-muted-foreground" /><div><p className="font-medium">Team awards are getting set up</p><p className="text-sm text-muted-foreground">They’ll be ready here once this team’s award setup is complete.</p></div></div>}
            {config.data?.enabled && (!config.data.setupRequired || !!bundle.data || bundle.isError) && <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">Little traditions, made by your team.</p>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => setShowArchived((v) => !v)}><History className="mr-1.5 h-4 w-4" />{showArchived ? 'Active awards' : 'History'}</Button>
                  {bundle.data?.canManage && !showArchived && <Button size="sm" onClick={() => setCreating(true)} disabled={activeCount >= (bundle.data?.activeLimit ?? 5)}><Plus className="mr-1.5 h-4 w-4" />Create Award</Button>}
                </div>
              </div>
              {bundle.isLoading && <div className="space-y-2 animate-pulse"><div className="h-16 rounded-xl bg-muted" /><div className="h-16 rounded-xl bg-muted" /></div>}
              {bundle.isError && <ErrorLine message="Awards could not be loaded." retry={() => void bundle.refetch()} />}
              {bundle.data && <>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>{activeCount} of {bundle.data.activeLimit ?? 5} active awards</span>
            <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" />{bundle.data.roster.length} players</span>
          </div>
          {bundle.data.canManage && <div className="flex flex-wrap items-end gap-2 rounded-lg bg-muted/30 p-3">
            <div className="min-w-[220px] flex-1"><Label htmlFor={`award-zone-${teamId}`} className="text-xs">Award timezone</Label>
              <Input id={`award-zone-${teamId}`} list={`award-zones-${teamId}`} value={timezone || bundle.data.timezone} onChange={(e) => setTimezone(e.target.value)} className="mt-1 h-9" placeholder="America/New_York" />
              <datalist id={`award-zones-${teamId}`}>{zones.map((zone) => <option key={zone} value={zone} />)}</datalist>
            </div>
            <Button size="sm" variant="outline" disabled={!timezone || timezone === bundle.data.timezone || mutation.isPending} onClick={() => mutation.mutate({ method: 'PATCH', path: `/api/teams/${teamId}/award-settings`, data: { timezone } })}>Save timezone</Button>
          </div>}
          {!visibleAwards.length && <div className="rounded-xl border border-dashed border-border px-5 py-8 text-center"><div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary"><Trophy className="h-5 w-5" /></div><h3 className="font-semibold">{showArchived ? 'No awards in the archives' : 'Start a team tradition'}</h3><p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">{showArchived ? 'Archived awards will live here.' : 'Create a custom award and pass it around after games, weeks, months, or seasons.'}</p></div>}
          <div className="grid gap-3">
            {visibleAwards.map((award) => <AwardRow key={award.id} award={award} canManage={bundle.data!.canManage} onEdit={() => setEditing(award)} onArchive={() => mutation.mutate({ method: 'PATCH', path: `/api/teams/${teamId}/awards/${award.id}`, data: { archived: true } })} onGrant={() => { setGrantAward(award); setGrantPlayer(''); setReassign(false); }} />)}
          </div>
              </>}
            </>}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
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
  </section>;

}

function AwardRow({ award, canManage, onEdit, onArchive, onGrant }: { award: TeamAward; canManage: boolean; onEdit: () => void; onArchive: () => void; onGrant: () => void }) {
    return <article className="flex flex-col gap-3 rounded-xl border border-border/70 p-3 sm:flex-row sm:items-center sm:p-4">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-primary/10 text-primary"><AwardMark imageUrl={award.imageUrl} presetIcon={award.presetIcon} iconClassName="h-6 w-6" /></div>
        <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{award.name}</h3><span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{cadenceLabels[award.cadence]}</span></div><p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{award.description}</p><p className="mt-1 text-xs text-muted-foreground">{getAwardHolderLabel(award.holder?.name)}{award.window.closesAt ? ` · closes ${new Date(award.window.closesAt).toLocaleDateString()}` : ''}</p></div>
      </div>
       <div className="flex shrink-0 gap-2">{canManage && !award.archived && <><Button size="sm" variant="outline" onClick={onGrant} disabled={!award.window.periodKey}><Users className="mr-1.5 h-4 w-4" />Award</Button><Button size="sm" variant="ghost" onClick={onEdit}>Edit</Button><Button size="icon" variant="ghost" aria-label={`Archive ${award.name}`} onClick={onArchive}><Archive className="h-4 w-4" /></Button></>}</div>
      <HistoryList award={award} />
    </article>;
}

function HistoryList({ award }: { award: TeamAward }) {
  const [open, setOpen] = useState(false);
  if (!award.history.length) return null;
  return <div className="basis-full border-t border-border/60 pt-2 sm:basis-auto sm:border-0 sm:pt-0"><button onClick={() => setOpen((v) => !v)} className="text-xs font-medium text-primary underline-offset-2 hover:underline" aria-expanded={open}>{open ? 'Hide' : 'View'} history ({award.history.length})</button>{open && <ul className="mt-2 space-y-1 text-xs text-muted-foreground">{award.history.map((grant) => <li key={grant.id}><span className="font-medium text-foreground">{grant.periodKey}</span> · {grant.playerName} · <time dateTime={grant.grantedAt}>{new Date(grant.grantedAt).toLocaleString()}</time>{grant.grantedByName && <> · by {grant.grantedByName}</>}</li>)}</ul>}</div>;
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
        {!savedId && <p className="rounded-lg bg-muted/40 p-3 text-sm text-muted-foreground">Save the award first. You can then add optional artwork and preview or remove its background.</p>}
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
