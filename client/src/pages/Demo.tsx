import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { useDemo } from '@/context/DemoContext';
import { Button } from '@/components/ui/button';

export default function Demo() {
  const [, navigate] = useLocation();
  const { status, isLoading, error, statusErrorCode, enter, sync, refresh, isActive, isAuthorized } = useDemo();
  const [busy, setBusy] = useState(false);
  const noSnapshot = status && (
    status.hasSnapshot === false ||
    status.snapshotExists === false ||
    status.snapshot === null ||
    status.demoLeagueId === null
  );
  useEffect(() => { if (isActive) navigate('/'); }, [isActive, navigate]);
  if (isLoading) return <div className="min-h-screen grid place-items-center" data-testid="demo-loading">Loading Demo mode…</div>;
  if (!isAuthorized) {
    const accessDenied = statusErrorCode === 403;
    return <main className="min-h-screen grid place-items-center p-6">
      <div className="max-w-md text-center space-y-4">
        <h1 className="text-2xl font-bold">{accessDenied ? 'Demo access denied' : 'Demo temporarily unavailable'}</h1>
        <p role="alert">{error || (accessDenied ? 'Only U00001 can use Demo mode.' : 'Demo could not be loaded. Please try again.')}</p>
        {!accessDenied && <Button onClick={() => void refresh()}>Try again</Button>}
        <Button variant={accessDenied ? 'default' : 'outline'} onClick={() => navigate('/')}>Return to dashboard</Button>
      </div>
    </main>;
  }
  const start = async () => {
    setBusy(true);
    try {
      // sync() returns fresh copied IDs; enter() independently validates and
      // re-fetches them, so neither branch can submit an old copied user ID.
      const syncResult = noSnapshot ? await sync() : null;
      await enter(syncResult?.povUserId);
      navigate('/');
    } catch {
      // DemoContext preserves the server message for the visible error state.
    } finally {
      setBusy(false);
    }
  };
  return <main className="min-h-screen grid place-items-center p-6" data-testid="demo-page"><div className="max-w-lg w-full rounded-lg border bg-card p-6 space-y-4"><h1 className="text-2xl font-bold">Demo mode</h1><p>Explore the normal app using copied user data. Demo actions never affect live accounts.</p>{noSnapshot && <p className="rounded bg-amber-100 p-3 text-amber-950">No Demo snapshot exists. Sync now to create one before entering.</p>}{error && <p className="text-destructive" role="alert">{error}</p>}<Button className="w-full" onClick={start} disabled={busy} data-testid="button-enter-demo">{noSnapshot ? 'Sync and enter Demo' : 'Enter Demo'}</Button><Button variant="outline" className="w-full" onClick={() => navigate('/')}>Cancel</Button></div></main>;
}