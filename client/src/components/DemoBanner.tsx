import { useState } from 'react';
import { useLocation } from 'wouter';
import { useDemo } from '@/context/DemoContext';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Users } from 'lucide-react';

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
    <section className="relative z-50 w-full bg-background px-6 mt-[4px] mb-[8px]" data-testid="demo-banner">
      <div className="flex items-center justify-between mb-1 px-1">
        <span className="text-[10px] font-bold tracking-[0.18em] text-amber-600 dark:text-amber-400" data-testid="demo-mode-label">DEMO</span>
        <span className="text-[11px] text-muted-foreground">Copied player view</span>
      </div>
      <Select value={povUserId || undefined} onValueChange={changePov} disabled={busy}>
        <SelectTrigger
          className="w-full hairline elev-rest rounded-lg p-3 flex items-center justify-between hover:bg-muted/50 transition-colors bg-[#e2e2e2] dark:bg-[#212121] h-auto min-h-[40px] pt-[8px] pb-[8px] pl-[4px] pr-[4px]"
          data-testid="demo-pov-selector"
        >
          <span className="flex items-center gap-2 min-w-0">
            <Users className="w-4 h-4 text-primary flex-shrink-0" />
            <span className="font-medium pl-[8px] pr-[8px] text-[12px] truncate">
              {users.find((user) => user.id === povUserId) ? displayName(users.find((user) => user.id === povUserId)) : 'Select copied user'}
            </span>
          </span>
          <span className="text-xs mr-1 text-[#3c83f6] font-bold shrink-0">Select</span>
        </SelectTrigger>
        <SelectContent>
          {users.map((user) => <SelectItem key={user.id} value={user.id}>{displayName(user)}</SelectItem>)}
        </SelectContent>
      </Select>
      <div className="flex justify-end gap-2 mt-2">
        <Button size="sm" variant="destructive" className="h-8 px-3 text-xs" onClick={() => setConfirmingSync(true)} disabled={busy} data-testid="button-sync-demo">Sync Demo</Button>
        <Button size="sm" variant="outline" className="h-8 px-3 text-xs" onClick={() => { void exit().then(() => navigate('/')); }} disabled={busy} data-testid="button-exit-demo">Exit Demo</Button>
      </div>
      {error && <p className="mt-1 text-xs font-semibold text-red-900 dark:text-red-300" role="alert" data-testid="demo-action-error">{error}</p>}
    </section>
    <AlertDialog open={confirmingSync} onOpenChange={setConfirmingSync}>
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>Reset Demo data?</AlertDialogTitle><AlertDialogDescription>This reseeds the Demo snapshot and discards changes made in Demo mode.</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={doSync} data-testid="button-confirm-sync-demo">Reset and Sync Demo</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>;
}