import { useEffect, useMemo, useState } from "react";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import {
  EmbeddedCheckoutProvider,
  EmbeddedCheckout,
} from "@stripe/react-stripe-js";
import { CheckCircle2 } from "lucide-react";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const PUBLISHABLE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string | undefined;

let stripePromise: Promise<Stripe | null> | null = null;
function getStripe() {
  if (!stripePromise) {
    if (!PUBLISHABLE_KEY) {
      console.error("[Stripe] VITE_STRIPE_PUBLISHABLE_KEY is not set");
      return Promise.resolve(null);
    }
    stripePromise = loadStripe(PUBLISHABLE_KEY);
  }
  return stripePromise;
}

interface StripeCheckoutModalProps {
  clientSecret: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPaymentComplete?: () => void;
  title?: string;
  refreshLabel?: string;
  successHeadline?: string;
  successMessage?: string;
}

export function StripeCheckoutModal({
  clientSecret,
  open,
  onOpenChange,
  onPaymentComplete,
  title = "Complete Your Payment",
  refreshLabel = "Refresh page",
  successHeadline = "Payment received",
  successMessage = "Refresh the page to see your updated tournament.",
}: StripeCheckoutModalProps) {
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    if (!open) {
      const t = setTimeout(() => setIsComplete(false), 200);
      return () => clearTimeout(t);
    }
  }, [open]);

  const options = useMemo(
    () => ({
      clientSecret: clientSecret ?? undefined,
      onComplete: () => {
        setIsComplete(true);
        try {
          onPaymentComplete?.();
        } catch (err) {
          console.error("[StripeCheckoutModal] onPaymentComplete handler threw:", err);
        }
      },
    }),
    [clientSecret, onPaymentComplete],
  );

  const stripe = getStripe();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl p-0 max-h-[92vh] overflow-hidden flex flex-col"
        data-testid="stripe-checkout-modal"
      >
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle>{isComplete ? successHeadline : title}</DialogTitle>
          <DialogDescription className="sr-only">
            {isComplete ? successMessage : "Secure payment powered by Stripe"}
          </DialogDescription>
        </DialogHeader>

        {isComplete ? (
          <div
            className="flex flex-col items-center justify-center text-center px-6 pb-8 pt-4 gap-4"
            data-testid="stripe-checkout-success"
          >
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
              <CheckCircle2 className="h-10 w-10 text-green-600 dark:text-green-400" />
            </div>
            <h2 className="text-2xl font-semibold">{successHeadline}</h2>
            <p className="text-muted-foreground max-w-sm">{successMessage}</p>
            <Button
              size="lg"
              className="mt-2 w-full sm:w-auto"
              onClick={() => window.location.reload()}
              data-testid="button-refresh-after-payment"
            >
              {refreshLabel}
            </Button>
          </div>
        ) : !PUBLISHABLE_KEY ? (
          <div className="px-6 pb-8 pt-2 text-sm text-destructive">
            Stripe is not configured (missing publishable key). Please contact support.
          </div>
        ) : !clientSecret ? (
          <div className="px-6 pb-8 pt-2 text-sm text-muted-foreground">
            Preparing secure checkout…
          </div>
        ) : (
          <div
            className="flex-1 overflow-y-auto px-2 pb-2"
            data-testid="stripe-embedded-checkout-container"
          >
            <EmbeddedCheckoutProvider stripe={stripe} options={options}>
              <EmbeddedCheckout />
            </EmbeddedCheckoutProvider>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
