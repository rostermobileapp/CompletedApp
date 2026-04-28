import { useEffect, useMemo, useRef, useState } from "react";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import {
  EmbeddedCheckoutProvider,
  EmbeddedCheckout,
} from "@stripe/react-stripe-js";
import { CheckCircle2, Loader2 } from "lucide-react";

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
  /**
   * Called once Stripe reports the payment is complete. May return a promise;
   * the modal awaits it before auto-closing so server-side confirmation has a
   * chance to finish first. Errors are caught and logged — the modal will still
   * close so the user isn't trapped in the success view.
   */
  onPaymentComplete?: () => void | Promise<void>;
  title?: string;
  successHeadline?: string;
  /**
   * Brief message shown while the modal is auto-closing after successful payment.
   * Defaults to a generic confirming message.
   */
  successMessage?: string;
  /**
   * How long to keep the success state visible after server confirmation
   * finishes before auto-closing the modal. Defaults to 1200ms.
   */
  autoCloseDelayMs?: number;
}

export function StripeCheckoutModal({
  clientSecret,
  open,
  onOpenChange,
  onPaymentComplete,
  title = "Complete Your Payment",
  successHeadline = "Payment received",
  successMessage = "Updating your tournament…",
  autoCloseDelayMs = 1200,
}: StripeCheckoutModalProps) {
  const [isComplete, setIsComplete] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);

  // Keep the latest handler/close fn in refs so `options` stays stable across
  // renders (re-creating it would re-mount Stripe's embedded checkout).
  const onPaymentCompleteRef = useRef(onPaymentComplete);
  const onOpenChangeRef = useRef(onOpenChange);
  const autoCloseDelayRef = useRef(autoCloseDelayMs);
  useEffect(() => { onPaymentCompleteRef.current = onPaymentComplete; }, [onPaymentComplete]);
  useEffect(() => { onOpenChangeRef.current = onOpenChange; }, [onOpenChange]);
  useEffect(() => { autoCloseDelayRef.current = autoCloseDelayMs; }, [autoCloseDelayMs]);

  // Tracks the pending auto-close timer so we can cancel it if the user closes
  // (or reopens) the modal manually before it fires. Without this, a stale
  // timer from a previous session could close a freshly reopened checkout.
  const autoCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearAutoCloseTimer = () => {
    if (autoCloseTimerRef.current !== null) {
      clearTimeout(autoCloseTimerRef.current);
      autoCloseTimerRef.current = null;
    }
  };

  useEffect(() => {
    if (!open) {
      // Cancel any pending auto-close so it can't fire against a future session.
      clearAutoCloseTimer();
      const t = setTimeout(() => {
        setIsComplete(false);
        setIsConfirming(false);
      }, 200);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Cancel any pending timer on unmount.
  useEffect(() => () => clearAutoCloseTimer(), []);

  const options = useMemo(
    () => ({
      clientSecret: clientSecret ?? undefined,
      onComplete: async () => {
        setIsComplete(true);
        setIsConfirming(true);
        try {
          await onPaymentCompleteRef.current?.();
        } catch (err) {
          console.error("[StripeCheckoutModal] onPaymentComplete handler threw:", err);
        } finally {
          setIsConfirming(false);
          // Brief pause so the user sees the success state, then auto-close.
          // Replace any prior timer so only the latest one can fire.
          clearAutoCloseTimer();
          autoCloseTimerRef.current = setTimeout(() => {
            autoCloseTimerRef.current = null;
            onOpenChangeRef.current?.(false);
          }, autoCloseDelayRef.current);
        }
      },
    }),
    [clientSecret],
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
            <p className="text-muted-foreground max-w-sm flex items-center gap-2 justify-center">
              {isConfirming && <Loader2 className="h-4 w-4 animate-spin" />}
              <span>{successMessage}</span>
            </p>
            {/* Fallback close button in case the auto-close timer doesn't fire
                (e.g. user kept the modal focused, browser throttled timers). */}
            <Button
              size="sm"
              variant="ghost"
              className="mt-2"
              onClick={() => onOpenChange(false)}
              data-testid="button-close-after-payment"
            >
              Close
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
