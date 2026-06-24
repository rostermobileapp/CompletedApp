import skatesSrc from '../assets/scrimmage-covers/skates.jpg';
import benchSrc from '../assets/scrimmage-covers/bench.jpg';
import zamboniSrc from '../assets/scrimmage-covers/zamboni.jpg';
import netSrc from '../assets/scrimmage-covers/net.jpg';
import outdoorSrc from '../assets/scrimmage-covers/outdoor.jpg';

export interface ScrimmageCoverOption {
  id: string;
  src: string;
  label: string;
}

export const SCRIMMAGE_COVER_OPTIONS: ScrimmageCoverOption[] = [
  { id: 'skates', src: skatesSrc, label: 'Skates' },
  { id: 'bench', src: benchSrc, label: 'On the Bench' },
  { id: 'zamboni', src: zamboniSrc, label: 'Zamboni' },
  { id: 'net', src: netSrc, label: 'At the Net' },
  { id: 'outdoor', src: outdoorSrc, label: 'Outdoor Ice' },
];

export function getScrimmageCoverSrc(id: string | null | undefined): string | null {
  if (!id) return null;
  return SCRIMMAGE_COVER_OPTIONS.find(o => o.id === id)?.src ?? null;
}
