import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

type Props = {
  eligible: boolean;
  ready: boolean;
  collectionEnabled: boolean;
  pending: boolean;
  onSetup: () => void;
  onManage: () => void;
};

export function OrganizerStripeSetupCard({
  eligible, ready, pending, onSetup, onManage,
}: Props) {
  if (!eligible) return null;

  return (
    <section className="mb-6 rounded-xl border border-[hsl(var(--hairline))] bg-card p-3 shadow-[var(--elev-rest)]" data-testid="card-organizer-card-setup">
      <div className="flex items-center justify-between gap-2">
        <h2 className="whitespace-nowrap text-sm font-semibold">{ready ? 'Stripe Confirmed' : 'Stripe setup'}</h2>
        <Button
          size="sm"
          className="shrink-0 whitespace-nowrap px-3 text-xs"
          onClick={ready ? onManage : onSetup}
          disabled={pending}
          data-testid={ready ? 'button-manage-stripe' : 'button-connect-stripe'}
        >
          {pending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
          {ready ? 'Manage Stripe' : 'Set up Stripe'}
        </Button>
      </div>
    </section>
  );
}
