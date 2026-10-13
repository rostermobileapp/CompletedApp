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
const userIdLabel = (user: Candidate) => user.displayId || `U ID unavailable · internal ID ${user.id}`;
const humanTier = (role?: string) => {
  const value = (role || 'unknown').trim().toLowerCase().replace(/[_-]+/g, ' ');
  if (value === 'free') return 'Free';
  if (value === 'paid' || value === 'pro' || value === 'premium') return 'Paid';
  return value.replace(/\b\w/g, character => character.toUpperCase());
};
type Count = { domain: string; count: number };
type MergePolicy = {
  kind: 'free_free' | 'keep_paid' | 'billing_duplicate' | 'verification_required';
  message: string;
  autoSelected: boolean;
};
type Preview = {
  source: Identity;
  survivor: Identity;
  policy: MergePolicy;
  leagues: { id: string; name: string; records: Count[] }[];
  other: Count[];
  combinable: { domain: string; count: number; label: string }[];
  blockers: { domain: string; reason: string; count: number; recordIds?: string[] }[];
  legacy: { id: string; league: string; name: string; kind: string; disposition: string }[];
  lookalikes: { id: string; league: string; name: string; kind: string }[];
  fingerprint: string;
};

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

function Counts({ rows }: { rows: Count[] }) {
  if (!rows.length) return <p className="text-sm text-muted-foreground">No records</p>;
  return <ul className="space-y-1 text-sm">{rows.map((row, i) =>
    <li key={`${row.domain}:${i}`} className="flex justify-between gap-3"><span>{row.domain}</span><b>{row.count}</b></li>)}</ul>;
}

export function AccountUserMerge({ survivorId, leagueId, onClose }: {
  survivorId?: string;
  leagueId?: string;
  onClose?: () => void;
} = {}) {
  const contextual = !!survivorId;
  const commissionerContext = !!leagueId;
  const [open, setOpen] = useState(contextual);
  const [source, setSource] = useState<Candidate | null>(null);
  const [survivor, setSurvivor] = useState<Candidate | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [sourceAck, setSourceAck] = useState('');
  const [survivorAck, setSurvivorAck] = useState('');
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
      setPreview(null); setSourceAck(''); setSurvivorAck(''); setIdentityAck(false);
    }
  }, [contextual, survivorId, verifiedSurvivor]);

  const reset = () => {
    setOpen(false); setSource(null); setSurvivor(null); setPreview(null);
    setSourceAck(''); setSurvivorAck(''); setIdentityAck(false); setError('');
    setBusy(false);
    onClose?.();
  };
  const changeSource = (value: Candidate | null) => { setSource(value); setPreview(null); setSourceAck(''); setSurvivorAck(''); setIdentityAck(false); setError(''); };
  const changeSurvivor = (value: Candidate | null) => { setSurvivor(value); setPreview(null); setSourceAck(''); setSurvivorAck(''); setIdentityAck(false); setError(''); };
  const request = async (action: 'preview' | 'confirm', body: Record<string, unknown>) => {
    return (await apiRequest('POST', `/api/account-user-merge/${action}`, {
      ...body,
      ...(leagueId ? { leagueId } : {}),
    })).json();
  };
  const clearAcknowledgements = () => {
    setSourceAck('');
    setSurvivorAck('');
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
          <DialogDescription>{commissionerContext
            ? 'Commissioner review: merge two registered sign-in accounts across the entire service and every league, not just this league. This is not a support-only action. Search results are registered accounts, never imported or placeholder roster entries.'
            : 'Support-only global operation: merge two registered sign-in accounts across the entire service and every league. Search results are registered accounts, not imported or placeholder roster entries.'} Search by name, email or U ID and independently verify both identities.</DialogDescription>
        </DialogHeader>
        {!preview && <>
          <div className="grid gap-4 sm:grid-cols-2">
              <UserPicker label="Source · account to retire" selected={source} onSelect={changeSource} enabled={open} leagueId={leagueId} />
             {contextual ? <section className="rounded border border-primary p-3 text-sm" data-testid="fixed-merge-survivor">
                <b>Preferred account to retain · subject to paid tier</b>
               {verifyingSurvivor ? <p>Verifying registered account…</p> :
                 survivorError || !survivor ? <p role="alert">Could not verify this registered survivor. Close and reopen this action.</p> :
                  <p>{survivor.name}<br /><strong>{userIdLabel(survivor)}</strong><br />{survivor.email || 'No email'}<br />
                    Account tier: {humanTier(survivor.role)}</p>}
             </section> :
                <UserPicker label="Preferred account to retain · subject to paid tier" selected={survivor} onSelect={changeSurvivor} enabled={open} leagueId={leagueId} />}
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
              { label: 'Source · will be retired', user: preview.source },
              { label: 'Survivor · login/profile retained', user: preview.survivor },
            ].map(({ label, user }) => {
              return <section key={user.id} className="min-w-0 rounded-lg border p-3 text-sm">
                <h3 className="font-bold">{label}</h3>
                <p className="mt-2">{user.name}<br /><span className="break-all font-semibold">{userIdLabel(user)}</span><br />
                  <span className="break-all">{user.email || 'No email'}</span><br />
                  Account tier: {humanTier(user.role)}</p>
              </section>;
            })}
          </div>
          <section className={`rounded-lg border p-3 text-sm space-y-1 ${
            preview.policy.kind === 'billing_duplicate' || preview.policy.kind === 'verification_required'
              ? 'border-destructive bg-destructive/10' : 'border-primary/40 bg-primary/5'
          }`} role={preview.policy.kind === 'billing_duplicate' || preview.policy.kind === 'verification_required' ? 'alert' : 'status'}>
            <h3 className="font-bold">
              {preview.policy.kind === 'billing_duplicate' ? 'Two paid accounts: billing duplication risk' :
                preview.policy.kind === 'verification_required' ? 'Paid-account verification required' :
                  'Account tier and login selection'}
            </h3>
            <p>{preview.policy.message}</p>
            {preview.policy.kind === 'billing_duplicate' &&
              <p className="font-semibold">Both accounts are paid. Do not proceed: merging could duplicate billing or entitlements. Confirmation is disabled.</p>}
            {preview.policy.kind === 'verification_required' &&
              <p className="font-semibold">Resolve the required billing or account verification before continuing. Confirmation is disabled.</p>}
            {preview.policy.kind === 'free_free' &&
              <p>For free/free accounts, the parent account's login and profile are retained.</p>}
            {preview.policy.autoSelected && <p>
              The server automatically selected the parent account to retain based on paid-tier rules. The returned source and survivor below are authoritative.
            </p>}
            {commissionerContext && <p className="font-semibold">
              This is a full-account merge across the entire service and all leagues; it is not limited to this league and does not require support staff.
            </p>}
          </section>
          <section className="rounded-lg border p-3 space-y-3">
            <h3 className="font-bold">Records to review by league</h3>
            {!preview.leagues.length && <p className="text-sm text-muted-foreground">No league records</p>}
            {preview.leagues.map(league => <div key={league.id} className="border-t pt-2">
              <h4 className="text-sm font-semibold">{league.name}</h4><Counts rows={league.records} />
            </div>)}
          </section>
          <section className="rounded-lg border p-3 space-y-2">
            <h3 className="font-bold">Other account-wide records</h3><Counts rows={preview.other} />
          </section>
          <section className="rounded-lg border p-3 space-y-2">
            <h3 className="font-bold">Explicitly linked imported records</h3>
            {preview.legacy.length ? <ul className="text-sm space-y-1">{preview.legacy.map(row =>
              <li key={row.id}>{row.kind} {row.id} · {row.name} · {row.league}: {row.disposition}</li>)}</ul> :
              <p className="text-sm">No explicitly linked imported records.</p>}
            <h3 className="font-bold">Separate roster lookalikes</h3>
            {preview.lookalikes.length ? <ul className="text-sm space-y-1">{preview.lookalikes.map(row =>
              <li key={`${row.kind}:${row.id}`}>{row.kind} {row.id} · {row.name} · {row.league}: not included; resolve separately after verifying identity.</li>)}</ul> :
              <p className="text-sm">No matching unlinked roster entries found for either account. Matching names or emails never establish linkage.</p>}
          </section>
          <section className="rounded-lg border p-3 space-y-2">
            <h3 className="font-bold">Equivalent records to combine</h3>
            {preview.combinable.length ? <ul className="space-y-1 text-sm">
              {preview.combinable.map(item => <li key={item.domain}>{item.label} · {item.count} ({item.domain})</li>)}
            </ul> : <p className="text-sm text-muted-foreground">No overlapping records will be combined.</p>}
          </section>
          <section className="rounded-lg border border-destructive/50 p-3 space-y-2">
            <h3 className="font-bold text-destructive">Blockers · {preview.blockers.length}</h3>
            {preview.blockers.length ? <ul className="space-y-2 text-sm">{preview.blockers.map((item, i) =>
              <li key={`${item.domain}:${i}`}><b>{item.domain}</b> · {item.count} record(s): {item.reason}
                {item.recordIds?.length ? <span className="block mt-1 break-all text-muted-foreground">Record IDs: {item.recordIds.join(', ')}</span> : null}
              </li>)}</ul> :
              <p className="text-sm">No blockers reported by preflight.</p>}
          </section>
          <div className="rounded-lg border border-amber-500/50 bg-amber-500/5 p-3 text-sm space-y-1">
            <h3 className="font-bold">Account and billing consequences</h3>
            <p>The source account will be retired and its login cannot be used again. The server-selected survivor’s login and profile remain authoritative. The original source ID, displayed U ID, email, operator and review fingerprint remain in an internal audit record; transferred authored content appears under the survivor.</p>
            <p>The selected survivor is only the preferred account to retain; the server may reorient the merge to preserve a paid account.</p>
            <p>Invitations and reminders are not resent, and badges are not replayed.</p>
            <p>Billing identities, subscriptions, purchases, paid seats, and entitlements must not be assumed transferable or duplicated. Resolve billing ownership explicitly; any unresolved conflict blocks this merge.</p>
            <p className="break-all text-xs text-muted-foreground">Preview fingerprint: {preview.fingerprint}</p>
          </div>
          {(!preview.source.displayId || !preview.survivor.displayId) && <p role="alert" className="text-sm text-destructive">
            A required displayed U ID is missing. This account merge cannot be confirmed until both accounts have displayed U IDs.
          </p>}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm">Type source U ID exactly: <b className="break-all">{preview.source.displayId || 'Unavailable'}</b>
              <Input value={sourceAck} onChange={e => setSourceAck(e.target.value)} autoComplete="off" disabled={!preview.source.displayId} />
            </label>
            <label className="space-y-1 text-sm">Type survivor U ID exactly: <b className="break-all">{preview.survivor.displayId || 'Unavailable'}</b>
              <Input value={survivorAck} onChange={e => setSurvivorAck(e.target.value)} autoComplete="off" disabled={!preview.survivor.displayId} />
            </label>
          </div>
          <label className="flex items-start gap-2 text-sm">
            <Checkbox checked={identityAck} onCheckedChange={value => setIdentityAck(value === true)} />
            I verified the exact IDs and emails above belong to the same person, independently of names or shared email, and understand the source login is permanently retired and the account-wide merge is irreversible.
          </label>
          <div className="flex flex-wrap gap-2">
            <Button variant="destructive" disabled={busy || preview.blockers.length > 0 ||
              preview.policy.kind === 'billing_duplicate' || preview.policy.kind === 'verification_required' ||
              !preview.source.displayId || !preview.survivor.displayId ||
              sourceAck !== preview.source.displayId || survivorAck !== preview.survivor.displayId || !identityAck}
              onClick={async () => {
                setBusy(true); setError('');
                try {
                  await request('confirm', {
                    sourceId: preview.source.id, survivorId: preview.survivor.id,
                    previewFingerprint: preview.fingerprint,
                    acknowledgeSourceId: sourceAck, acknowledgeSurvivorId: survivorAck, acknowledgeIdentity: true,
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
              }}>{busy ? 'Merging…' : 'Confirm irreversible account merge'}</Button>
             <Button variant="outline" disabled={busy} onClick={() => refreshPreview()}>
               {busy ? 'Refreshing…' : 'Refresh review'}
             </Button>
             <Button variant="outline" disabled={busy} onClick={() => { setPreview(null); setSourceAck(''); setSurvivorAck(''); setIdentityAck(false); setError(''); }}>{contextual ? 'Change source' : 'Change accounts'}</Button>
          </div>
        </>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button variant="ghost" disabled={busy} onClick={reset}>Cancel</Button>
      </DialogContent>
    </Dialog>
  </>;
}