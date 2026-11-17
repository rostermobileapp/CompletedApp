export class OrganizerCardPaymentError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly code: string,
  ) {
    super(message);
    this.name = "OrganizerCardPaymentError";
  }
}

export function parseBaseAmountCents(value: string | number): number {
  const text = String(value).trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) {
    throw new OrganizerCardPaymentError(
      "The invoice amount must be a positive USD amount with up to two decimals.",
      400,
      "invalid_amount",
    );
  }
  const [whole, fraction = ""] = text.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents) || cents <= 0) {
    throw new OrganizerCardPaymentError("The invoice amount must be greater than zero.", 400, "invalid_amount");
  }
  return cents;
}

export function calculateOrganizerServiceFeeCents(baseAmountCents: number): number {
  if (!Number.isSafeInteger(baseAmountCents) || baseAmountCents <= 0) {
    throw new OrganizerCardPaymentError("The invoice amount must be greater than zero.", 400, "invalid_amount");
  }
  // 5% is 1/20; integer arithmetic avoids floating-point cent drift.
  return Math.floor((baseAmountCents + 10) / 20) + 50;
}
