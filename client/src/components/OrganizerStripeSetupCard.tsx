import { CheckCircle2, CreditCard, ExternalLink, Loader2 } from 'lucide-react';
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
  eligible, ready, collectionEnabled, pending, onSetup, onManage,
}: Props) {
  if (!eligible) return null;

  return (
    <section className="mb-6 rounded-xl border border-[hsl(var(--hairline))] bg-card p-4 shadow-[var(--elev-rest)]" data-testid="card-organizer-card-setup">
      <div className="flex flex-wrap items-start gap-3">
        <div className="mt-0.5 rounded-lg bg-primary/10 p-2 text-primary">
          {ready ? <CheckCircle2 className="h-5 w-5" /> : <CreditCard className="h-5 w-5" />}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">Card payment setup</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {ready
              ? 'Your Stripe account is set up. Manage your bank account, business details, and other Stripe information.'
              : 'Set up your Stripe account to receive one-time payments for invoices and scrimmages. If you already started, continue setup to finish verification.'}
            {!collectionEnabled && ' Card collection is not enabled yet.'}
          </p>
        </div>
        <Button
          size="sm"
          onClick={ready ? onManage : onSetup}
          disabled={pending}
          data-testid={ready ? 'button-manage-stripe' : 'button-connect-stripe'}
        >
          {pending
            ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            : <ExternalLink className="mr-2 h-4 w-4" />}
          {ready ? 'Manage Stripe info' : 'Set up Stripe'}
        </Button>
      </div>
    </section>
  );
}
