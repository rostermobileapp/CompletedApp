import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

type Candidate = { id: string; displayId: string | null; name: string; email: string | null; role?: string };
type Identity = Candidate & { role: string };
const userIdLabel = (user: Candidate) => user.displayId || 'U ID unavailable';
type MergePolicy = {
  kind: 'free_free' | 'keep_paid' | 'billing_duplicate' | 'verification_required';
  message: string;
  autoSelected: boolean;
};
type Preview = {
  source: Identity;
  survivor: Identity;
  policy: MergePolicy;
  leagues: { id: string; name: string; records?: unknown[] }[];
  blockers: { domain: string; reason: string; count: number; recordIds?: string[] }[];
  fingerprint: string;
};

function humanBlocker(item: Preview['blockers'][number]) {
  const text = `${item.domain} ${item.reason}`.toLowerCase();
  if (/poll|vote/.test(text)) return 'The accounts have different poll answers. Resolve their responses before merging.';
  if (/notification_preferences/.test(text)) return 'The accounts have different notification settings or device links. Resolve these before merging.';
  if (/player_stats|game_attendance|game_rsvps|game_goalies/.test(text))
    return 'The accounts have conflicting game records. Review those games before merging.';
  if (/billing|subscription|purchase|entitlement/.test(text)) {
    return 'There is a billing or subscription conflict that must be resolved before these accounts can be merged.';
  }
  if (/badge|patch|progress/.test(text)) {
    return 'Some earned patches or progress cannot be safely combined yet. Please resolve this before continuing.';
  }
  if (/email|identity|account/.test(text)) {
    return 'An account identity conflict needs to be resolved before continuing.';
  }
  if (/league|team|roster/.test(text)) {
    return 'A league or roster conflict needs to be resolved before continuing.';
  }
  if (/duplicate|already exists|unique/.test(text)) {
    return 'Some information is already linked elsewhere. Resolve that conflict before continuing.';
  }
  if (/missing|orphan|reference|relation|constraint/.test(text)) {
    return 'Some linked account information is missing or inconsistent. Resolve it before continuing.';
  }
  return 'Some account information cannot be safely combined yet. Please resolve this before continuing.';
}

function UserPicker({ label, selected, onSelect, enabled, leagueId }: {
  label: string;
  selected: Candidate | null;
  onSelect: (candidate: Candidate | null) => void;
  enabled: boolean;
  leagueId?: string;
}) {
  const [search, setSearch] = useState('');
  const term = search.trim();
  const validTerm = term.length >= 2;
  const { data = [], isFetching, isError, error } = useQuery<Candidate[]>({
    queryKey: ['account-user-merge-candidates', leagueId ?? null, term],
    queryFn: async () => (await apiRequest('GET',
      `/api/account-user-merge/candidates?search=${encodeURIComponent(term)}${leagueId ? `&leagueId=${encodeURIComponent(leagueId)}` : ''}`)).json(),
    enabled: enabled && validTerm,
  });

  return <div className="min-w-0 space-y-2">
    <label className="text-sm font-semibold">{label}</label>
    {selected ? <div className="rounded border border-primary p-2 text-sm">
      <b>{selected.name}</b><br />
      <span className="break-all">{userIdLabel(selected)} · {selected.email || 'No email'}</span>
      <button type="button" className="ml-2 underline" onClick={() => onSelect(null)}>Change</button>
    </div> : <>
       <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, email or U ID" aria-label={label} />
      <div className="max-h-48 overflow-y-auto rounded border" role="listbox" aria-label={label}>
        {isFetching && <p className="p-2 text-sm">Searching…</p>}
        {isError && <p role="alert" className="p-2 text-sm text-destructive">{(error as Error)?.message || 'Could not search accounts.'}</p>}
        {!validTerm && <p className="p-2 text-sm">Enter at least two characters or an exact U ID.</p>}
        {validTerm && data.map(candidate => <button type="button" key={candidate.id} onClick={() => onSelect(candidate)}
          className="block w-full border-b p-2 text-left text-sm hover:bg-muted">
          <b>{candidate.name}</b><br />
          <span className="break-all text-muted-foreground">{userIdLabel(candidate)} · {candidate.email || 'No email'}</span>
        </button>)}
        {validTerm && !isFetching && !isError && data.length === 0 && <p className="p-2 text-sm">No matching registered accounts</p>}
      </div>
    </>}
  </div>;
}

export function AccountUserMerge({ survivorId, leagueId, onClose }: {
  survivorId?: string;
  leagueId?: string;
  onClose?: () => void;
} = {}) {
  const contextual = !!survivorId;
  const [open, setOpen] = useState(contextual);
  const [source, setSource] = useState<Candidate | null>(null);
  const [survivor, setSurvivor] = useState<Candidate | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [identityAck, setIdentityAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const client = useQueryClient();
  const { toast } = useToast();
  const { user: authUser } = useAuth();
  const { data: verifiedSurvivor, isFetching: verifyingSurvivor, isError: survivorError } = useQuery<Candidate | null>({
    queryKey: ['account-user-merge-survivor', leagueId ?? null, survivorId],
    queryFn: async () => {
      const candidates: Candidate[] = await (await apiRequest('GET',
        `/api/account-user-merge/candidates?search=${encodeURIComponent(survivorId!)}${leagueId ? `&leagueId=${encodeURIComponent(leagueId)}` : ''}`)).json();
      return candidates.find(candidate => candidate.id === survivorId) || null;
    },
    enabled: contextual && open,
  });
  useEffect(() => {
    if (contextual) {
      setSurvivor(verifiedSurvivor || null);
      setPreview(null); setIdentityAck(false);
    }
  }, [contextual, survivorId, verifiedSurvivor]);

  const reset = () => {
    setOpen(false); setSource(null); setSurvivor(null); setPreview(null);
    setIdentityAck(false); setError('');
    setBusy(false);
    onClose?.();
  };
  const changeSource = (value: Candidate | null) => { setSource(value); setPreview(null); setIdentityAck(false); setError(''); };
  const changeSurvivor = (value: Candidate | null) => { setSurvivor(value); setPreview(null); setIdentityAck(false); setError(''); };
  const request = async (action: 'preview' | 'confirm', body: Record<string, unknown>) => {
    return (await apiRequest('POST', `/api/account-user-merge/${action}`, {
      ...body,
      ...(leagueId ? { leagueId } : {}),
    })).json();
  };
  const clearAcknowledgements = () => {
    setIdentityAck(false);
  };
  const refreshPreview = async (preserveError = false) => {
    if (!preview) return;
    const reviewedIds = { sourceId: preview.source.id, survivorId: preview.survivor.id };
    setBusy(true);
    if (!preserveError) setError('');
    try {
      const refreshed = await request('preview', reviewedIds) as Preview;
      setPreview(refreshed);
      clearAcknowledgements();
    } catch (e) {
      const refreshError = (e as Error)?.message || 'Could not refresh the account merge review.';
      setError(previous => preserveError && previous ? `${previous} Review refresh also failed: ${refreshError}` : refreshError);
    } finally {
      setBusy(false);
    }
  };

  return <>
    {!contextual && <Button type="button" variant="outline" onClick={() => setOpen(true)} data-testid="button-account-user-merge">
      Account-wide user merge
    </Button>}
    <Dialog open={open} onOpenChange={value => { if (!value && !busy) reset(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Account-wide user merge</DialogTitle>
          <DialogDescription>Combine two registered accounts across all leagues. Check both identities carefully before continuing.</DialogDescription>
        </DialogHeader>
        {!preview && <>
          <div className="grid gap-4 sm:grid-cols-2">
              <UserPicker label="Account that will close" selected={source} onSelect={changeSource} enabled={open} leagueId={leagueId} />
             {contextual ? <section className="rounded border border-primary p-3 text-sm" data-testid="fixed-merge-survivor">
                 <b>Account that stays</b>
               {verifyingSurvivor ? <p>Verifying registered account…</p> :
                 survivorError || !survivor ? <p role="alert">Could not verify this registered survivor. Close and reopen this action.</p> :
                   <p>{survivor.name}<br /><strong>{userIdLabel(survivor)}</strong><br />{survivor.email || 'No email'}</p>}
             </section> :
                 <UserPicker label="Account that stays" selected={survivor} onSelect={changeSurvivor} enabled={open} leagueId={leagueId} />}
          </div>
          <Button disabled={!source || !survivor || source.id === survivor.id || busy} onClick={async () => {
            setBusy(true); setError('');
            try {
              const data = await request('preview', { sourceId: source!.id, survivorId: survivor!.id }) as Preview;
              setPreview(data); clearAcknowledgements();
            } catch (e) {
              setError((e as Error)?.message || 'Could not preview account merge.');
            }
            setBusy(false);
          }}>{busy ? 'Preparing review…' : 'Review account-wide changes'}</Button>
        </>}
        {preview && <>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              { label: 'This account will close', user: preview.source },
              { label: 'This login stays', user: preview.survivor },
            ].map(({ label, user }) => {
              return <section key={user.id} className="min-w-0 rounded-lg border p-3 text-sm">
                <h3 className="font-bold">{label}</h3>
                <p className="mt-2">{user.name}<br /><span className="break-all font-semibold">{userIdLabel(user)}</span><br />
                  <span className="break-all">{user.email || 'No email'}</span><br />
                  </p>
              </section>;
            })}
          </div>
          {(preview.policy.kind !== 'free_free' || preview.policy.autoSelected) && <section className={`rounded-lg border p-3 text-sm space-y-1 ${
            preview.policy.kind === 'billing_duplicate' || preview.policy.kind === 'verification_required'
              ? 'border-destructive bg-destructive/10' : 'border-primary/40 bg-primary/5'
          }`} role={preview.policy.kind === 'billing_duplicate' || preview.policy.kind === 'verification_required' ? 'alert' : 'status'}>
            <h3 className="font-bold">
              {preview.policy.kind === 'billing_duplicate' ? 'Billing needs attention' :
                preview.policy.kind === 'verification_required' ? 'Account verification needed' : 'Account selection'}
            </h3>
            {preview.policy.kind === 'billing_duplicate' &&
              <p>These accounts have a billing conflict. Resolve it before merging; confirmation is unavailable.</p>}
            {preview.policy.kind === 'verification_required' &&
              <p>Verify the account or billing details before merging; confirmation is unavailable.</p>}
            {preview.policy.autoSelected && <p>
              We selected the account that stays to preserve its paid benefits. The identities above show the final selection.
            </p>}
            {preview.policy.kind === 'keep_paid' && !preview.policy.autoSelected &&
              <p>The account that stays keeps its paid membership.</p>}
          </section>}
          <section className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-2">
            <h3 className="font-bold">Your hockey history stays together</h3>
            <p className="text-sm">Stats and earned patches from these two accounts will be combined across all leagues.</p>
            {!!preview.leagues.length && <p className="text-sm text-muted-foreground">
              Leagues included: {preview.leagues.map(league => league.name).filter(Boolean).join(', ')}
            </p>}
          </section>
          <section className={`rounded-lg border p-3 space-y-2 ${
            preview.blockers.length ? 'border-destructive/50 bg-destructive/5' : 'border-primary/30 bg-primary/5'
          }`}>
            <h3 className={`font-bold ${preview.blockers.length ? 'text-destructive' : ''}`}>
              {preview.blockers.length ? 'This merge can’t continue yet' : 'Ready to continue'}
            </h3>
            {preview.blockers.length ? <ul className="space-y-2 text-sm">{preview.blockers.map((item, i) =>
              <li key={`${item.domain}:${i}`}>{humanBlocker(item)}</li>)}</ul> :
              <p className="text-sm">The account checks are complete. Your original login will close permanently, and this merge can’t be undone.</p>}
          </section>
          {(!preview.source.displayId || !preview.survivor.displayId) && <p role="alert" className="text-sm text-destructive">
            A U ID is unavailable for one of these accounts, so we can’t verify both identities for confirmation.
          </p>}
          <label className="flex items-start gap-2 text-sm">
            <Checkbox checked={identityAck} onCheckedChange={value => setIdentityAck(value === true)} />
            <span>I confirm these displayed U IDs belong to the same person and consent to merging them permanently. I understand the original login will close and the merge cannot be undone.</span>
          </label>
          <div className="flex flex-wrap gap-2">
            <Button variant="destructive" disabled={busy || preview.blockers.length > 0 ||
              preview.policy.kind === 'billing_duplicate' || preview.policy.kind === 'verification_required' ||
              !preview.source.displayId || !preview.survivor.displayId ||
              !identityAck}
              onClick={async () => {
                setBusy(true); setError('');
                try {
                  await request('confirm', {
                    sourceId: preview.source.id, survivorId: preview.survivor.id,
                    previewFingerprint: preview.fingerprint,
                    acknowledgeSourceId: preview.source.displayId, acknowledgeSurvivorId: preview.survivor.displayId, acknowledgeIdentity: true,
                  });
                  await client.invalidateQueries();
                  toast({ title: 'Account-wide merge completed', description: 'Account data has been refreshed.' });
                  const sourceWasCurrentUser = authUser?.id === preview.source.id;
                  reset();
                  if (sourceWasCurrentUser) await supabase.auth.signOut();
                } catch (e) {
                  const confirmError = (e as Error)?.message || 'Could not confirm account merge.';
                  setError(confirmError);
                  setBusy(false);
                  await refreshPreview(true);
                }
              }}>{busy ? 'Merging…' : 'Merge accounts permanently'}</Button>
             <Button variant="outline" disabled={busy} onClick={() => refreshPreview()}>
               {busy ? 'Refreshing…' : 'Refresh review'}
             </Button>
              <Button variant="outline" disabled={busy} onClick={() => { setPreview(null); setIdentityAck(false); setError(''); }}>{contextual ? 'Change source' : 'Change accounts'}</Button>
          </div>
        </>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button variant="ghost" disabled={busy} onClick={reset}>Cancel</Button>
      </DialogContent>
    </Dialog>
  </>;
}