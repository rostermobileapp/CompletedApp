import { useEffect, useState, useMemo, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useWebSocket } from "@/context/WebSocketContext";
import { apiRequest, getImageUrl } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  Send,
  Pause,
  Play,
  Lock,
  Crown,
  Clock,
  Snowflake,
  X,
  ChevronUp,
  Trophy,
  Users,
  MessageCircle,
} from "lucide-react";

interface Draft {
  id: string;
  leagueId: string;
  seasonId?: string;
  draftStyle?: string;
  goalieMethod?: string;
  status: string;
  currentRound: number;
  currentTurn: number;
  totalRounds: number;
  draftOrder: string[];
  timePerPick: number;
  currentTurnDeadline: string | null;
  goalieAssignments: Record<string, string>;
  playerNotes: Record<string, string>;
  skillRankingEnabled: boolean;
  skillScale: string | null;
}

interface DraftPick {
  id: string;
  draftId: string;
  teamId: string;
  playerId: string | null;
  round: number;
  pick: number;
  pickInRound: number;
  isAutoBuddy: boolean;
  expiredAutoPick: boolean;
  forfeited: boolean;
  pickedAt: string;
}

interface BuddyPair {
  id: string;
  userIds: string[];
}

interface ChatMsg {
  id: string;
  userId: string;
  body: string;
  createdAt: string;
}

interface DraftStateBundle {
  draft: Draft;
  picks: DraftPick[];
  buddyPairs: BuddyPair[];
  chatMessages: ChatMsg[];
  pickingTeamId: string | null;
  serverTime: number;
}

export default function DraftRoom() {
  const { draftId } = useParams<{ draftId: string }>();
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const ws = useWebSocket();

  const [bundle, setBundle] = useState<DraftStateBundle | null>(null);
  const [tickNow, setTickNow] = useState(Date.now());
  const [chatInput, setChatInput] = useState("");
  const [showChat, setShowChat] = useState(false);
  const [cardUserId, setCardUserId] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const serverDriftRef = useRef(0);

  // Initial fetch
  const { data: initialBundle, isLoading } = useQuery<DraftStateBundle>({
    queryKey: ["/api/drafts", draftId],
    enabled: !!draftId,
  });

  useEffect(() => {
    if (initialBundle) {
      setBundle(initialBundle);
      serverDriftRef.current = Date.now() - initialBundle.serverTime;
    }
  }, [initialBundle]);

  // Subscribe to draft on WebSocket
  useEffect(() => {
    if (!draftId) return;
    ws.send({ type: "draft_subscribe", draftId });
    const offState = ws.subscribe("draft_state", (data: any) => {
      if (data.payload?.draft?.id === draftId) {
        setBundle(data.payload);
        serverDriftRef.current = Date.now() - data.payload.serverTime;
      }
    });
    const offPick = ws.subscribe("draft_pick_made", (data: any) => {
      if (data.payload?.draftId !== draftId) return;
      // Server will broadcast a fresh draft_state right after.
    });
    const offChat = ws.subscribe("draft_chat", (data: any) => {
      if (!data.payload || data.payload.draftId !== draftId) return;
      setBundle((prev) =>
        prev
          ? {
              ...prev,
              chatMessages: [...prev.chatMessages, data.payload],
            }
          : prev,
      );
    });
    const offTick = ws.subscribe("draft_tick", (data: any) => {
      if (data.payload?.draftId !== draftId) return;
      setTickNow(Date.now());
    });
    const offDone = ws.subscribe("draft_completed", (data: any) => {
      if (data.payload?.draftId !== draftId) return;
      toast({ title: "Draft complete!", description: "Rosters have been finalized." });
    });
    return () => {
      ws.send({ type: "draft_unsubscribe", draftId });
      offState();
      offPick();
      offChat();
      offTick();
      offDone();
    };
  }, [draftId, ws, toast]);

  // Local 1-sec tick to render countdown smoothly
  useEffect(() => {
    const i = setInterval(() => setTickNow(Date.now()), 500);
    return () => clearInterval(i);
  }, []);

  // Auto-scroll chat
  useEffect(() => {
    if (showChat) chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [bundle?.chatMessages.length, showChat]);

  // League data: teams, members, league
  const draft = bundle?.draft;
  const { data: teams = [] } = useQuery<any[]>({
    queryKey: ["/api/leagues", draft?.leagueId, "teams"],
    enabled: !!draft?.leagueId,
  });
  const { data: members = [] } = useQuery<any[]>({
    queryKey: ["/api/leagues", draft?.leagueId, "draft-players"],
    enabled: !!draft?.leagueId,
  });
  const { data: league } = useQuery<any>({
    queryKey: ["/api/leagues", draft?.leagueId],
    enabled: !!draft?.leagueId,
  });

  const isCommissioner = !!user && !!league && league.commissionerId === user.id;
  const myTeam = useMemo(() => {
    if (!user || !teams.length) return null;
    return teams.find((t: any) => t.captainId === user.id);
  }, [user, teams]);
  const isCaptainOfPickingTeam = !!myTeam && bundle?.pickingTeamId === myTeam.id;
  const canPick = isCommissioner || isCaptainOfPickingTeam;

  // Available players (those not yet picked & not assigned as goalies)
  const draftedSet = useMemo(() => {
    const s = new Set<string>();
    bundle?.picks.forEach((p) => p.playerId && s.add(p.playerId));
    Object.values(draft?.goalieAssignments || {}).forEach((uid) => uid && s.add(uid));
    return s;
  }, [bundle, draft]);

  const availablePlayers = useMemo(() => {
    if (!members) return [];
    return members.filter((m: any) => {
      if (draftedSet.has(m.user.id)) return false;
      if (
        draft?.goalieMethod &&
        draft.goalieMethod !== "included_with_skaters" &&
        m.membership.isGoalie
      ) {
        return false;
      }
      return true;
    });
  }, [members, draftedSet, draft]);

  const teamById = useMemo(() => {
    const m = new Map<string, any>();
    for (const t of teams) m.set(t.id, t);
    return m;
  }, [teams]);
  const memberById = useMemo(() => {
    const m = new Map<string, any>();
    for (const mm of members) m.set(mm.user.id, mm);
    return m;
  }, [members]);

  const pickMutation = useMutation({
    mutationFn: async (playerId: string) => {
      const res = await apiRequest("POST", `/api/drafts/${draftId}/pick`, { playerId });
      return res.json();
    },
    onSuccess: () => {
      setCardUserId(null);
    },
    onError: (err: any) => {
      toast({ title: "Pick failed", description: err?.message, variant: "destructive" });
    },
  });

  const startMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/drafts/${draftId}/start`, {});
      return res.json();
    },
    onError: (err: any) =>
      toast({ title: "Failed to start", description: err?.message, variant: "destructive" }),
  });
  const pauseMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/drafts/${draftId}/pause`, {});
      return res.json();
    },
  });
  const resumeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/drafts/${draftId}/resume`, {});
      return res.json();
    },
  });

  const sendChat = () => {
    const trimmed = chatInput.trim();
    if (!trimmed || !draftId) return;
    ws.send({ type: "draft_chat", draftId, body: trimmed });
    setChatInput("");
  };

  if (isLoading || !bundle || !draft) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-muted-foreground">Loading draft…</div>
      </div>
    );
  }

  const deadlineMs = draft.currentTurnDeadline
    ? new Date(draft.currentTurnDeadline).getTime()
    : null;
  const remainingSec = deadlineMs
    ? Math.max(0, Math.floor((deadlineMs - tickNow + serverDriftRef.current) / 1000))
    : 0;
  const totalSec = draft.timePerPick || 60;
  const pct = Math.min(100, Math.max(0, (remainingSec / totalSec) * 100));
  const pickingTeam = bundle.pickingTeamId ? teamById.get(bundle.pickingTeamId) : null;
  const pickingCaptain = pickingTeam?.captainId ? memberById.get(pickingTeam.captainId) : null;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-background border-b border-border">
        <div className="flex items-center justify-between p-3 gap-2">
          <button
            onClick={() => setLocation(`/league-management?leagueId=${draft.leagueId}`)}
            className="p-2 hover:bg-muted rounded"
            data-testid="button-back-to-league"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 text-center">
            <div className="text-xs text-muted-foreground uppercase tracking-wide">
              Round {draft.currentRound} of {draft.totalRounds}
            </div>
            <div className="text-sm font-bold truncate">
              {pickingTeam?.name || "Waiting…"}{" "}
              {pickingCaptain && (
                <span className="text-muted-foreground font-normal">
                  · {pickingCaptain.user.firstName || pickingCaptain.user.displayName}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1">
            {isCommissioner && draft.status === "active" && (
              <button
                onClick={() => pauseMutation.mutate()}
                className="p-2 hover:bg-muted rounded"
                data-testid="button-pause-draft"
              >
                <Pause className="w-5 h-5" />
              </button>
            )}
            {isCommissioner && draft.status === "paused" && (
              <button
                onClick={() => resumeMutation.mutate()}
                className="p-2 hover:bg-muted rounded"
                data-testid="button-resume-draft"
              >
                <Play className="w-5 h-5" />
              </button>
            )}
            {isCommissioner && draft.status === "pending" && (
              <button
                onClick={() => startMutation.mutate()}
                className="px-3 py-1.5 bg-primary text-primary-foreground rounded text-sm font-medium flex items-center gap-1"
                data-testid="button-start-draft"
              >
                <Snowflake className="w-4 h-4" /> Start
              </button>
            )}
            <button
              onClick={() => setShowChat(true)}
              className="p-2 hover:bg-muted rounded relative"
              data-testid="button-open-chat"
            >
              <MessageCircle className="w-5 h-5" />
              {bundle.chatMessages.length > 0 && (
                <span className="absolute -top-0.5 -right-0.5 bg-primary text-primary-foreground text-[10px] rounded-full px-1 min-w-[16px] text-center">
                  {bundle.chatMessages.length}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Timer bar */}
        {draft.status === "active" && (
          <div className="px-3 pb-2">
            <div className="flex items-center gap-2 text-xs">
              <Clock
                className={`w-4 h-4 ${remainingSec < 10 ? "text-destructive animate-pulse" : "text-muted-foreground"}`}
              />
              <div className="flex-1 h-1.5 bg-muted rounded overflow-hidden">
                <div
                  className={`h-full transition-all ${
                    remainingSec < 10 ? "bg-destructive" : "bg-primary"
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span
                className={`font-mono ${remainingSec < 10 ? "text-destructive font-bold" : "text-muted-foreground"}`}
                data-testid="text-timer"
              >
                {Math.floor(remainingSec / 60)}:{String(remainingSec % 60).padStart(2, "0")}
              </span>
            </div>
          </div>
        )}
        {draft.status === "paused" && (
          <div className="px-3 pb-2 text-center text-xs text-muted-foreground">
            <Pause className="inline w-3 h-3 mr-1" /> Draft paused by commissioner
          </div>
        )}
        {draft.status === "completed" && (
          <div className="px-3 pb-2 text-center text-sm font-bold text-emerald-600 dark:text-emerald-400">
            <Trophy className="inline w-4 h-4 mr-1" /> Draft complete! Rosters finalized.
          </div>
        )}
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto p-3 pb-24 space-y-4">
        {/* Available players (only when active) */}
        {(draft.status === "active" || draft.status === "paused") && (
          <section>
            <h2 className="text-sm font-bold mb-2 flex items-center gap-2">
              <Users className="w-4 h-4" /> Available Players ({availablePlayers.length})
              {!canPick && draft.status === "active" && (
                <span className="ml-auto text-xs text-muted-foreground font-normal">
                  Waiting for {pickingCaptain?.user.firstName || "captain"}…
                </span>
              )}
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {availablePlayers.map((m: any) => (
                <button
                  key={m.user.id}
                  onClick={() => setCardUserId(m.user.id)}
                  className="flex items-center gap-2 p-2 bg-card border border-border rounded-lg hover:border-primary text-left"
                  data-testid={`player-card-${m.user.id}`}
                >
                  {m.user.profileImageUrl ? (
                    <img
                      src={getImageUrl(m.user.profileImageUrl) || ""}
                      alt=""
                      className="w-10 h-10 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-xs font-bold">
                      {(m.user.firstName?.[0] || m.user.email?.[0] || "?").toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium truncate">
                      {m.user.firstName || m.user.displayName || m.user.email}
                    </div>
                    <div className="text-[10px] text-muted-foreground truncate">
                      {m.user.lastName || ""}
                      {m.membership.isGoalie && (
                        <span className="ml-1 px-1 bg-blue-500/20 text-blue-600 dark:text-blue-300 rounded">
                          G
                        </span>
                      )}
                      {draft.skillRankingEnabled && m.membership.skillLevel && (
                        <span className="ml-1 px-1 bg-amber-500/20 text-amber-700 dark:text-amber-300 rounded font-bold">
                          {m.membership.skillLevel}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Teams + their picks */}
        <section>
          <h2 className="text-sm font-bold mb-2">Rosters</h2>
          <div className="space-y-2">
            {(draft.draftOrder || []).map((teamId, idx) => {
              const team = teamById.get(teamId);
              const teamPicks = bundle.picks.filter((p) => p.teamId === teamId);
              const goalieId = draft.goalieAssignments?.[teamId];
              const goalie = goalieId ? memberById.get(goalieId) : null;
              const isPicking = bundle.pickingTeamId === teamId;
              return (
                <div
                  key={teamId}
                  className={`p-3 rounded-lg border ${
                    isPicking ? "border-primary bg-primary/5" : "border-border bg-card"
                  }`}
                  data-testid={`team-roster-${teamId}`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm font-bold flex items-center gap-1.5">
                      <span className="text-muted-foreground text-xs">#{idx + 1}</span>
                      {team?.name || "Team"}
                      {isPicking && <Crown className="w-4 h-4 text-amber-500" />}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {teamPicks.filter((p) => !p.forfeited).length} picks
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {goalie && (
                      <span className="px-2 py-0.5 bg-blue-500/15 text-blue-700 dark:text-blue-300 rounded text-[11px]">
                        {goalie.user.firstName || goalie.user.displayName} (G)
                      </span>
                    )}
                    {teamPicks.map((p) => {
                      if (p.forfeited)
                        return (
                          <span
                            key={p.id}
                            className="px-2 py-0.5 bg-muted text-muted-foreground rounded text-[11px] italic"
                          >
                            R{p.round} forfeit
                          </span>
                        );
                      const player = p.playerId ? memberById.get(p.playerId) : null;
                      return (
                        <button
                          key={p.id}
                          onClick={() => p.playerId && setCardUserId(p.playerId)}
                          className={`px-2 py-0.5 rounded text-[11px] ${
                            p.isAutoBuddy
                              ? "bg-pink-500/15 text-pink-700 dark:text-pink-300"
                              : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                          }`}
                          data-testid={`pick-chip-${p.id}`}
                        >
                          {player?.user.firstName || player?.user.displayName || "?"}
                          {p.isAutoBuddy && " ♥"}
                          {p.expiredAutoPick && " ⏱"}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {/* Card overlay */}
      {cardUserId && (
        <PlayerCardOverlay
          draftId={draftId!}
          userId={cardUserId}
          onClose={() => setCardUserId(null)}
          canPick={canPick && draft.status === "active" && !draftedSet.has(cardUserId)}
          onPick={() => pickMutation.mutate(cardUserId)}
          isPicking={pickMutation.isPending}
        />
      )}

      {/* Chat drawer */}
      {showChat && (
        <div
          className="fixed inset-0 z-40 bg-black/40 flex items-end"
          onClick={() => setShowChat(false)}
        >
          <div
            className="w-full bg-background rounded-t-2xl max-h-[70vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-3 border-b border-border flex items-center justify-between">
              <h3 className="font-bold">Draft Chat</h3>
              <button
                onClick={() => setShowChat(false)}
                className="p-1"
                data-testid="button-close-chat"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {bundle.chatMessages.length === 0 && (
                <p className="text-sm text-muted-foreground text-center">No messages yet.</p>
              )}
              {bundle.chatMessages.map((msg) => {
                const author = memberById.get(msg.userId);
                return (
                  <div key={msg.id} className="text-sm" data-testid={`chat-msg-${msg.id}`}>
                    <span className="font-semibold">
                      {author?.user.firstName || author?.user.displayName || "Player"}:
                    </span>{" "}
                    {msg.body}
                  </div>
                );
              })}
              <div ref={chatEndRef} />
            </div>
            <div className="p-3 border-t border-border flex gap-2">
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendChat()}
                placeholder="Message captains…"
                className="flex-1 p-2 bg-card border border-border rounded text-sm"
                data-testid="input-chat"
              />
              <button
                onClick={sendChat}
                className="px-3 py-2 bg-primary text-primary-foreground rounded"
                data-testid="button-send-chat"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface CardData {
  user: any;
  membership: any;
  stats: any[];
  note: string;
  leagueId: string;
}

function PlayerCardOverlay({
  draftId,
  userId,
  onClose,
  canPick,
  onPick,
  isPicking,
}: {
  draftId: string;
  userId: string;
  onClose: () => void;
  canPick: boolean;
  onPick: () => void;
  isPicking: boolean;
}) {
  const { data, isLoading } = useQuery<CardData>({
    queryKey: ["/api/drafts", draftId, "players", userId, "card"],
    enabled: !!draftId && !!userId,
  });

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-sm"
        onClick={(e) => e.stopPropagation()}
        data-testid="player-card-overlay"
      >
        {/* Trading-card frame */}
        <div className="relative bg-gradient-to-br from-amber-300 via-amber-100 to-amber-400 dark:from-amber-700 dark:via-amber-900 dark:to-amber-800 rounded-2xl p-3 shadow-2xl ring-4 ring-amber-500/40">
          <div className="bg-gradient-to-b from-blue-600 to-blue-900 rounded-xl overflow-hidden">
            {/* Header */}
            <div className="p-3 text-white flex items-center justify-between">
              <span className="text-xs uppercase tracking-widest font-bold opacity-80">
                Roster
              </span>
              <button
                onClick={onClose}
                className="p-1 hover:bg-white/10 rounded"
                data-testid="button-close-card"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {/* Photo */}
            <div className="aspect-[3/4] bg-gradient-to-b from-blue-400 to-blue-700 relative overflow-hidden">
              {data?.user.profileImageUrl ? (
                <img
                  src={getImageUrl(data.user.profileImageUrl) || ""}
                  alt=""
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-6xl font-bold text-white/60">
                  {(data?.user.firstName?.[0] || "?").toUpperCase()}
                </div>
              )}
              {/* Name banner */}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-3">
                <div className="text-white text-xl font-black tracking-tight">
                  {data?.user.firstName || ""}{" "}
                  <span className="opacity-80">{data?.user.lastName || ""}</span>
                </div>
                <div className="text-white/70 text-xs uppercase tracking-wider">
                  {data?.membership?.isGoalie ? "Goaltender" : data?.membership?.position || "Skater"}
                </div>
              </div>
            </div>
            {/* Stats grid */}
            <div className="bg-white dark:bg-zinc-900 p-3">
              {isLoading ? (
                <div className="h-20 flex items-center justify-center text-sm text-muted-foreground">
                  Loading…
                </div>
              ) : (
                <>
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="text-muted-foreground border-b border-border">
                        <th className="text-left font-medium py-1">YEAR</th>
                        <th className="text-left font-medium py-1">TEAM</th>
                        <th className="text-right font-medium py-1">GP</th>
                        <th className="text-right font-medium py-1">G</th>
                        <th className="text-right font-medium py-1">A</th>
                        <th className="text-right font-medium py-1">PTS</th>
                        <th className="text-right font-medium py-1">+/-</th>
                        <th className="text-right font-medium py-1">PIM</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data?.stats?.length ? data.stats : [null]).map(
                        (s: any, i: number) => (
                          <tr key={i} className="border-b border-border last:border-b-0">
                            <td className="py-1">{s?.year || "—"}</td>
                            <td className="py-1 truncate max-w-[60px]">
                              {s?.teamName || "—"}
                            </td>
                            <td className="py-1 text-right">{s?.gamesPlayed ?? "—"}</td>
                            <td className="py-1 text-right font-bold">{s?.goals ?? "—"}</td>
                            <td className="py-1 text-right font-bold">{s?.assists ?? "—"}</td>
                            <td className="py-1 text-right font-bold">
                              {s?.goals != null && s?.assists != null
                                ? s.goals + s.assists
                                : "—"}
                            </td>
                            <td className="py-1 text-right">{s?.plusMinus ?? "—"}</td>
                            <td className="py-1 text-right">{s?.penaltyMinutes ?? "—"}</td>
                          </tr>
                        ),
                      )}
                    </tbody>
                  </table>
                  {data?.note && (
                    <div className="mt-2 p-2 bg-amber-50 dark:bg-amber-900/30 border-l-2 border-amber-500 text-[11px] italic">
                      {data.note}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {canPick && (
          <button
            onClick={onPick}
            disabled={isPicking}
            className="mt-4 w-full px-4 py-3 bg-primary text-primary-foreground rounded-lg font-bold text-base disabled:opacity-50"
            data-testid="button-draft-this-player"
          >
            {isPicking ? "Drafting…" : `Draft ${data?.user.firstName || "Player"}`}
          </button>
        )}
      </div>
    </div>
  );
}
