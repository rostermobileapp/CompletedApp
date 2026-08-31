import { useEffect, useState } from 'react';
import type { ComponentType } from 'react';
import { Check, DollarSign, ExternalLink } from 'lucide-react';
import { SiCashapp, SiVenmo } from 'react-icons/si';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export type PaymentMethod = 'venmo' | 'cashapp' | 'cash' | 'other';

interface PaymentMethodPickerProps {
  creatorName: string;
  venmoUrl: string | null;
  cashappUrl: string | null;
  isPaid: boolean;
  isConfirmed?: boolean;
  paymentMethod?: PaymentMethod | null;
  isPending?: boolean;
  onUpdate: (isPaid: boolean, paymentMethod: PaymentMethod | null) => void;
  className?: string;
}

export function PaymentMethodPicker({
  creatorName,
  venmoUrl,
  cashappUrl,
  isPaid,
  isConfirmed = false,
  paymentMethod,
  isPending = false,
  onUpdate,
  className = '',
}: PaymentMethodPickerProps) {
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethod | null>(null);
  const [otherPaymentDetails, setOtherPaymentDetails] = useState('');

  useEffect(() => {
    if (isPaid) {
      setSelectedPaymentMethod(null);
      setOtherPaymentDetails('');
    }
  }, [isPaid]);

  const paymentOptions: Array<{
    value: PaymentMethod;
    label: string;
    url: string | null;
    icon: ComponentType<{ className?: string }>;
  }> = [
    { value: 'venmo', label: 'Venmo', url: venmoUrl, icon: SiVenmo },
    { value: 'cashapp', label: 'Cash App', url: cashappUrl, icon: SiCashapp },
    { value: 'cash', label: 'Cash', url: null, icon: DollarSign },
    { value: 'other', label: 'Other', url: null, icon: DollarSign },
  ];

  return (
    <div
      className={`bg-card rounded-2xl border border-[hsl(var(--hairline))] shadow-[var(--elev-rest)] p-5 ${className}`}
      data-testid="card-pay-creator"
    >
      <h2 className="text-base font-semibold mb-1">Pay {creatorName}</h2>
      <p className="text-xs text-muted-foreground mb-3">
        Send payment for this invoice using one of the options below.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {paymentOptions.map((option) => {
          const isUnavailable = (option.value === 'venmo' || option.value === 'cashapp') && !option.url;
          const disabled = isUnavailable || isPaid || isPending;
          const isSelected = selectedPaymentMethod === option.value;
          const Icon = option.icon;
          return (
            <div key={option.value} className="flex items-stretch gap-1">
              <button
                type="button"
                disabled={disabled}
                onClick={() => {
                  setSelectedPaymentMethod(option.value);
                  if (option.value !== 'other') {
                    setOtherPaymentDetails('');
                  }
                }}
                className={`flex-1 inline-flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${
                  isSelected
                    ? 'border-primary bg-primary/10 ring-1 ring-primary'
                    : 'border-[hsl(var(--hairline))] bg-background/40 hover:bg-muted/60'
                } disabled:cursor-not-allowed disabled:opacity-40`}
                data-testid={`option-payment-method-${option.value}`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="font-medium">{option.label}</span>
                {isSelected && <Check className="ml-auto w-4 h-4 text-primary" />}
                {isUnavailable && (
                  <span className="ml-auto text-[11px] text-muted-foreground">Unavailable</span>
                )}
              </button>
              {option.url && !isPaid && (
                <a
                  href={option.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => {
                    setSelectedPaymentMethod(option.value);
                    setOtherPaymentDetails('');
                  }}
                  aria-label={`Open ${option.label}`}
                  className="inline-flex items-center justify-center rounded-lg border border-[hsl(var(--hairline))] px-2 text-muted-foreground hover:text-foreground hover:bg-muted/60"
                  data-testid={`link-open-payment-${option.value}`}
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              )}
            </div>
          );
        })}
      </div>
      {selectedPaymentMethod === 'other' && (
        <div className="mt-3">
          <label htmlFor="other-payment-details" className="text-xs font-medium">
            What payment method did you use?
          </label>
          <Input
            id="other-payment-details"
            value={otherPaymentDetails}
            onChange={(event) => setOtherPaymentDetails(event.target.value)}
            placeholder="e.g. Zelle, check, or bank transfer"
            maxLength={100}
            required
            className="mt-1"
            data-testid="input-other-payment-details"
          />
        </div>
      )}
      {isPaid ? (
        <div className="mt-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <p className="text-xs text-emerald-600 dark:text-emerald-300">
            {isConfirmed
              ? `Payment confirmed by the organizer as ${paymentMethod || 'paid'}.`
              : `Payment marked as ${paymentMethod || 'paid'}.`}
          </p>
          {!isConfirmed && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isPending}
              onClick={() => onUpdate(false, null)}
              data-testid="button-undo-payment"
            >
              {isPending ? 'Undoing…' : 'Undo / change method'}
            </Button>
          )}
        </div>
      ) : (
        <Button
          type="button"
          className="w-full mt-3"
          disabled={
            !selectedPaymentMethod ||
            isPending ||
            (selectedPaymentMethod === 'other' && !otherPaymentDetails.trim())
          }
          onClick={() => {
            if (!selectedPaymentMethod) return;
            onUpdate(true, selectedPaymentMethod);
          }}
          data-testid="button-confirm-payment"
        >
          {isPending ? 'Confirming…' : 'Confirm'}
        </Button>
      )}
    </div>
  );
}