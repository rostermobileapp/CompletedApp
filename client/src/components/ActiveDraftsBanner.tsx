import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Snowflake, ChevronRight } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useWebSocket } from "@/context/WebSocketContext";

interface ActiveDraft {
  id: string;
  leagueId: string;
  leagueName: string;
  status: "active" | "paused" | "awaiting_captains";
  role: "commissioner" | "captain";
}

function statusLabel(status: ActiveDraft["status"]) {
  switch (status) {
    case "active":
      return "In progress";
    case "paused":
      return "Paused";
    case "awaiting_captains":
      return "Waiting for captains";
  }
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
  });

  // Refresh the banner whenever a draft transitions on the server.
  useEffect(() => {
    if (!isAuthenticated) return;
    const refresh = () =>
      queryClient.invalidateQueries({ queryKey: ["/api/user/active-drafts"] });
    const offs = [
      ws.subscribe("draft_started", refresh),
      ws.subscribe("draft_paused", refresh),
      ws.subscribe("draft_resumed", refresh),
      ws.subscribe("draft_completed", refresh),
      ws.subscribe("draft_awaiting_captains", refresh),
    ];
    return () => {
      offs.forEach((o) => o());
    };
  }, [ws, isAuthenticated, queryClient]);

  if (onDraftRoute) return null;
  if (!activeDrafts.length) return null;

  // If there's exactly one, show a single-line banner. If there are multiple
  // we still show a single banner that opens to a list-on-tap.
  const primary = activeDrafts[0];
  const extra = activeDrafts.length - 1;

  return (
    <div
      className="sticky top-0 z-40 bg-amber-500 text-amber-950 dark:bg-amber-400 dark:text-black border-b border-amber-700/30 shadow-sm"
      data-testid="active-drafts-banner"
    >
      <button
        type="button"
        onClick={() => setLocation(`/draft/${primary.id}`)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-amber-400/40 transition-colors"
        data-testid="button-return-to-draft"
      >
        <Snowflake className="w-4 h-4 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold truncate">
            {primary.leagueName} draft · {statusLabel(primary.status)}
          </div>
          {extra > 0 && (
            <div className="text-[10px] opacity-80">
              and {extra} other active draft{extra === 1 ? "" : "s"}
            </div>
          )}
        </div>
        <span className="text-xs font-bold uppercase tracking-wide">
          Return to draft
        </span>
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}
