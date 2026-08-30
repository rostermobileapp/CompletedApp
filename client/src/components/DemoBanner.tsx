import { useState } from 'react';
import { useLocation } from 'wouter';
import { useDemo } from '@/context/DemoContext';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

export function DemoBanner() {
  const [, navigate] = useLocation();
  const { isActive, povUserId, users, setPovUser, sync, exit, error } = useDemo();
  const [confirmingSync, setConfirmingSync] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!isActive) return null;
  const displayName = (user: any) => `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.displayId || user.email || user.id;
  const changePov = async (id: string) => {
    setBusy(true);
    try { await setPovUser(id); navigate('/'); } finally { setBusy(false); }
  };
  const doSync = async () => {
    setBusy(true);
    try { await sync(); navigate('/'); } catch { /* Context renders the server error. */ }
    finally { setBusy(false); setConfirmingSync(false); }
  };
  return <>
    <section className="relative z-50 w-full bg-amber-400 text-black border-b-2 border-amber-600 px-3 py-2 flex flex-wrap items-center gap-2 shadow-md" data-testid="demo-banner">
      <strong className="tracking-widest text-sm" data-testid="demo-mode-label">DEMO</strong>
      <span className="text-xs font-medium">Viewing copied data as</span>
      <Select value={povUserId || undefined} onValueChange={changePov} disabled={busy}>
        <SelectTrigger className="h-8 min-w-[160px] max-w-[250px] bg-white text-black border-amber-700" data-testid="demo-pov-selector">
          <SelectValue placeholder="Select copied user" />
        </SelectTrigger>
        <SelectContent>{users.map((user) => <SelectItem key={user.id} value={user.id}>{displayName(user)}</SelectItem>)}</SelectContent>
      </Select>
      <div className="ml-auto flex gap-2">
        <Button size="sm" variant="destructive" onClick={() => setConfirmingSync(true)} disabled={busy} data-testid="button-sync-demo">Sync Demo</Button>
        <Button size="sm" variant="outline" className="border-black bg-white text-black" onClick={() => { void exit().then(() => navigate('/')); }} disabled={busy} data-testid="button-exit-demo">Exit Demo</Button>
      </div>
      {error && <p className="basis-full text-xs font-semibold text-red-900" role="alert" data-testid="demo-action-error">{error}</p>}
    </section>
    <AlertDialog open={confirmingSync} onOpenChange={setConfirmingSync}>
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>Reset Demo data?</AlertDialogTitle><AlertDialogDescription>This reseeds the Demo snapshot and discards changes made in Demo mode.</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={doSync} data-testid="button-confirm-sync-demo">Reset and Sync Demo</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>;
}