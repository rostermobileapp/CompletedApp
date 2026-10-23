export function getAwardHolderLabel(holderName: string | null | undefined): string {
  return holderName ? `Held by ${holderName}` : 'Unassigned';
}
