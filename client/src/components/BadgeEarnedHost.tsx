import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { apiRequest, getImageUrl } from "@/lib/queryClient";
import { useWebSocket } from "@/context/WebSocketContext";
import iceBackground from "@/assets/trophy-case-ice.png";

type EarnedEvent = {
  id?: string;
  eventId?: string;
  badge?: any;
  payload?: any;
  definition?: any;
};

export function BadgeEarnedAnnouncement({
  badge,
  payload = {},
  onDismiss,
  onViewTrophyCase,
}: {
  badge: any;
  payload?: any;
  onDismiss: () => void | Promise<void>;
  onViewTrophyCase?: () => void | Promise<void>;
}) {
  const tier = payload.tier;
  const isMultiplier = badge.achievementType === "multiplier" && payload.count;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-cover bg-center p-4 sm:p-5"
      style={{ backgroundImage: `linear-gradient(rgba(23, 61, 91, .22), rgba(23, 61, 91, .22)), url(${iceBackground})` }}
      onClick={() => { void onDismiss(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Badge earned"
        className="relative max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-[1.5rem] border-2 border-white bg-[linear-gradient(145deg,#fff,#edf5fb)] p-5 text-center text-[#1e3345] shadow-[0_28px_56px_rgba(28,56,84,0.25)] ring-1 ring-[#a9bfd0] sm:p-7"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="pointer-events-none absolute inset-1 rounded-[1.2rem] border border-white/80" />
        <button onClick={() => { void onDismiss(); }} className="absolute right-3 top-3 rounded-full p-2 text-[#597087] transition hover:bg-[#e8f0f6] hover:text-[#173d5b] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#164a73] sm:right-4 sm:top-4" aria-label="Close achievement announcement"><X size={20} /></button>
        <p className="px-9 text-[10px] font-bold uppercase tracking-[.24em] text-[#d52d3b]">{tier ? `Upgraded to ${String(tier).toUpperCase()}` : "Achievement unlocked"}</p>
        <div className={`badge-click-pop relative mx-auto mt-5 flex h-40 w-40 items-center justify-center sm:h-48 sm:w-48 ${badge.imagePath ? "bg-transparent" : "rounded-full bg-[#e8f0f6]"}`}>
          {badge.imagePath ? <img src={getImageUrl(badge.imagePath) ?? undefined} alt="" className="h-full w-full object-contain" /> : <span className="px-5 text-center text-sm font-bold uppercase text-[#164a73]">{badge.name || "Badge"}</span>}
        </div>
        <h2 className="mt-5 text-2xl font-bold tracking-tight text-[#173d5b] sm:text-3xl">{badge.name || "New badge"}</h2>
        <p className="mt-2 text-sm text-[#597087]">{badge.description || "You earned a new badge."}</p>
        {isMultiplier && <p className="mt-4 text-2xl font-bold text-[#d52d3b]">×{payload.count}</p>}
        {onViewTrophyCase && <button onClick={() => { void onViewTrophyCase(); }} className="mt-6 w-full rounded-lg bg-[#164a73] px-4 py-3 text-xs font-bold uppercase tracking-wider text-white transition hover:bg-[#103a5b] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#164a73]">View in Trophy Case</button>}
      </div>
    </div>
  );
}

export function BadgeEarnedHost() {
  const { subscribe, onConnected } = useWebSocket();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const [queue, setQueue] = useState<EarnedEvent[]>([]);
  const current = queue[0];
  const { data: pending } = useQuery<EarnedEvent[]>({
    queryKey: ["/api/badges/events/pending"],
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (pending?.length) {
      setQueue((existing) => {
        const seen = new Set(existing.map((event) => event.id || event.eventId));
        return [...existing, ...pending.filter((event) => !seen.has(event.id || event.eventId))];
      });
    }
  }, [pending]);

  useEffect(() => subscribe("badge_earned", (event) => {
    setQueue((existing) => existing.some((item) => (item.id || item.eventId) === (event.eventId || event.id)) ? existing : [...existing, event]);
    queryClient.invalidateQueries({ queryKey: ["/api/trophy-case"] });
  }), [subscribe, queryClient]);

  useEffect(() => onConnected(() => {
    queryClient.invalidateQueries({ queryKey: ["/api/badges/events/pending"] });
  }), [onConnected, queryClient]);

  if (!current) return null;
  const badge = current.badge || current.definition || {};
  const payload = current.payload || current.badge || {};
  const eventId = current.id || current.eventId;

  const dismiss = async () => {
    if (eventId) await apiRequest("POST", `/api/badges/events/${eventId}/acknowledge`);
    setQueue((existing) => existing.slice(1));
    queryClient.invalidateQueries({ queryKey: ["/api/badges/events/pending"] });
  };

  return (
    <BadgeEarnedAnnouncement
      badge={badge}
      payload={payload}
      onDismiss={dismiss}
      onViewTrophyCase={async () => { await dismiss(); navigate("/trophy-case"); }}
    />
  );
}