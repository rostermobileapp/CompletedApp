/** Older stored forecasts have no OTL category. Do not invent one for them. */
export type WinChanceRecord = { wins: number; losses: number; ties: number; shootoutLosses?: number };

export function formatWinChanceRecord(record: WinChanceRecord): string {
  const values = [record.wins, record.losses, record.ties];
  if (record.shootoutLosses != null) values.push(record.shootoutLosses);
  return values.join("-");
}
