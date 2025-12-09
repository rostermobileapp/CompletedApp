import { useOneSignal } from '@/hooks/useOneSignal';

export function OneSignalProvider({ children }: { children: React.ReactNode }) {
  useOneSignal();
  return <>{children}</>;
}
