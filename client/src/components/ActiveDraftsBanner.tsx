import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Snowflake, ChevronRight, Clock, Crown, Hourglass, Pause } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useWebSocket } from "@/context/WebSocketContext";

interface ActiveDraft {
  id: string;
  leagueId: string;
  leagueName: string;
  status: "active" | "paused" | "awaiting_captains";
  role: "commissioner" | "captain";
  currentRound: number;
  totalRounds: number;
  currentTurn: number;
  currentTurnDeadline: string | null;
  pickingCaptainName: string | null;
  readyCount?: number;
  captainCount?: number;
}

function statusLabel(d: ActiveDraft) {
  switch (d.status) {
    case "active":
      return "In progress";
    case "paused":
      return "Paused";
    case "awaiting_captains":
      return "Waiting for captains";
  }
}

function fmtClock(secs: number): string {
  const m = Math.max(0, Math.floor(secs / 60));
  const s = Math.max(0, Math.floor(secs % 60));
  return `${m}:${String(s).padStart(2, "0")}`;
}

function DraftRow({ draft, onOpen }: { draft: ActiveDraft; onOpen: () => void }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (draft.status !== "active" || !draft.currentTurnDeadline) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [draft.status, draft.currentTurnDeadline]);

  const remainingSec = draft.currentTurnDeadline
    ? Math.max(0, Math.ceil((new Date(draft.currentTurnDeadline).getTime() - now) / 1000))
    : 0;
  const lowTime = draft.status === "active" && remainingSec > 0 && remainingSec < 15;

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-amber-400/40 transition-colors border-b last:border-b-0 border-amber-700/20 ${
        lowTime ? "animate-pulse" : ""
      }`}
      data-testid={`button-return-to-draft-${draft.id}`}
    >
      <span
        className={`relative inline-flex w-2.5 h-2.5 rounded-full flex-shrink-0 ${
          draft.status === "active"
            ? "bg-emerald-600"
            : draft.status === "paused"
              ? "bg-amber-700"
              : "bg-blue-600"
        }`}
        data-testid={`pulse-${draft.id}`}
      >
        {draft.status === "active" && (
          <span className="absolute inset-0 rounded-full bg-emerald-500 animate-ping opacity-75" />
        )}
      </span>
      <Snowflake className="w-4 h-4 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-xs font-semibold truncate" data-testid={`banner-title-${draft.id}`}>
          {draft.leagueName} · {statusLabel(draft)}
        </div>
        <div className="text-[11px] opacity-90 truncate flex items-center gap-2 mt-0.5">
          {draft.status === "active" && (
            <>
              <span data-testid={`banner-round-${draft.id}`}>
                Rd {draft.currentRound}/{draft.totalRounds} · Pick {draft.currentTurn}
              </span>
              {draft.pickingCaptainName && (
                <span className="flex items-center gap-1 truncate">
                  <Crown className="w-3 h-3 flex-shrink-0" />
                  <span className="truncate" data-testid={`banner-captain-${draft.id}`}>
                    {draft.pickingCaptainName}
                  </span>
                </span>
              )}
              {draft.currentTurnDeadline && (
                <span
                  className={`flex items-center gap-1 font-mono ${lowTime ? "font-bold" : ""}`}
                  data-testid={`banner-timer-${draft.id}`}
                >
                  <Clock className="w-3 h-3" />
                  {fmtClock(remainingSec)}
                </span>
              )}
            </>
          )}
          {draft.status === "paused" && (
            <span className="flex items-center gap-1">
              <Pause className="w-3 h-3" /> Rd {draft.currentRound}/{draft.totalRounds} · Paused by commissioner
            </span>
          )}
          {draft.status === "awaiting_captains" && (
            <span className="flex items-center gap-1">
              <Hourglass className="w-3 h-3" />
              {draft.readyCount ?? 0}/{draft.captainCount ?? 0} captains ready
            </span>
          )}
        </div>
      </div>
      <span className="text-[11px] font-bold uppercase tracking-wide whitespace-nowrap">
        Return to draft
      </span>
      <ChevronRight className="w-4 h-4 flex-shrink-0" />
    </button>
  );
}

export function ActiveDraftsBanner() {
  const [location, setLocation] = useLocation();
  const { isAuthenticated } = useAuth();
  const ws = useWebSocket();
  const queryClient = useQueryClient();

  // Hide on the draft room itself.
  const onDraftRoute = location.startsWith("/draft/");

  const { data: activeDrafts = [] } = useQuery<ActiveDraft[]>({
    queryKey: ["/api/user/active-drafts"],
    enabled: !!isAuthenticated && !onDraftRoute,
    refetchOnWindowFocus: true,
    // No polling: WebSocket events drive invalidation. The local 1s tick on
    // each row keeps the countdown UI fresh between server updates.
  });

  // Refresh the banner whenever a draft transitions or ticks on the server,
  // so the round / picking captain / deadline stay in sync.
  useEffect(() => {
    if (!isAuthenticated) return;
    const refresh = () =>
      queryClient.invalidateQueries({ queryKey: ["/api/user/active-drafts"] });
    const offs = [
      ws.subscribe("draft_state", refresh),
      ws.subscribe("draft_pick_made", refresh),
      ws.subscribe("draft_started", refresh),
      ws.subscribe("draft_paused", refresh),
      ws.subscribe("draft_resumed", refresh),
      ws.subscribe("draft_completed", refresh),
      ws.subscribe("draft_awaiting_captains", refresh),
      ws.subscribe("draft_lobby_cancelled", refresh),
    ];
    return () => {
      offs.forEach((o) => o());
    };
  }, [ws, isAuthenticated, queryClient]);

  if (onDraftRoute) return null;
  if (!activeDrafts.length) return null;

  // Cap the banner at 2 stacked rows; if more, show a "+N more" hint that
  // links to the user's leagues so they can pick which to enter.
  const MAX_ROWS = 2;
  const visible = activeDrafts.slice(0, MAX_ROWS);
  const overflow = activeDrafts.length - visible.length;

  return (
    <div
      className="sticky top-0 z-40 bg-amber-500 text-amber-950 dark:bg-amber-400 dark:text-black border-b border-amber-700/30 shadow-sm"
      data-testid="active-drafts-banner"
    >
      {visible.map((d) => (
        <DraftRow
          key={d.id}
          draft={d}
          onOpen={() => setLocation(`/draft/${d.id}`)}
        />
      ))}
      {overflow > 0 && (
        <div
          className="px-3 py-1 text-[11px] font-medium text-amber-900 bg-amber-400/60 border-t border-amber-700/20"
          data-testid="banner-overflow"
        >
          +{overflow} more active draft{overflow === 1 ? "" : "s"}
        </div>
      )}
    </div>
  );
}
