import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useWebSocket } from "@/context/WebSocketContext";

type EarnedEvent = {
  id?: string;
  eventId?: string;
  badge?: any;
  payload?: any;
  definition?: any;
};

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
  const tier = payload.tier;
  const isMultiplier = badge.achievementType === "multiplier" && payload.count;
  const eventId = current.id || current.eventId;

  const dismiss = async () => {
    if (eventId) await apiRequest("POST", `/api/badges/events/${eventId}/acknowledge`);
    setQueue((existing) => existing.slice(1));
    queryClient.invalidateQueries({ queryKey: ["/api/badges/events/pending"] });
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-5" onClick={dismiss}>
      <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-[#c9a84c]/40 bg-[#0d1b2a] p-7 text-center shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-[radial-gradient(circle_at_center,_rgba(201,168,76,.25),_transparent_65%)]" />
        <button onClick={dismiss} className="absolute right-4 top-4 text-[#8096aa]"><X size={20} /></button>
        <p className="text-xs font-semibold uppercase tracking-[.24em] text-[#c9a84c]">{tier ? `Upgraded to ${String(tier).toUpperCase()}` : "Achievement unlocked"}</p>
        <div className="mx-auto mt-6 flex h-48 w-48 items-center justify-center rounded-full border-2 border-[#c9a84c] bg-[#c9a84c] p-2 animate-[badge-reveal_.4s_ease-out]">
          {badge.imagePath ? <img src={badge.imagePath} alt="" className="h-full w-full rounded-full object-contain" /> : <span className="px-5 text-center text-sm font-bold uppercase text-[#0a1520]">{badge.name || "Badge"}</span>}
        </div>
        <h2 className="mt-6 text-3xl font-bold text-white">{badge.name || "New badge"}</h2>
        <p className="mt-2 text-sm text-[#a6b5c2]">{badge.description || "You earned a new badge."}</p>
        {isMultiplier && <p className="mt-4 text-2xl font-bold text-[#c9a84c]">×{payload.count}</p>}
        <button onClick={() => { void dismiss(); navigate("/trophy-case"); }} className="mt-7 w-full rounded-xl border border-[#c9a84c] px-4 py-3 text-xs font-bold uppercase tracking-wider text-[#c9a84c] hover:bg-[#c9a84c]/10">View in Trophy Case</button>
      </div>
    </div>
  );
}