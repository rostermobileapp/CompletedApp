import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

type Candidate = {
  type: 'user';
  id: string; displayId: string; name: string; email: string;
};
type Detail = Candidate & {
  seasons: { name: string | null; games: number; goals: number; assists: number; penalties: number }[];
  teams: string[];
  history: { goals: number; penalties: number; goalie: number; stars: number; attendance: number; rsvps: number };
};

function Picker({ leagueId, label, selected, onSelect }: {
  leagueId: string; label: string; selected: Candidate | null;
  onSelect: (candidate: Candidate | null) => void;
}) {
  const [search, setSearch] = useState('');
  const { data = [], isFetching } = useQuery<Candidate[]>({
    queryKey: ['player-merge-candidates', leagueId, search],
    queryFn: async () => (await apiRequest('GET', `/api/leagues/${leagueId}/player-merge/candidates?search=${encodeURIComponent(search)}`)).json(),
  });
  return (
    <div className="space-y-2 min-w-0">
      <label className="text-sm font-semibold">{label}</label>
       <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, email or U ID" aria-label={`Search ${label}`} />
      {selected && <div className="rounded border border-primary p-2 text-sm">
         <b>{selected.name}</b> · {selected.displayId}<br />{selected.email}
        <button type="button" className="ml-2 underline" onClick={() => onSelect(null)}>Change</button>
      </div>}
      {!selected && <div className="max-h-48 overflow-y-auto rounded border" role="listbox" aria-label={label}>
        {isFetching && <p className="p-2 text-sm">Searching…</p>}
         {data.map(c => (
          <button type="button" key={`${c.type}:${c.id}`} onClick={() => onSelect(c)}
            className="block w-full border-b p-2 text-left text-sm hover:bg-muted">
             <b>{c.name || 'Unnamed user'}</b> · {c.displayId}<br />
             <span className="text-muted-foreground">{c.email}</span>
          </button>
        ))}
         {!isFetching && !data.length && <p className="p-2 text-sm">No matching user accounts found in this league</p>}
      </div>}
    </div>
  );
}

function IdentityDetail({ title, value }: { title: string; value: Detail }) {
  return <section className="min-w-0 rounded-lg border p-3 text-sm space-y-2">
    <h3 className="font-bold">{title}</h3>
     <p>{value.name} · {value.displayId}<br />{value.email}</p>
    <p><b>Teams:</b> {value.teams.join(', ') || 'None'}</p>
    <p><b>Season totals:</b> {value.seasons.length ? value.seasons.map(s =>
      `${s.name || 'No season'}: ${s.games} GP, ${s.goals} G, ${s.assists} A, ${s.penalties} PIM`).join('; ') : 'None'}</p>
    <p><b>Game records:</b> {value.history.goals} goal events, {value.history.penalties} penalties,
      {' '}{value.history.goalie} goalie appearances, {value.history.stars} star awards,
      {' '}{value.history.attendance} attendances, {value.history.rsvps} RSVPs</p>
  </section>;
}

export function LeaguePlayerMerge({ leagueId }: { leagueId: string }) {
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState<Candidate | null>(null);
  const [survivor, setSurvivor] = useState<Candidate | null>(null);
  const [preview, setPreview] = useState<{ source: Detail; survivor: Detail } | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { toast } = useToast();
  const client = useQueryClient();
  const reset = () => { setOpen(false); setSource(null); setSurvivor(null); setPreview(null); setAcknowledged(false); setError(''); };
  const changeSource = (c: Candidate | null) => { setSource(c); setPreview(null); setAcknowledged(false); setError(''); };
  const changeSurvivor = (c: Candidate | null) => { setSurvivor(c); setPreview(null); setAcknowledged(false); setError(''); };
  const request = async (url: string, body: unknown) => {
    try { return await (await apiRequest('POST', `/api/leagues/${leagueId}/player-merge/${url}`, body)).json(); }
    catch (e: any) {
      // apiRequest includes the server message in its thrown error.
      setError(e?.message || 'Could not merge these profiles.');
      return null;
    }
  };
  return <>
    <Button type="button" variant="outline" onClick={() => setOpen(true)} data-testid="button-merge-player">Merge league roster entry</Button>
    <Dialog open={open} onOpenChange={value => { if (!value && !busy) reset(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Merge league player profiles</DialogTitle>
           <DialogDescription>Select two user accounts in this league by U ID to move league history from one to the other. This does not retire either login or merge account-wide data. Names and emails are search hints, not proof of identity.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
           <Picker leagueId={leagueId} label="Source user account · history to move" selected={source} onSelect={changeSource} />
           <Picker leagueId={leagueId} label="Survivor user account · keep history" selected={survivor} onSelect={changeSurvivor} />
        </div>
        {!preview && <Button disabled={!source || !survivor || busy || source.type === survivor.type && source.id === survivor.id}
          onClick={async () => {
            setBusy(true); setError('');
            const data = await request('preview', { source: { type: source!.type, id: source!.id }, survivor: { type: survivor!.type, id: survivor!.id } });
            if (data) setPreview(data);
            setBusy(false);
          }}>Review transfer</Button>}
        {preview && <>
          <div className="grid gap-4 sm:grid-cols-2">
            <IdentityDetail title="Move from" value={preview.source} />
            <IdentityDetail title="Keep account" value={preview.survivor} />
          </div>
          <p className="text-sm text-muted-foreground">The surviving account's login and profile remain unchanged. Only history in this league is transferred. Conflicting records stop the merge without saving changes.</p>
          <label className="flex items-start gap-2 text-sm">
            <Checkbox checked={acknowledged} onCheckedChange={v => setAcknowledged(v === true)} />
            I verified both exact IDs belong to the same person. I understand this league merge is irreversible and names alone do not establish identity.
          </label>
          <Button variant="destructive" disabled={!acknowledged || busy} onClick={async () => {
            setBusy(true); setError('');
            const result = await request('confirm', {
              source: { type: source!.type, id: source!.id }, survivorId: survivor!.id, acknowledgeIdentity: true,
            });
            setBusy(false);
            if (result) {
              await client.invalidateQueries({ queryKey: ['/api/leagues', leagueId] });
              await client.invalidateQueries({ queryKey: ['player-merge-candidates', leagueId] });
              toast({ title: 'Player profiles merged', description: 'League rosters and stats have been refreshed.' });
              reset();
            }
          }}>{busy ? 'Merging…' : 'Confirm irreversible merge'}</Button>
        </>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button variant="ghost" disabled={busy} onClick={reset}>Cancel</Button>
      </DialogContent>
    </Dialog>
  </>;
}