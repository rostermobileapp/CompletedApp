import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

type Source = { id: string; name: string; email: string };
type Candidate = { id: string; displayId: string | null; name: string; email: string | null };
type Preview = {
  source: Source & {
    teamName: string | null;
    attendance: number;
    draftPicks: number;
    keepers: number;
    lineAssignments: number;
  };
  survivor: Candidate & { teams: string[]; seasons: { name: string | null; games: number; goals: number; assists: number; penalties: number }[] };
};

export function LeaguePlaceholderMerge({ leagueId, source, onClose }: {
  leagueId: string;
  source: Source;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const [survivor, setSurvivor] = useState<Candidate | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const client = useQueryClient();
  const { toast } = useToast();
  const term = search.trim();
  const validTerm = term.length >= 2;
  const { data: candidates = [], isFetching, isError } = useQuery<Candidate[]>({
    queryKey: ['player-merge-candidates', leagueId, term],
    queryFn: async () => (await apiRequest('GET',
      `/api/leagues/${leagueId}/player-merge/candidates?search=${encodeURIComponent(term)}`)).json(),
    enabled: validTerm && !preview,
  });

  const loadPreview = async () => {
    if (!survivor) return;
    setBusy(true); setError('');
    try {
      const response = await apiRequest('POST', `/api/leagues/${leagueId}/player-merge/placeholder-preview`, {
        placeholderId: source.id, survivorId: survivor.id,
      });
      setPreview(await response.json());
    } catch (e) {
      setError((e as Error)?.message || 'Could not review this roster merge.');
    } finally {
      setBusy(false);
    }
  };

  const confirmMerge = async () => {
    if (!preview || !acknowledged) return;
    setBusy(true); setError('');
    try {
      await apiRequest('POST', `/api/leagues/${leagueId}/player-merge/placeholder-confirm`, {
        placeholderId: source.id, survivorId: preview.survivor.id, acknowledgeIdentity: true,
      });
      await client.invalidateQueries({ queryKey: ['/api/leagues', leagueId] });
      await client.invalidateQueries({ queryKey: ['player-merge-candidates', leagueId] });
      toast({ title: 'Roster entry merged', description: 'The registered account now holds the combined league roster history.' });
      onClose();
    } catch (e) {
      setError((e as Error)?.message || 'Could not merge this roster entry.');
    } finally {
      setBusy(false);
    }
  };

  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}>
    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Merge manually added player</DialogTitle>
        <DialogDescription>
          This moves the roster entry and its supported history into a registered account in this league. It does not close or combine logins.
        </DialogDescription>
      </DialogHeader>
      {!preview ? <>
        <section className="rounded border p-3 text-sm">
          <b>Roster entry being removed</b>
          <p>{source.name}<br />{source.email || 'No email or user ID'}</p>
        </section>
        <div className="space-y-2">
          <label className="text-sm font-semibold" htmlFor="placeholder-merge-survivor">Registered account that keeps this player’s history</label>
          <Input id="placeholder-merge-survivor" value={search} onChange={e => { setSearch(e.target.value); setSurvivor(null); }}
            placeholder="Search name, email or U ID" />
          {validTerm && !survivor && <div className="max-h-48 overflow-y-auto rounded border" role="listbox" aria-label="Registered accounts">
            {isFetching && <p className="p-2 text-sm">Searching…</p>}
            {isError && <p role="alert" className="p-2 text-sm text-destructive">Could not search registered accounts.</p>}
            {!isFetching && !isError && candidates.map(candidate => <button key={candidate.id} type="button"
              className="block w-full border-b p-2 text-left text-sm hover:bg-muted" onClick={() => setSurvivor(candidate)}>
              <b>{candidate.name}</b><br />
              <span className="text-muted-foreground">{candidate.displayId || 'U ID unavailable'} · {candidate.email || 'No email'}</span>
            </button>)}
            {!isFetching && !isError && candidates.length === 0 && <p className="p-2 text-sm">No registered accounts found in this league.</p>}
          </div>}
          {survivor && <div className="rounded border border-primary p-2 text-sm">
            <b>{survivor.name}</b><br />{survivor.displayId || 'U ID unavailable'} · {survivor.email || 'No email'}
            <button type="button" className="ml-2 underline" onClick={() => setSurvivor(null)}>Change</button>
          </div>}
        </div>
        <Button disabled={!survivor || busy} onClick={loadPreview}>{busy ? 'Preparing review…' : 'Review merge'}</Button>
      </> : <>
        <div className="grid gap-3 sm:grid-cols-2">
          <section className="rounded border p-3 text-sm">
            <h3 className="font-bold">Roster entry being removed</h3>
            <p>{preview.source.name}<br />{preview.source.email || 'No email or user ID'}<br />
              {preview.source.teamName ? `Team: ${preview.source.teamName}` : 'No assigned team'}</p>
            <p className="mt-2 text-muted-foreground">
              {preview.source.attendance} attendance records · {preview.source.draftPicks} draft picks · {preview.source.keepers} keeper records · {preview.source.lineAssignments} line assignments
            </p>
          </section>
          <section className="rounded border p-3 text-sm">
            <h3 className="font-bold">Registered account that stays</h3>
            <p>{preview.survivor.name}<br />{preview.survivor.displayId || 'U ID unavailable'}<br />{preview.survivor.email || 'No email'}</p>
            <p className="mt-2 text-muted-foreground">{preview.survivor.teams.join(', ') || 'No team assignment'}</p>
          </section>
        </div>
        <p className="rounded border border-primary/30 bg-primary/5 p-3 text-sm">
          The roster entry will be removed after supported league history, team assignment, draft entries, and eligible payment/invite links are transferred.
          Conflicting records stop the merge without saving changes.
        </p>
        <label className="flex items-start gap-2 text-sm">
          <Checkbox checked={acknowledged} onCheckedChange={value => setAcknowledged(value === true)} />
          I verified this manually added player and the registered account belong to the same person. I understand this league merge cannot be undone.
        </label>
        <div className="flex gap-2">
          <Button variant="destructive" disabled={!acknowledged || busy} onClick={confirmMerge}>
            {busy ? 'Merging…' : 'Confirm roster merge'}
          </Button>
          <Button variant="outline" disabled={busy} onClick={() => { setPreview(null); setAcknowledged(false); setError(''); }}>Change account</Button>
        </div>
      </>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button variant="ghost" disabled={busy} onClick={onClose}>Cancel</Button>
    </DialogContent>
  </Dialog>;
}
