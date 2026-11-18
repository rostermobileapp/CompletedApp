import { ChevronDown, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

type Props = {
  eligible: boolean;
  ready: boolean;
  collectionEnabled: boolean;
  pending: boolean;
  onSetup: () => void;
  onManage: () => void;
  connected?: boolean;
  unlinkPending?: boolean;
  onUnlink?: () => void;
};

export function OrganizerStripeSetupCard({
  eligible, ready, pending, onSetup, onManage, connected, unlinkPending, onUnlink,
}: Props) {
  if (!eligible) return null;

  return (
    <section className="mb-6 rounded-xl border border-[hsl(var(--hairline))] bg-card p-3 shadow-[var(--elev-rest)]" data-testid="card-organizer-card-setup">
      <div className="flex items-center justify-between gap-2">
        <h2 className="whitespace-nowrap text-sm font-semibold">{ready ? 'Stripe Confirmed' : 'Stripe setup'}</h2>
        {connected && onUnlink ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" className="shrink-0 whitespace-nowrap px-3 text-xs" disabled={pending}
                data-testid={ready ? 'button-manage-stripe' : 'button-connect-stripe'}>
                {pending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                {ready ? 'Manage Stripe' : 'Set up Stripe'}
                <ChevronDown className="ml-1 h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={ready ? onManage : onSetup} disabled={unlinkPending}
                data-testid="menu-open-stripe">
                {ready ? 'Manage Stripe' : 'Continue setup'}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onUnlink} className="text-red-400 focus:text-red-300"
                data-testid="menu-unlink-stripe">
                {unlinkPending ? 'Retry unlink' : 'Unlink Stripe'}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : <Button
          size="sm"
          className="shrink-0 whitespace-nowrap px-3 text-xs"
          onClick={ready ? onManage : onSetup}
          disabled={pending}
          data-testid={ready ? 'button-manage-stripe' : 'button-connect-stripe'}
        >
          {pending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
          {ready ? 'Manage Stripe' : 'Set up Stripe'}
        </Button>}
      </div>
    </section>
  );
}

export function OrganizerStripeUnlinkDialog({ open, pending, onOpenChange, onConfirm }: {
  open: boolean;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={value => { if (!pending) onOpenChange(value); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Unlink Stripe?</AlertDialogTitle>
          <AlertDialogDescription>
            This removes RosterHockey&apos;s access and turns off card collection on your existing invoices and scrimmages.
            Your Stripe account, money, and payment history are not deleted. Manage past payments and any future refunds
            or disputes directly in Stripe. You can set up a Stripe connection again later.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            data-testid="button-confirm-unlink-stripe"
            onClick={event => { event.preventDefault(); onConfirm(); }}>
            {pending ? 'Unlinking…' : 'Unlink Stripe'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
