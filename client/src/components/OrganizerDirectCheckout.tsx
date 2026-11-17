import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { AddressElement, Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { AlertCircle, CheckCircle2, CreditCard, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiRequest } from "@/lib/queryClient";

const PUBLISHABLE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string | undefined;
type ContextResponse = {
  stripeAccountId: string;
  baseAmountCents: number;
  currency: "usd";
  resume?: { paymentId: string; clientSecret: string | null; quoteId?: string; status: string; totalAmountCents: number };
};
type QuoteResponse = {
  paymentId: string;
  quoteId: string;
  baseAmountCents: number;
  processingSurchargeCents: number;
  totalAmountCents: number;
  expiresAt: string;
  feeExplanation: string;
};
type BillingAddress = {
  name?: string;
  email?: string;
  phone?: string;
  address?: { line1?: string; line2?: string; city?: string; state?: string; postal_code?: string; country?: string };
};

const money = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

interface OrganizerDirectCheckoutProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  paymentRequestId: string;
  scopeKey: string;
  onRefresh: () => void | Promise<void>;
  onSubmitted?: () => void;
}

export function OrganizerDirectCheckout(props: OrganizerDirectCheckoutProps) {
  const { open, onOpenChange, paymentRequestId, scopeKey, onRefresh, onSubmitted } = props;
  const [context, setContext] = useState<ContextResponse | null>(null);
  const [loadError, setLoadError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const onRefreshRef = useRef(onRefresh);
  const onSubmittedRef = useRef(onSubmitted);
  onRefreshRef.current = onRefresh;
  onSubmittedRef.current = onSubmitted;
  const identity = `${scopeKey}:${paymentRequestId}`;
  const generation = useRef(0);

  useEffect(() => {
    if (!open) return;
    const current = ++generation.current;
    setContext(null);
    setLoadError("");
    apiRequest("POST", "/api/organizer-card-payments/direct/context", { paymentRequestId })
      .then((response) => response.json())
      .then((data: ContextResponse) => {
        if (generation.current === current) setContext(data);
      })
      .catch((error: any) => {
        if (generation.current === current) setLoadError(error?.message || "Could not prepare secure checkout. Try again.");
      });
    return () => { generation.current += 1; };
  }, [open, identity, paymentRequestId, attempt]);

  const close = (next: boolean) => {
    if (!next) generation.current += 1;
    onOpenChange(next);
  };

  const stripePromise = useMemo(() => {
    if (!PUBLISHABLE_KEY || !context?.stripeAccountId) return null;
    return loadStripe(PUBLISHABLE_KEY, { stripeAccount: context.stripeAccountId });
  }, [context?.stripeAccountId]);

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[92dvh] max-w-xl overflow-y-auto" data-testid="organizer-direct-checkout">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary"><CreditCard className="h-5 w-5" /></span>
            Pay the organizer by card
          </DialogTitle>
          <DialogDescription>Secure card payment for this game invoice. No subscription is created.</DialogDescription>
        </DialogHeader>
        {!open ? null : !PUBLISHABLE_KEY ? (
          <Notice tone="error">Secure card payments are unavailable right now. Please contact the organizer.</Notice>
        ) : loadError ? (
          <div className="space-y-4"><Notice tone="error">{loadError}</Notice><Button variant="outline" onClick={() => { setLoadError(""); setContext(null); setAttempt((v) => v + 1); }}>Try again</Button></div>
        ) : !context ? (
          <div className="space-y-4 py-4" aria-live="polite">
            <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
            <div className="h-24 animate-pulse rounded-xl bg-muted" />
            <p className="text-sm text-muted-foreground">Preparing your secure payment…</p>
          </div>
        ) : context.resume ? (
          stripePromise ? <Elements
            key={`${identity}:${context.stripeAccountId}:${context.resume.paymentId}:${attempt}`}
            stripe={stripePromise}
            options={{ mode: "payment", amount: context.baseAmountCents, currency: context.currency, paymentMethodTypes: ["card"] }}
          >
            <ResumePayment
              resume={context.resume}
              onCancel={() => close(false)}
              onPending={async () => { onSubmittedRef.current?.(); await onRefreshRef.current(); }}
            />
          </Elements> : <Notice tone="error">Stripe could not be initialized. Please close and try again.</Notice>
        ) : stripePromise ? (
          <Elements
            key={`${identity}:${context.stripeAccountId}:${context.baseAmountCents}:${attempt}`}
            stripe={stripePromise}
            options={{
              mode: "payment",
              amount: context.baseAmountCents,
              currency: context.currency,
              paymentMethodTypes: ["card"],
              appearance: { theme: "stripe", variables: { colorPrimary: "hsl(211, 58%, 34%)", borderRadius: "10px" } },
            }}
          >
            <DirectPaymentForm
              paymentRequestId={paymentRequestId}
              baseAmountCents={context.baseAmountCents}
              onCancel={() => close(false)}
              onPending={async () => { onSubmittedRef.current?.(); await onRefreshRef.current(); }}
            />
          </Elements>
        ) : <Notice tone="error">Stripe could not be initialized. Please close and try again.</Notice>}
      </DialogContent>
    </Dialog>
  );
}

function DirectPaymentForm({ paymentRequestId, baseAmountCents, onCancel, onPending }: {
  paymentRequestId: string;
  baseAmountCents: number;
  onCancel: () => void;
  onPending: () => Promise<void>;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [address, setAddress] = useState<BillingAddress>({});
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [expired, setExpired] = useState(false);
  const [now, setNow] = useState(Date.now());
  const editedAtQuote = useRef(0);
  const edits = useRef(0);
  const requestGeneration = useRef(0);
  const busyRef = useRef(false);
  useEffect(() => () => {
    requestGeneration.current += 1;
    busyRef.current = false;
  }, []);
  const invalidateQuote = useCallback(() => {
    edits.current += 1;
    setQuote(null);
    setExpired(false);
    setError("");
  }, []);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!quote) return;
    const expiry = Date.parse(quote.expiresAt);
    if (Number.isFinite(expiry) && now >= expiry) {
      setExpired(true);
      setQuote(null);
    }
  }, [quote, now]);

  const createQuote = async () => {
    if (!stripe || !elements || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    setExpired(false);
    setQuote(null);
    const generation = ++requestGeneration.current;
    const editSnapshot = edits.current;
    try {
      const { error: submitError } = await elements.submit();
      if (generation !== requestGeneration.current) return;
      if (submitError) throw new Error(submitError.message || "Check your card and billing details.");
      const tokenResult = await stripe.createConfirmationToken({
        elements,
        params: {
          payment_method_data: {
            billing_details: {
              name: address.name,
              email: address.email,
              phone: address.phone,
              address: {
                line1: address.address?.line1,
                line2: address.address?.line2,
                city: address.address?.city,
                state: address.address?.state,
                postal_code: address.address?.postal_code,
                country: address.address?.country,
              },
            },
          },
        },
      });
      if (generation !== requestGeneration.current) return;
      if (editSnapshot !== edits.current) throw new Error("Your payment details changed. Review the total again.");
      if (tokenResult.error || !tokenResult.confirmationToken) {
        throw new Error(tokenResult.error?.message || "Could not validate your card details.");
      }
      const response = await apiRequest("POST", "/api/organizer-card-payments/direct/quote", {
        paymentRequestId,
        confirmationTokenId: tokenResult.confirmationToken.id,
      });
      const result = await response.json() as QuoteResponse;
      if (generation !== requestGeneration.current) return;
      if (editSnapshot !== edits.current) throw new Error("Your payment details changed. Review the total again.");
      editedAtQuote.current = edits.current;
      setQuote(result);
    } catch (err: any) {
      if (generation === requestGeneration.current) setError(err?.message || "Could not prepare the payment total. Please try again.");
    } finally {
      if (generation === requestGeneration.current) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  };

  const confirmPayment = async () => {
    if (!quote || expired || edits.current !== editedAtQuote.current || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    const generation = ++requestGeneration.current;
    try {
      const response = await apiRequest("POST", "/api/organizer-card-payments/direct/confirm", {
        paymentId: quote.paymentId,
        quoteId: quote.quoteId,
      });
      if (generation !== requestGeneration.current) return;
      const result = await response.json() as { clientSecret: string; status: string; paymentId: string };
      if (generation !== requestGeneration.current) return;
      setQuote(null);
      setPending(true);
      await onPending();
      if (result.status === "requires_action" && stripe) {
        const action = await stripe.handleNextAction({ clientSecret: result.clientSecret });
        if (generation !== requestGeneration.current) return;
        if (action.error) setError(action.error.message || "Additional bank verification could not be completed. Check the invoice status below.");
      } else if (!["succeeded", "processing", "requires_action"].includes(result.status)) {
        setError("Your payment was submitted and is awaiting verification. The invoice will update when Stripe confirms it.");
      }
      await onPending();
    } catch (err: any) {
      if (generation === requestGeneration.current) setError(err?.message || "Payment could not be confirmed. Your card has not been marked as paid.");
    } finally {
      if (generation === requestGeneration.current) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  };

  const quoteIsCurrent = !!quote && !expired && edits.current === editedAtQuote.current;
  return pending ? (
    <div className="space-y-5 py-3" aria-live="polite">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-800"><ShieldCheck className="h-7 w-7" /></div>
      <div className="text-center"><h3 className="text-lg font-semibold">Verification pending</h3><p className="mt-1 text-sm text-muted-foreground">Stripe is checking this payment. We’ll refresh the invoice; it is not marked paid until confirmed.</p></div>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="flex justify-end"><Button variant="outline" onClick={onCancel}>Close</Button></div>
    </div>
  ) : (
    <div className="space-y-5">
      <div className="rounded-xl border border-border/70 bg-muted/35 p-4">
        <div className="flex justify-between text-sm"><span>Game invoice</span><span>{money(baseAmountCents)}</span></div>
        {quote ? <>
          <div className="mt-2 flex justify-between text-sm"><span>Card processing surcharge</span><span data-testid="direct-fee-amount">{money(quote.processingSurchargeCents)}</span></div>
          <div className="mt-3 flex justify-between border-t border-border pt-3 font-semibold"><span>Total due</span><span data-testid="direct-review-total">{money(quote.totalAmountCents)}</span></div>
          <p className="mt-2 text-xs text-muted-foreground">{quote.feeExplanation}</p>
          <p className="mt-2 text-xs text-muted-foreground">The organizer covers any processing costs that cannot be passed on. No subscription is involved.</p>
          <Button type="button" variant="link" className="mt-2 h-auto p-0 text-xs" disabled={busy} onClick={invalidateQuote}>Edit card or billing details</Button>
        </> : <p className="mt-2 text-xs text-muted-foreground">The final total and any card processing surcharge will be shown before you confirm.</p>}
      </div>
      {!quote && <>
        <div className="space-y-2"><h3 className="text-sm font-semibold">Billing address</h3>
          <AddressElement options={{ mode: "billing", fields: { phone: "auto" }, display: { name: "full" } }} onChange={(event) => {
            setAddress(event.value as BillingAddress);
            invalidateQuote();
          }} />
        </div>
        <div className="space-y-2"><h3 className="text-sm font-semibold">Card details</h3>
          <PaymentElement options={{ layout: "tabs" }} onChange={invalidateQuote} />
        </div>
      </>}
      {expired && <Notice tone="error">This quoted total expired. Review your details to request a current total.</Notice>}
      {error && <Notice tone="error">{error}</Notice>}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="outline" onClick={onCancel} disabled={busy && !!quote}>Cancel</Button>
        {quoteIsCurrent ? (
          <Button onClick={confirmPayment} disabled={busy || !stripe} data-testid="direct-confirm-payment">
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {busy ? "Submitting…" : `Pay total ${money(quote!.totalAmountCents)}`}
          </Button>
        ) : (
          <Button onClick={createQuote} disabled={busy || !stripe || !elements}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {busy ? "Checking details…" : "Review total"}
          </Button>
        )}
      </div>
      <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground"><ShieldCheck className="h-3.5 w-3.5" />Encrypted card details handled securely by Stripe</p>
    </div>
  );
}

function ResumePayment({ resume, onCancel, onPending }: {
  resume: NonNullable<ContextResponse["resume"]>;
  onCancel: () => void;
  onPending: () => Promise<void>;
}) {
  const stripe = useStripe();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(!["requires_action", "confirmation_pending"].includes(resume.status));
  const busyRef = useRef(false);
  const generation = useRef(0);
  useEffect(() => () => { generation.current += 1; busyRef.current = false; }, []);
  const continueVerification = async () => {
    if (!stripe || busyRef.current) return;
    busyRef.current = true;
    const current = ++generation.current;
    setBusy(true);
    setError("");
    try {
      let payment = { status: resume.status, clientSecret: resume.clientSecret };
      if (resume.status === "confirmation_pending") {
        const response = await apiRequest("POST", "/api/organizer-card-payments/direct/confirm", {
          paymentId: resume.paymentId, quoteId: resume.quoteId,
        });
        payment = await response.json();
        if (generation.current !== current) return;
      }
      if (payment.status === "requires_action" && payment.clientSecret) {
        const result = await stripe.handleNextAction({ clientSecret: payment.clientSecret });
        if (generation.current !== current) return;
        if (result.error) setError(result.error.message || "Verification is still pending.");
      }
      setPending(true);
      await onPending();
    } catch (err: any) {
      if (generation.current !== current) return;
      setError(err?.message || "Could not continue verification. Check the invoice status below.");
      setPending(true);
      await onPending();
    } finally {
      if (generation.current === current) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  };
  return <div className="space-y-4">
    <div className="rounded-xl border border-border/70 bg-muted/35 p-4">
      <div className="flex justify-between text-sm"><span>Existing payment</span><span>{money(resume.totalAmountCents)}</span></div>
      <p className="mt-2 text-xs text-muted-foreground">This payment is already in progress. We’ll continue its verification without creating another charge.</p>
    </div>
    {pending && <Notice tone="pending">Verification pending. Stripe has not yet confirmed this payment as paid.</Notice>}
    {error && <Notice tone="error">{error}</Notice>}
    <div className="flex justify-end gap-2">
      {!pending && <Button variant="outline" onClick={onCancel} disabled={busy}>Cancel</Button>}
      <Button onClick={pending ? onCancel : continueVerification} disabled={busy || !stripe}>
        {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {pending ? "Close" : busy ? "Continuing…" : "Continue verification"}
      </Button>
    </div>
  </div>;
}

function Notice({ children, tone }: { children: ReactNode; tone: "error" | "pending" }) {
  return <div className={`flex items-start gap-2 rounded-lg p-3 text-sm ${tone === "error" ? "bg-destructive/10 text-destructive" : "bg-amber-100/70 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200"}`} role="status">
    {tone === "error" ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}
    <span>{children}</span>
  </div>;
}
