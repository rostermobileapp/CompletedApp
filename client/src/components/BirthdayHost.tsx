import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useDemo } from "@/context/DemoContext";
import { BadgeConfettiOverlay } from "./BadgeEarnedHost";

type BirthdayStatus = { eligible: boolean; birthdayDate?: string; expiresAt?: string };

export function BirthdayHost() {
  const { user } = useAuth();
  const { isActive: demoActive } = useDemo();
  const queryClient = useQueryClient();
  const [dismissing, setDismissing] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const statusKey = ["/api/birthday/status", user?.id];
  const { data: status } = useQuery<BirthdayStatus>({
    queryKey: statusKey,
    queryFn: async () => (await apiRequest("GET", "/api/birthday/status")).json(),
    enabled: !!user && !demoActive,
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });
  // Give earned badges priority instead of stacking two full-screen dialogs.
  const { data: pendingBadges, isError: badgeCheckFailed } = useQuery<unknown[]>({
    queryKey: ["/api/badges/events/pending"],
    enabled: !!user && !demoActive && !!status?.eligible,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    const refreshClock = () => setNow(Date.now());
    window.addEventListener("focus", refreshClock);
    document.addEventListener("visibilitychange", refreshClock);
    const remaining = status?.expiresAt ? Date.parse(status.expiresAt) - Date.now() : 0;
    const timer = remaining > 0 ? window.setTimeout(refreshClock, remaining + 10) : null;
    return () => {
      window.removeEventListener("focus", refreshClock);
      document.removeEventListener("visibilitychange", refreshClock);
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [status?.expiresAt]);

  const open = !!user && !demoActive && !!status?.eligible
    && !!status.expiresAt && now < Date.parse(status.expiresAt)
    && (pendingBadges?.length === 0 || badgeCheckFailed);
  async function dismiss() {
    if (dismissing) return;
    setDismissing(true);
    setError("");
    try {
      await apiRequest("POST", "/api/birthday/dismiss");
      queryClient.setQueryData<BirthdayStatus>(statusKey, previous => previous
        ? { ...previous, eligible: false }
        : { eligible: false });
    } catch {
      setError("Couldn't close the greeting. Please try again.");
      void queryClient.invalidateQueries({ queryKey: statusKey });
    } finally {
      setDismissing(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={next => { if (!next) void dismiss(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[10001] bg-white/15 backdrop-blur-[24px]" />
        <Dialog.Content
          data-testid="birthday-card"
          className="fixed left-1/2 top-1/2 z-[10002] max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[1.5rem] border-2 border-white bg-[linear-gradient(145deg,#fff,#edf5fb)] p-6 text-center text-[#1e3345] shadow-[0_28px_56px_rgba(28,56,84,0.25)] ring-1 ring-[#a9bfd0] sm:p-8"
        >
          <div className="pointer-events-none absolute inset-1 rounded-[1.2rem] border border-white/80" />
          <button
            type="button"
            onClick={() => { void dismiss(); }}
            disabled={dismissing}
            aria-label="Close birthday greeting"
            className="absolute right-3 top-3 rounded-full p-2 text-[#597087] hover:bg-[#e8f0f6] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#164a73]"
          ><X size={20} /></button>
          <p className="mt-5 text-xs font-bold uppercase tracking-[.24em] text-[#d52d3b]">From Roster Hockey</p>
          <Dialog.Title className="mt-5 text-3xl font-bold tracking-tight text-[#173d5b] sm:text-4xl">
            Happy Birthday!
          </Dialog.Title>
          <Dialog.Description className="mt-4 text-base text-[#597087]">
            Roster Hockey wishes you a fantastic day.
          </Dialog.Description>
          <button
            type="button"
            onClick={() => { void dismiss(); }}
            disabled={dismissing}
            className="mt-8 w-full rounded-lg bg-[#164a73] px-4 py-3 text-sm font-bold text-white hover:bg-[#103a5b] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#164a73]"
          >Thank you!</button>
          {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
        </Dialog.Content>
        {open && <div className="pointer-events-none fixed inset-0 z-[10003]" aria-hidden="true"><BadgeConfettiOverlay /></div>}
      </Dialog.Portal>
    </Dialog.Root>
  );
}