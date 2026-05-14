import { useEffect, useState, useMemo, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useWebSocket } from "@/context/WebSocketContext";
import { apiRequest, getImageUrl } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  Undo2,
  CheckCircle2,
  Hourglass,
  Zap,
  StickyNote,
  Shield,
  OctagonX,
  Link2,
  List,
} from "lucide-react";

const UNDO_WINDOW_MS = 30_000;

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
  nextTimerOverride?: number | null;
  goalieAssignments: Record<string, string>;
  captainAssignments?: Record<string, string> | null;
  playerNotes: Record<string, string>;
  skillRankingEnabled: boolean;
  skillScale: string | null;
  captainReadyState?: Record<string, boolean> | null;
  buzzerExtensionState?: {
    currentPickExtended?: boolean;
    halvedNextTurn?: Record<string, boolean>;
  } | null;
  timerExpiryRule?: "auto_pick" | "halve_next" | null;
  launchAt?: string | null;
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
  /** Fresh team data (id, name, captainId) for every team in draftOrder. */
  draftOrderTeams?: { id: string; name: string; captainId: string | null }[];
  /**
   * Server-computed team ID for which the requesting viewer is the captain.
   * Only present on the initial REST load (not on WS broadcasts).
   * Avoids UUID mismatches where users.id ≠ Supabase JWT sub.
   */
  myCaptainTeamId?: string | null;
}

export default function DraftRoom() {
  const { draftId } = useParams<{ draftId: string }>();
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const ws = useWebSocket();

  const [bundle, setBundle] = useState<DraftStateBundle | null>(null);
  // Server-computed captain team ID — set once from the REST load and preserved
  // through subsequent WS bundle replacements (WS bundles are not personalized).
  const [myCaptainTeamId, setMyCaptainTeamId] = useState<string | null>(null);
  const [tickNow, setTickNow] = useState(Date.now());
  const [chatInput, setChatInput] = useState("");
  const [showChat, setShowChat] = useState(false);
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const showChatRef = useRef(false);
  useEffect(() => {
    showChatRef.current = showChat;
    if (showChat) setUnreadChatCount(0);
  }, [showChat]);
  const [cardUserId, setCardUserId] = useState<string | null>(null);
  const [teamPanelId, setTeamPanelId] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<"players" | "rosters">("players");
  const [pendingPickUserId, setPendingPickUserId] = useState<string | null>(null);

  // Filter & sort state for the player carousel
  const [filterPos, setFilterPos] = useState<string>("all");
  const [filterHanded, setFilterHanded] = useState<string>("any");
  const [filterMinPoints, setFilterMinPoints] = useState<number>(0);
  const [filterSkill, setFilterSkill] = useState<string>("all");
  const [sortField, setSortField] = useState<"name" | "points" | "position">("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const carouselRef = useRef<HTMLDivElement>(null);
  // Pick announcement modal: shown for 2s whenever any captain makes a pick
  // so every other captain gets a quick "X drafted by Team Y" notice.
  const [lastPick, setLastPick] = useState<{
    teamId: string;
    playerId: string | null;
    round: number;
    pick: number;
    isAutoPick: boolean;
  } | null>(null);
  useEffect(() => {
    if (!lastPick) return;
    const id = setTimeout(() => setLastPick(null), 2000);
    return () => clearTimeout(id);
  }, [lastPick]);

  // "All captains ready" launch countdown — ms timestamp when the draft auto-starts.
  // Set from the bundle (for late-joining clients) and from the draft_all_ready WS event.
  const [launchAt, setLaunchAt] = useState<number | null>(null);

  // In-room buzzer banner: shown for ~6s when the engine fires
  // draft_buzzer_extension on this draft.
  const [buzzerBanner, setBuzzerBanner] = useState<{ at: number } | null>(null);
  useEffect(() => {
    if (!buzzerBanner) return;
    const id = setTimeout(() => setBuzzerBanner(null), 6000);
    return () => clearTimeout(id);
  }, [buzzerBanner]);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const serverDriftRef = useRef(0);

  // Initial fetch — poll every 5 s as a fallback safety net so late-joiners
  // and mobile browsers that backgrounded the app stay in sync even if their
  // WS subscription was briefly lost.
  const { data: initialBundle, isLoading } = useQuery<DraftStateBundle>({
    queryKey: ["/api/drafts", draftId],
    enabled: !!draftId,
    refetchInterval: 5000,
  });

  useEffect(() => {
    if (initialBundle) {
      setBundle(initialBundle);
      serverDriftRef.current = Date.now() - initialBundle.serverTime;
      // Capture the server-computed captain team ID (only present on REST loads).
      // We store it in separate state so WS bundle replacements don't erase it.
      if (initialBundle.myCaptainTeamId !== undefined) {
        setMyCaptainTeamId(initialBundle.myCaptainTeamId ?? null);
      }
      // Hydrate launchAt for clients that join mid-countdown
      if (initialBundle.draft?.launchAt) {
        const ms = new Date(initialBundle.draft.launchAt).getTime();
        setLaunchAt(ms > Date.now() ? ms : null);
      } else {
        setLaunchAt(null);
      }
    }
  }, [initialBundle]);

  // Subscribe to draft on WebSocket — and re-subscribe on every reconnect so
  // captains who opened the page before the WS handshake completed (e.g. via
  // push notification) still receive real-time updates.
  useEffect(() => {
    if (!draftId) return;
    ws.send({ type: "draft_subscribe", draftId });
    // Re-send subscription any time the WS reconnects (fires after onopen)
    const offReconnect = ws.onConnected(() => {
      ws.send({ type: "draft_subscribe", draftId });
    });
    const offState = ws.subscribe("draft_state", (data: any) => {
      if (data.payload?.draft?.id === draftId) {
        setBundle(data.payload);
        serverDriftRef.current = Date.now() - data.payload.serverTime;
        // Capture myCaptainTeamId when present (personalized draft_subscribe response).
        // WS broadcasts don't carry it, so only update state when it's explicitly set.
        if (data.payload.myCaptainTeamId !== undefined) {
          setMyCaptainTeamId(data.payload.myCaptainTeamId ?? null);
        }
      }
    });
    const offPick = ws.subscribe("draft_pick_made", (data: any) => {
      if (data.payload?.draftId !== draftId) return;
      const { teamId, playerId, round, pick, isAutoPick } = data.payload;
      // Bump `at` so React re-runs the auto-dismiss timer even when the same
      // (teamId, playerId) pair somehow arrives twice (idempotent ws replays).
      setLastPick({ teamId, playerId: playerId ?? null, round, pick, isAutoPick: !!isAutoPick });
    });
    const offChat = ws.subscribe("draft_chat", (data: any) => {
      if (!data.payload || data.payload.draftId !== draftId) return;
      setBundle((prev) => {
        if (!prev) return prev;
        if (prev.chatMessages.some((m) => m.id === data.payload.id)) return prev;
        if (!showChatRef.current && data.payload.userId !== user?.id) {
          setUnreadChatCount((c) => c + 1);
        }
        return { ...prev, chatMessages: [...prev.chatMessages, data.payload] };
      });
    });
    const offTick = ws.subscribe("draft_tick", (data: any) => {
      if (data.payload?.draftId !== draftId) return;
      setTickNow(Date.now());
    });
    const offDone = ws.subscribe("draft_completed", (data: any) => {
      if (data.payload?.draftId !== draftId) return;
      toast({ title: "Draft complete!", description: "Rosters have been finalized." });
      // Refresh league + team rosters so the assigned players show up
      // immediately in the league management UI.
      queryClient.invalidateQueries({ queryKey: ["/api/drafts", draftId] });
      queryClient.invalidateQueries({ queryKey: ["/api/user/league-memberships"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user/teams"] });
    });
    const offBuzzer = ws.subscribe("draft_buzzer_extension", (data: any) => {
      if (data.payload?.draftId !== draftId) return;
      setBuzzerBanner({ at: Date.now() });
      toast({
        title: "Buzzer! +30s",
        description:
          "The captain on the clock got a 30-second extension — but their next pick's timer will be halved.",
      });
    });
    // When the draft transitions to the captain-ready lobby, force a re-fetch
    // so captains who are already on the page see the lobby immediately.
    const offAwaitingCaptains = ws.subscribe("draft_awaiting_captains", (data: any) => {
      if (data.payload?.draftId !== draftId) return;
      queryClient.invalidateQueries({ queryKey: ["/api/drafts", draftId] });
    });
    const offAllReady = ws.subscribe("draft_all_ready", (data: any) => {
      if (data.payload?.draftId !== draftId) return;
      // Kick off the simultaneous countdown on all clients
      setLaunchAt(data.payload.launchAt as number);
      queryClient.invalidateQueries({ queryKey: ["/api/drafts", draftId] });
    });
    const offLobbyCancel = ws.subscribe("draft_lobby_cancelled", (data: any) => {
      if (data.payload?.draftId !== draftId) return;
      setLaunchAt(null);
      queryClient.invalidateQueries({ queryKey: ["/api/drafts", draftId] });
    });
    return () => {
      ws.send({ type: "draft_unsubscribe", draftId });
      offReconnect();
      offState();
      offPick();
      offChat();
      offTick();
      offDone();
      offBuzzer();
      offAwaitingCaptains();
      offAllReady();
      offLobbyCancel();
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

  // ── Vertical coverflow effect ──
  // Continuously update each carousel slot's --prox CSS variable based on its
  // distance from the viewport center. The card consumes that variable to
  // drive scale + opacity, producing a smooth coverflow look where the
  // centered card is large/bright and cards above/below shrink and dim.
  useEffect(() => {
    if (activeView !== "players") return;
    const el = carouselRef.current;
    if (!el) return;

    // ── 120Hz-ready scroll loop ──
    // Three big wins over the previous version:
    //  1. We write `transform`/`opacity`/`filter` directly as their final
    //     computed values, bypassing CSS variable + calc() resolution.
    //     calc() per-property is re-evaluated on every style invalidation
    //     and was a big chunk of the per-frame cost.
    //  2. We binary-search for the centered slot from cached `mid` offsets
    //     and only update slots within a small window (±visibleCount + 2)
    //     around it. Off-window slots are reset to "edge" state once and
    //     then left alone — no per-frame writes for distant cards.
    //  3. We diff against the last value we wrote per slot (`lastProx`) and
    //     skip the style writes entirely when the change is below visual
    //     resolution. At 120Hz this cuts mutations roughly in half.
    type SlotEntry = {
      node: HTMLElement;
      mid: number;
      lastProx: number;
      lastDir: number;
      lastZi: number;
      inWindow: boolean;
    };
    let cache: SlotEntry[] = [];
    let raf = 0;
    let lastScrollTop = -1;

    const writeSlot = (s: SlotEntry, dist: number, dir: number) => {
      // Mirror the visual constants from the inline default style.
      const scale = 1 - dist * 0.45;
      const ty = dist * dir * -75;
      const opacity = 1 - dist * 0.75;
      const style = s.node.style;
      // Single-property writes — no calc() resolution.
      // scale3d is explicit 3D → guaranteed GPU compositor path.
      style.transform = `translate3d(0,${ty.toFixed(1)}px,0) scale3d(${scale.toFixed(3)},${scale.toFixed(3)},1)`;
      style.opacity = opacity.toFixed(3);
      // NOTE: filter/drop-shadow intentionally removed — it forces a new
      // off-screen GPU texture allocation on every change and is the single
      // biggest source of frame drops. Visual depth comes from scale +
      // opacity + the static box-shadow on the inner card instead.
      //
      // Only write z-index when the integer bucket actually changes — it
      // can trigger stacking-context recalculations even on composited layers.
      const zi = dist < 0.999 ? ((1 - dist) * 30) | 0 : 0;
      if (zi !== s.lastZi) {
        style.zIndex = String(zi);
        s.lastZi = zi;
      }
      s.lastProx = dist;
      s.lastDir = dir;
    };

    const rebuildCache = () => {
      const slots = el.querySelectorAll<HTMLElement>("[data-carousel-slot]");
      const next: SlotEntry[] = new Array(slots.length);
      for (let i = 0; i < slots.length; i++) {
        const node = slots[i];
        next[i] = {
          node,
          mid: node.offsetTop + node.offsetHeight / 2,
          lastProx: -1,
          lastDir: 0,
          lastZi: -1,
          inWindow: false,
        };
      }
      cache = next;
      lastScrollTop = -1; // force a recompute next frame
    };

    const update = () => {
      raf = 0;
      const len = cache.length;
      if (len === 0) return;
      const containerH = el.clientHeight;
      if (containerH <= 0) return;
      const scrollTop = el.scrollTop;
      // Bail when nothing has actually changed since the last write — saves
      // a full pass when scroll fires spuriously (momentum settling, etc).
      if (scrollTop === lastScrollTop) return;
      lastScrollTop = scrollTop;

      const scrollMid = scrollTop + containerH / 2;
      const maxDist = containerH / 2;

      // Binary search for the slot whose mid is closest to scrollMid.
      let lo = 0,
        hi = len - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (cache[mid].mid < scrollMid) lo = mid + 1;
        else hi = mid;
      }
      const centerIdx = lo;

      // ~5 cards span the screen at 100px each on a typical viewport;
      // pad a bit so cards sliding into view animate smoothly.
      const windowSize = Math.max(6, Math.ceil(containerH / 100) + 2);
      const start = Math.max(0, centerIdx - windowSize);
      const end = Math.min(len - 1, centerIdx + windowSize);

      // Reset any slots that just left the active window — without this
      // they'd hold stale mid-animation values when scrolling fast.
      for (let i = 0; i < len; i++) {
        const s = cache[i];
        const inNow = i >= start && i <= end;
        if (s.inWindow && !inNow && s.lastProx < 0.999) {
          writeSlot(s, 1, 0);
        }
        s.inWindow = inNow;
      }

      // Update only slots in the active window.
      for (let i = start; i <= end; i++) {
        const s = cache[i];
        const delta = s.mid - scrollMid;
        const abs = delta < 0 ? -delta : delta;
        const dist = abs >= maxDist ? 1 : abs / maxDist;
        const dir = delta < 0 ? -1 : delta > 0 ? 1 : 0;
        // Skip writes when the change is below visual resolution (≈half a
        // percent of the dist range). At 120Hz this routinely halves the
        // number of style mutations during slow scrolls.
        if (dir === s.lastDir && Math.abs(dist - s.lastProx) < 0.005) continue;
        writeSlot(s, dist, dir);
      }
    };

    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(update);
    };

    const onResize = () => {
      rebuildCache();
      onScroll();
    };

    rebuildCache();
    update();

    el.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);

    const mo = new MutationObserver(() => {
      rebuildCache();
      onScroll();
    });
    mo.observe(el, { childList: true });

    return () => {
      el.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      mo.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [activeView, bundle?.draft?.status]);

  // League data: teams, members, league
  const draft = bundle?.draft;
  const { data: teams = [] } = useQuery<any[]>({
    queryKey: ["/api/leagues", draft?.leagueId, "teams"],
    enabled: !!draft?.leagueId,
  });
  const { data: members = [] } = useQuery<any[]>({
    queryKey: [
      "/api/leagues",
      draft?.leagueId,
      `draft-players?draftId=${draftId ?? ""}${draft?.seasonId ? `&seasonId=${draft.seasonId}` : ""}`,
    ],
    enabled: !!draft?.leagueId && !!draftId,
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
  // Use the server-computed myCaptainTeamId (set from the verified JWT sub) as
  // the authoritative check for "is it my turn to pick". This handles accounts
  // where users.id !== Supabase JWT sub (e.g. CSV-migrated accounts) where the
  // local t.captainId === user.id comparison silently fails.
  const isCaptainOfPickingTeam =
    !!myCaptainTeamId && bundle?.pickingTeamId === myCaptainTeamId;
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

  const buddyUserIds = useMemo(() => {
    const s = new Set<string>();
    bundle?.buddyPairs.forEach((pair) => pair.userIds.forEach((uid) => s.add(uid)));
    return s;
  }, [bundle?.buddyPairs]);

  // All members for the carousel — drafted players & excluded goalies are
  // removed entirely so the rolodex always shows the live "remaining pool".
  // Supports client-side filter (position, handed, min-points, skill) and sort.
  const allMembersForCarousel = useMemo(() => {
    if (!members.length) return [];
    const isExcludedGoalie = (m: any) =>
      draft?.goalieMethod &&
      draft.goalieMethod !== "included_with_skaters" &&
      m.membership.isGoalie;

    let list = members.filter(
      (m: any) => !draftedSet.has(m.user.id) && !isExcludedGoalie(m),
    );

    // Position filter
    if (filterPos !== "all") {
      list = list.filter((m: any) => {
        const pos =
          (m.membership?.position as string | undefined) ||
          (m.user.position as string | undefined) ||
          "";
        return pos.toLowerCase() === filterPos.toLowerCase();
      });
    }

    // Handed filter
    if (filterHanded !== "any") {
      list = list.filter((m: any) => {
        const shoots =
          (m.user.shoots as string | undefined) ||
          (m.membership?.shoots as string | undefined) ||
          "";
        return shoots.toLowerCase().startsWith(filterHanded.toLowerCase());
      });
    }

    // Min points filter
    if (filterMinPoints > 0) {
      list = list.filter(
        (m: any) =>
          (m.priorStats?.goals ?? 0) + (m.priorStats?.assists ?? 0) >= filterMinPoints,
      );
    }

    // Skill filter
    if (filterSkill !== "all") {
      list = list.filter(
        (m: any) => (m.membership?.skillLevel ?? "") === filterSkill,
      );
    }

    // Sort
    list = list.slice().sort((a: any, b: any) => {
      let cmp = 0;
      if (sortField === "points") {
        const ptA = (a.priorStats?.goals ?? 0) + (a.priorStats?.assists ?? 0);
        const ptB = (b.priorStats?.goals ?? 0) + (b.priorStats?.assists ?? 0);
        cmp = ptA - ptB;
      } else if (sortField === "position") {
        const posA =
          (a.membership?.position as string | undefined) ||
          (a.user.position as string | undefined) ||
          "zzz";
        const posB =
          (b.membership?.position as string | undefined) ||
          (b.user.position as string | undefined) ||
          "zzz";
        cmp = posA.localeCompare(posB);
      } else {
        // name (default)
        const nameA = (
          a.user.lastName ||
          a.user.firstName ||
          a.user.displayName ||
          a.user.email ||
          ""
        )
          .toString()
          .trim()
          .toLowerCase();
        const nameB = (
          b.user.lastName ||
          b.user.firstName ||
          b.user.displayName ||
          b.user.email ||
          ""
        )
          .toString()
          .trim()
          .toLowerCase();
        cmp = nameA.localeCompare(nameB);
      }
      return sortDir === "desc" ? -cmp : cmp;
    });

    return list;
  }, [members, draftedSet, draft, filterPos, filterHanded, filterMinPoints, filterSkill, sortField, sortDir]);

  const pickMutation = useMutation({
    mutationFn: async (playerId: string) => {
      const res = await apiRequest("POST", `/api/drafts/${draftId}/pick`, { playerId });
      return res.json();
    },
    onSuccess: () => {
      setCardUserId(null);
      setPendingPickUserId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/drafts", draftId] });
      if (draft?.leagueId) {
        queryClient.invalidateQueries({ queryKey: ["/api/leagues", draft.leagueId, "teams"] });
        queryClient.invalidateQueries({
          predicate: (q) => {
            const k = q.queryKey;
            return (
              Array.isArray(k) &&
              k[0] === "/api/leagues" &&
              k[1] === draft.leagueId &&
              typeof k[2] === "string" &&
              (k[2] as string).startsWith("draft-players")
            );
          },
        });
      }
    },
    onError: (err: any) => {
      setPendingPickUserId(null);
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
  const [finalizeOpen, setFinalizeOpen] = useState(false);
  const finalizeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/drafts/${draftId}/finalize`, {});
      return res.json();
    },
    onSuccess: (data: { ok: boolean; assigned: number }) => {
      setFinalizeOpen(false);
      toast({
        title: "Draft finalized",
        description:
          data.assigned > 0
            ? `${data.assigned} player${data.assigned === 1 ? "" : "s"} assigned and notified.`
            : "Rosters were already up to date.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/drafts", draftId] });
      if (draft?.leagueId) {
        queryClient.invalidateQueries({ queryKey: ["/api/leagues", draft.leagueId, "teams"] });
        queryClient.invalidateQueries({ queryKey: ["/api/leagues", draft.leagueId] });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/user/league-memberships"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user/teams"] });
    },
    onError: (err: any) =>
      toast({ title: "Failed to finalize", description: err?.message, variant: "destructive" }),
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
  const undoMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/drafts/${draftId}/undo`, {});
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Pick undone", description: "The last pick has been reverted." });
    },
    onError: (err: any) =>
      toast({ title: "Failed to undo", description: err?.message, variant: "destructive" }),
  });
  const captainReadyMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/drafts/${draftId}/captain-ready`, {});
      return res.json();
    },
    onSuccess: () => {
      // Force a re-fetch so the UI updates even if the WebSocket update
      // doesn't arrive (e.g. the captain just landed via push notification).
      queryClient.invalidateQueries({ queryKey: ["/api/drafts", draftId] });
    },
    onError: (err: any) =>
      toast({ title: "Failed to ready up", description: err?.message, variant: "destructive" }),
  });
  const beginMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/drafts/${draftId}/begin`, {});
      return res.json();
    },
    onError: (err: any) =>
      toast({ title: "Failed to begin draft", description: err?.message, variant: "destructive" }),
  });
  const resendInvitesMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/drafts/${draftId}/resend-ready`, {});
      return res.json();
    },
    onSuccess: (data: any) =>
      toast({
        title: "Invites resent",
        description: `Reminders sent to ${data?.sent ?? 0} captain(s).`,
      }),
    onError: (err: any) =>
      toast({ title: "Failed to resend", description: err?.message, variant: "destructive" }),
  });
  const cancelLobbyMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/drafts/${draftId}/cancel-lobby`, {});
      return res.json();
    },
    onSuccess: () =>
      toast({ title: "Lobby cancelled", description: "Draft is back in setup." }),
    onError: (err: any) =>
      toast({ title: "Failed to cancel", description: err?.message, variant: "destructive" }),
  });
  const terminateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/drafts/${draftId}/terminate`, {});
      return res.json();
    },
    onSuccess: () =>
      toast({ title: "Draft terminated", description: "Picks so far have been committed to team rosters." }),
    onError: (err: any) =>
      toast({ title: "Failed to terminate", description: err?.message, variant: "destructive" }),
  });
  const deleteDraftMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", `/api/drafts/${draftId}`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Draft deleted" });
      setLocation("/");
    },
    onError: (err: any) =>
      toast({ title: "Failed to delete draft", description: err?.message, variant: "destructive" }),
  });

  const sendChat = async () => {
    const trimmed = chatInput.trim();
    if (!trimmed || !draftId) return;
    setChatInput("");
    try {
      const res = await apiRequest("POST", `/api/drafts/${draftId}/chat`, { body: trimmed });
      const json = await res.json().catch(() => null);
      const row = json?.message;
      if (row?.id) {
        setBundle((prev) => {
          if (!prev) return prev;
          if (prev.chatMessages.some((m) => m.id === row.id)) return prev;
          return { ...prev, chatMessages: [...prev.chatMessages, row] };
        });
      }
    } catch (err: any) {
      setChatInput(trimmed);
      toast({
        title: "Couldn't send message",
        description: err?.message || "Please try again.",
        variant: "destructive",
      });
    }
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
  // When the draft is paused, the server clears `currentTurnDeadline` and
  // stashes the remaining seconds in `nextTimerOverride`. Show that frozen
  // value so the timer visibly *stops* instead of ticking down to 0:00.
  const remainingSec =
    draft.status === "paused" && typeof draft.nextTimerOverride === "number"
      ? Math.max(0, draft.nextTimerOverride)
      : deadlineMs
        ? Math.max(0, Math.floor((deadlineMs - tickNow + serverDriftRef.current) / 1000))
        : 0;
  const totalSec = draft.timePerPick || 60;
  const pct = Math.min(100, Math.max(0, (remainingSec / totalSec) * 100));
  const pickingTeam = bundle.pickingTeamId ? teamById.get(bundle.pickingTeamId) : null;
  const pickingCaptain = pickingTeam?.captainId ? memberById.get(pickingTeam.captainId) : null;

  // Most recent primary pick (commissioner can undo this within UNDO_WINDOW_MS).
  const lastPrimaryPick = bundle.picks
    .filter((p) => !p.isAutoBuddy && !p.forfeited && p.playerId)
    .reduce<DraftPick | null>((latest, p) => {
      if (!latest) return p;
      return new Date(p.pickedAt).getTime() > new Date(latest.pickedAt).getTime() ? p : latest;
    }, null);
  const undoSecondsLeft = lastPrimaryPick
    ? Math.max(
        0,
        Math.ceil(
          (UNDO_WINDOW_MS -
            (tickNow + serverDriftRef.current - new Date(lastPrimaryPick.pickedAt).getTime())) /
            1000,
        ),
      )
    : 0;
  const canUndo =
    isCommissioner && draft.status === "active" && !!lastPrimaryPick && undoSecondsLeft > 0;
  const undonePlayer =
    lastPrimaryPick?.playerId ? memberById.get(lastPrimaryPick.playerId) : null;

  return (
    <div className="h-dvh flex flex-col bg-background overflow-hidden">
      {/* Buzzer banner — shown for ~6s after a halve_next timer expiry */}
      {buzzerBanner && (
        <div
          className="shrink-0 z-40 bg-amber-500 text-amber-950 dark:bg-amber-400 dark:text-black px-4 py-2 flex items-center gap-2 font-semibold text-sm animate-pulse border-b border-amber-700/40"
          data-testid="buzzer-banner"
        >
          <Zap className="w-4 h-4 flex-shrink-0" />
          <span>
            Buzzer! +30 seconds added — captain's next pick will be on a halved
            timer.
          </span>
        </div>
      )}
      {/* Header */}
      <div className="shrink-0 z-30 bg-background border-b border-border">
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
            {canUndo && (
              <button
                onClick={() => {
                  const name =
                    undonePlayer?.user.firstName ||
                    undonePlayer?.user.displayName ||
                    "the last pick";
                  if (
                    window.confirm(
                      `Undo ${name}? You have ${undoSecondsLeft}s left to revert this pick.`,
                    )
                  ) {
                    undoMutation.mutate();
                  }
                }}
                disabled={undoMutation.isPending}
                className="px-2 py-1.5 hover:bg-muted rounded text-xs font-medium flex items-center gap-1 text-amber-600 dark:text-amber-400 disabled:opacity-50"
                title={`Undo last pick (${undoSecondsLeft}s left)`}
                data-testid="button-undo-pick"
              >
                <Undo2 className="w-4 h-4" />
                <span className="font-mono">{undoSecondsLeft}s</span>
              </button>
            )}
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
            {isCommissioner && (draft.status === "active" || draft.status === "paused") && (
              <button
                onClick={() => {
                  if (
                    window.confirm(
                      "Terminate this draft? All picks made so far will be committed to team rosters and the draft will end immediately. This cannot be undone."
                    )
                  ) {
                    terminateMutation.mutate();
                  }
                }}
                disabled={terminateMutation.isPending}
                className="p-2 hover:bg-red-500/10 text-red-500 rounded disabled:opacity-50"
                title="Terminate draft early"
                data-testid="button-terminate-draft"
              >
                <OctagonX className="w-5 h-5" />
              </button>
            )}
            {isCommissioner && draft.status === "pending" && (
              <>
                <button
                  onClick={() => {
                    if (
                      window.confirm(
                        "Delete this draft? All setup (captain assignments, buddy pairs, player notes) will be permanently removed. This cannot be undone."
                      )
                    ) {
                      deleteDraftMutation.mutate();
                    }
                  }}
                  disabled={deleteDraftMutation.isPending}
                  className="p-2 hover:bg-red-500/10 text-red-500 rounded disabled:opacity-50"
                  title="Delete this draft"
                  data-testid="button-delete-draft"
                >
                  <OctagonX className="w-5 h-5" />
                </button>
                <button
                  onClick={() => startMutation.mutate()}
                  className="px-3 py-1.5 bg-primary text-primary-foreground rounded text-sm font-medium flex items-center gap-1"
                  data-testid="button-start-draft"
                >
                  <Snowflake className="w-4 h-4" /> Start
                </button>
              </>
            )}
            {isCommissioner && draft.status === "awaiting_captains" && (() => {
              const ready = (draft.captainReadyState || {}) as Record<string, boolean>;
              // Prefer server-authoritative team data from the bundle; fall back to the
              // separate teams cache only if the bundle predates this feature.
              const lobbyTeams = bundle?.draftOrderTeams ?? teams.filter((t: any) => draft.draftOrder.includes(t.id));
              const captainIds = lobbyTeams
                .map((t: any) => t.captainId)
                .filter(Boolean) as string[];
              // Match server logic: when there are no captains assigned the
              // server will accept /begin, so we don't dead-end the UI; if a
              // commissioner manages to reach the lobby with zero captains we
              // surface a clearer hint instead of a permanently disabled button.
              const noCaptains = captainIds.length === 0;
              const allReady = noCaptains || captainIds.every((cid) => ready[cid]);
              const countingDown = launchAt != null;
              return (
                <button
                  onClick={() => beginMutation.mutate()}
                  disabled={!allReady || beginMutation.isPending}
                  className="px-3 py-1.5 bg-primary text-primary-foreground rounded text-sm font-medium flex items-center gap-1 disabled:opacity-50"
                  data-testid="button-begin-draft"
                  title={
                    noCaptains
                      ? "No captains assigned — assign captains in setup if you need a captain-ready lobby"
                      : countingDown
                        ? "Skip the countdown and begin the draft now"
                        : allReady
                          ? "All captains are ready — begin the draft"
                          : "Waiting for all captains to confirm READY"
                  }
                >
                  <Snowflake className="w-4 h-4" />
                  {countingDown ? "Begin now" : "Begin"}
                </button>
              );
            })()}
            <button
              onClick={() => setShowChat(true)}
              className="p-2 hover:bg-muted rounded relative"
              data-testid="button-open-chat"
            >
              <MessageCircle className="w-5 h-5" />
              {unreadChatCount > 0 && (
                <span
                  className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] font-semibold rounded-full px-1 min-w-[16px] text-center"
                  data-testid="badge-chat-unread"
                >
                  {unreadChatCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* YOUR TURN banner — shown only to the captain who is on the clock */}
        {draft.status === "active" && isCaptainOfPickingTeam && (
          <div
            className="mx-3 mb-1 px-3 py-2 rounded-lg bg-primary text-primary-foreground flex items-center justify-center gap-2 font-black text-sm tracking-wide animate-pulse"
            data-testid="banner-your-turn"
          >
            <Crown className="w-4 h-4 flex-shrink-0" />
            IT'S YOUR TURN TO PICK!
          </div>
        )}

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
          <div className="px-3 pb-2 flex flex-col items-center gap-2">
            <div className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
              <Trophy className="inline w-4 h-4 mr-1" /> Draft complete! Rosters finalized.
            </div>
            {isCommissioner && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setFinalizeOpen(true)}
                disabled={finalizeMutation.isPending}
                data-testid="button-finalize-draft"
              >
                {finalizeMutation.isPending
                  ? "Finalizing…"
                  : "Re-finalize & notify drafted players"}
              </Button>
            )}
          </div>
        )}
        {draft.status === "awaiting_captains" && (
          <div className="px-3 pb-2 text-center text-xs text-muted-foreground flex items-center justify-center gap-1">
            <Hourglass className="w-3 h-3" /> Waiting for captains to confirm READY
          </div>
        )}
      </div>

      {/* Main content — carousel layout for active/paused, scroll layout otherwise */}
      {(draft.status === "active" || draft.status === "paused") ? (
        <div className="flex-1 min-h-0 flex flex-col">
          {/* Tab bar */}
          <div className="shrink-0 flex border-b border-border bg-background">
            <button
              onClick={() => setActiveView("players")}
              className={`flex-1 py-2.5 text-sm font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                activeView === "players"
                  ? "border-b-2 border-primary text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              data-testid="tab-players"
            >
              <Users className="w-3.5 h-3.5" />
              Players ({availablePlayers.length})
            </button>
            <button
              onClick={() => setActiveView("rosters")}
              className={`flex-1 py-2.5 text-sm font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                activeView === "rosters"
                  ? "border-b-2 border-primary text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              data-testid="tab-rosters"
            >
              <List className="w-3.5 h-3.5" />
              Rosters
            </button>
          </div>

          {/* ── Filter & Sort strip ── */}
          {activeView === "players" && (() => {
            const positions = Array.from(
              new Set(
                members
                  .map(
                    (m: any) =>
                      (m.membership?.position as string | undefined) ||
                      (m.user.position as string | undefined) ||
                      "",
                  )
                  .filter(Boolean),
              ),
            ).sort();
            const skillLevels = Array.from(
              new Set(
                members
                  .map((m: any) => m.membership?.skillLevel as string | undefined)
                  .filter((s): s is string => !!s),
              ),
            ).sort();
            return (
              <div className="shrink-0 flex gap-1.5 overflow-x-auto px-3 py-1.5 border-b border-border scrollbar-none">
                {/* Sort */}
                <select
                  value={`${sortField}:${sortDir}`}
                  onChange={(e) => {
                    const [f, d] = e.target.value.split(":") as [typeof sortField, typeof sortDir];
                    setSortField(f);
                    setSortDir(d);
                  }}
                  className="shrink-0 h-7 px-2 bg-muted border border-border rounded-full text-xs font-medium text-foreground"
                  data-testid="filter-sort"
                >
                  <option value="name:asc">Name A–Z</option>
                  <option value="name:desc">Name Z–A</option>
                  <option value="points:desc">Most Points</option>
                  <option value="points:asc">Fewest Points</option>
                  <option value="position:asc">Position</option>
                </select>

                {/* Position */}
                {positions.length > 0 && (
                  <select
                    value={filterPos}
                    onChange={(e) => setFilterPos(e.target.value)}
                    className="shrink-0 h-7 px-2 bg-muted border border-border rounded-full text-xs font-medium text-foreground"
                    data-testid="filter-position"
                  >
                    <option value="all">All Pos</option>
                    {positions.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                )}

                {/* Handed */}
                {(["any", "L", "R"] as const).map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => setFilterHanded(h)}
                    className={`shrink-0 h-7 px-2.5 rounded-full text-xs font-medium transition-colors ${
                      filterHanded === h
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted border border-border text-foreground hover:bg-muted/70"
                    }`}
                    data-testid={`filter-handed-${h}`}
                  >
                    {h === "any" ? "Shoots: Any" : `${h} hand`}
                  </button>
                ))}

                {/* Min points */}
                <div className="shrink-0 flex items-center gap-1">
                  <span className="text-xs text-muted-foreground whitespace-nowrap">Pts ≥</span>
                  <input
                    type="number"
                    min={0}
                    max={99}
                    value={filterMinPoints || ""}
                    onChange={(e) => setFilterMinPoints(Math.max(0, parseInt(e.target.value) || 0))}
                    placeholder="0"
                    className="w-10 h-7 px-1.5 bg-muted border border-border rounded-full text-xs text-center text-foreground"
                    data-testid="filter-min-points"
                  />
                </div>

                {/* Skill */}
                {skillLevels.length > 0 && (
                  <select
                    value={filterSkill}
                    onChange={(e) => setFilterSkill(e.target.value)}
                    className="shrink-0 h-7 px-2 bg-muted border border-border rounded-full text-xs font-medium text-foreground"
                    data-testid="filter-skill"
                  >
                    <option value="all">All Skill</option>
                    {skillLevels.map((s) => (
                      <option key={s} value={s}>
                        Skill {s}
                      </option>
                    ))}
                  </select>
                )}

                {/* Reset */}
                {(filterPos !== "all" || filterHanded !== "any" || filterMinPoints > 0 || filterSkill !== "all") && (
                  <button
                    type="button"
                    onClick={() => {
                      setFilterPos("all");
                      setFilterHanded("any");
                      setFilterMinPoints(0);
                      setFilterSkill("all");
                    }}
                    className="shrink-0 h-7 px-2.5 rounded-full text-xs font-medium bg-destructive/10 text-destructive border border-destructive/30 hover:bg-destructive/20 transition-colors"
                    data-testid="filter-reset"
                  >
                    Clear
                  </button>
                )}
              </div>
            );
          })()}

          {/* ── Player Rolodex Carousel ── */}
          {activeView === "players" && (
            <div
              ref={carouselRef}
              className="flex-1 min-h-0 overflow-y-scroll overscroll-contain"
              style={{
                scrollSnapType: "y mandatory",
                WebkitOverflowScrolling: "touch",
                // Trap all card z-indexes / GPU compositor layers inside
                // this scroller's own stacking context. Without this, the
                // cards can render *above* a body-level portaled dialog on
                // iOS Safari regardless of z-index.
                isolation: "isolate",
                position: "relative",
                zIndex: 0,
                // Promote the scroller itself to a GPU compositor layer so
                // scroll events and JS-driven style writes both land on the
                // same layer — eliminates layer-upload jank on fast flicks.
                willChange: "scroll-position",
                transform: "translateZ(0)",
              }}
              data-testid="player-carousel"
            >
              {/* Top spacer — lets first card snap to center */}
              <div style={{ height: "calc(50dvh - 66px)", minHeight: 16 }} aria-hidden="true" />

              {allMembersForCarousel.map((m: any) => {
                const hasBuddy = buddyUserIds.has(m.user.id);
                const initial = (m.user.firstName?.[0] || m.user.email?.[0] || "?").toUpperCase();
                // Compute age — prefer user.age, otherwise derive from
                // dateOfBirth (YYYY-MM-DD or ISO). Fall back to "N/A".
                let ageDisplay: string = "N/A";
                if (typeof m.user.age === "number" && m.user.age > 0) {
                  ageDisplay = String(m.user.age);
                } else if (m.user.dateOfBirth) {
                  const dob = new Date(m.user.dateOfBirth);
                  if (!isNaN(dob.getTime())) {
                    const now = new Date();
                    let yrs = now.getFullYear() - dob.getFullYear();
                    const mDiff = now.getMonth() - dob.getMonth();
                    if (mDiff < 0 || (mDiff === 0 && now.getDate() < dob.getDate())) yrs--;
                    if (yrs > 0 && yrs < 130) ageDisplay = String(yrs);
                  }
                }
                // "Shoots" isn't tracked on the user profile yet — always
                // show the field so the card layout stays consistent and
                // the user can see when data is missing.
                const shootsDisplay: string =
                  (m.user.shoots as string | undefined) ||
                  (m.membership?.shoots as string | undefined) ||
                  "N/A";
                // Position — prefer the league-membership override (set by
                // the commissioner per league), then the user's profile
                // default. Show "—" when unknown so the card stays uniform.
                const positionDisplay: string =
                  (m.membership?.position as string | undefined) ||
                  (m.user.position as string | undefined) ||
                  "—";
                // Prior season G/A — provided by the draft-players route
                // (computed from the most recent prior season in this
                // league). Defaults to 0/0 when no prior season exists.
                const priorGoals: number = m.priorStats?.goals ?? 0;
                const priorAssists: number = m.priorStats?.assists ?? 0;
                const fullName =
                  [m.user.firstName, m.user.lastName].filter(Boolean).join(" ") ||
                  m.user.displayName ||
                  m.user.email ||
                  "Unknown";
                return (
                  <div
                    key={m.user.id}
                    data-carousel-slot
                    className="relative px-3"
                    style={{
                      scrollSnapAlign: "center",
                      height: 100,
                      // Default "off-center" transform — applied directly
                      // (no CSS vars / calc) so the JS scroll loop can
                      // overwrite these values every frame with no
                      // resolution overhead. NO `transition` on transform/
                      // opacity — they change every frame and any tween
                      // would make the cards lag the finger/wheel.
                      transform: "translate3d(0,0,0) scale3d(0.55,0.55,1)",
                      opacity: "0.25",
                      transformOrigin: "center center",
                      willChange: "transform, opacity",
                      backfaceVisibility: "hidden",
                      // contain isolates layout/paint of each slot from
                      // its neighbors, so a transform write only touches
                      // its own compositor layer.
                      contain: "layout paint",
                    }}
                    data-testid={`carousel-slot-${m.user.id}`}
                  >
                    <div
                      className="h-full rounded-3xl border-2 border-primary/70 bg-card flex items-center gap-3 px-4 cursor-pointer hover:border-primary"
                      onClick={() => setCardUserId(m.user.id)}
                      data-testid={`player-card-${m.user.id}`}
                      style={{
                        transition: "border-color 200ms ease-out",
                        // Static box-shadow replaces the animated drop-shadow
                        // filter. box-shadow composites cheaply on the GPU
                        // layer without requiring a per-frame off-screen
                        // texture blit. It naturally fades with the slot's
                        // animated opacity.
                        boxShadow: "0 6px 20px -4px rgba(0,0,0,0.35)",
                      }}
                    >
                      {/* Avatar */}
                      <div className="w-12 h-12 rounded-full bg-muted flex-shrink-0 overflow-hidden flex items-center justify-center border border-border">
                        {m.user.profileImageUrl ? (
                          <img
                            src={getImageUrl(m.user.profileImageUrl) || ""}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span className="text-lg font-black text-muted-foreground">{initial}</span>
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div
                          className="text-lg font-black leading-tight truncate tracking-tight"
                          data-testid={`player-name-${m.user.id}`}
                        >
                          {fullName}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                          <span
                            className="font-bold text-foreground"
                            data-testid={`player-position-${m.user.id}`}
                          >
                            {positionDisplay}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span data-testid={`player-age-${m.user.id}`}>
                            Age {ageDisplay}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span data-testid={`player-shoots-${m.user.id}`}>
                            {shootsDisplay}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span
                            className="font-semibold text-foreground"
                            data-testid={`player-prior-stats-${m.user.id}`}
                            title="Prior season goals & assists"
                          >
                            {priorGoals}G {priorAssists}A
                          </span>
                          {m.membership.isGoalie && (
                            <span className="px-1.5 py-0.5 bg-blue-500/20 text-blue-600 dark:text-blue-300 rounded text-[10px] font-bold">
                              G
                            </span>
                          )}
                          {draft.skillRankingEnabled && m.membership.skillLevel && (
                            <span className="px-1.5 py-0.5 bg-amber-500/20 text-amber-700 dark:text-amber-300 rounded text-[10px] font-bold">
                              {m.membership.skillLevel}
                            </span>
                          )}
                          {!!(draft.playerNotes || {})[m.user.id] && (
                            <StickyNote className="w-3 h-3 text-amber-500 flex-shrink-0" />
                          )}
                          {hasBuddy && (
                            <Link2 className="w-3 h-3 text-pink-500 flex-shrink-0" />
                          )}
                        </div>
                      </div>

                      {/* DRAFT button — opens a confirm dialog before picking */}
                      {canPick && draft.status === "active" && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setPendingPickUserId(m.user.id);
                          }}
                          disabled={pickMutation.isPending}
                          className="flex-shrink-0 border-2 border-primary text-primary rounded-lg px-3 py-2 font-black text-xs tracking-widest uppercase
                            hover:bg-primary hover:text-primary-foreground active:bg-primary active:text-primary-foreground
                            transition-colors disabled:opacity-40 disabled:pointer-events-none"
                          data-testid={`button-draft-${m.user.id}`}
                        >
                          DRAFT
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Bottom spacer */}
              <div style={{ height: "calc(50dvh - 66px)", minHeight: 16 }} aria-hidden="true" />
            </div>
          )}

          {/* ── Rosters tab ── */}
          {activeView === "rosters" && (
            <div className="flex-1 overflow-y-auto p-3 pb-6 space-y-2">
              {(draft.draftOrder || []).map((teamId: string, idx: number) => {
                const team = teamById.get(teamId);
                const teamPicks = bundle.picks.filter((p) => p.teamId === teamId);
                const goalieId = draft.goalieAssignments?.[teamId];
                const goalie = goalieId ? memberById.get(goalieId) : null;
                const isPicking = bundle.pickingTeamId === teamId;
                return (
                  <button
                    key={teamId}
                    onClick={() => setTeamPanelId(teamId)}
                    className={`w-full text-left p-3 rounded-lg border ${
                      isPicking ? "border-primary bg-primary/5" : "border-border bg-card"
                    } hover:border-primary transition-colors`}
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
                            <span key={p.id} className="px-2 py-0.5 bg-muted text-muted-foreground rounded text-[11px] italic">
                              R{p.round} forfeit
                            </span>
                          );
                        const player = p.playerId ? memberById.get(p.playerId) : null;
                        return (
                          <span
                            key={p.id}
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
                          </span>
                        );
                      })}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ) : (
      <div className="flex-1 overflow-y-auto p-3 pb-24 space-y-4">
        {/* Captain READY lobby */}
        {draft.status === "awaiting_captains" && (() => {
          const ready = (draft.captainReadyState || {}) as Record<string, boolean>;
          // Prefer server-authoritative team data shipped with every draft_state
          // broadcast. This avoids the race where a captain opens the page from a
          // push notification and the separate /teams cache hasn't resolved yet,
          // which caused myCaptainTeam to be falsy and the "I'm Ready" button to
          // never render for non-first captains.
          const captainTeams = bundle?.draftOrderTeams ?? teams.filter((t: any) =>
            draft.draftOrder.includes(t.id),
          );
          const meReady = !!user && !!ready[user.id];
          // Prefer the server-computed myCaptainTeamId (set from the REST load using
          // the verified JWT sub). This handles cases where users.id ≠ Supabase JWT
          // sub (e.g. accounts migrated from CSV import). Fall back to the local
          // user.id comparison only when the server value hasn't arrived yet.
          const myCaptainTeam = myCaptainTeamId
            ? captainTeams.find((t: any) => t.id === myCaptainTeamId)
            : (!!user && captainTeams.find((t: any) => t.captainId === user.id));
          const readyCount = captainTeams.filter(
            (t: any) => t.captainId && ready[t.captainId],
          ).length;
          // Countdown seconds remaining (driven by the existing tickNow 1-sec interval)
          const secsLeft = launchAt
            ? Math.max(0, Math.ceil((launchAt - tickNow) / 1000))
            : null;
          // SVG ring progress (0–1)
          const RING_R = 44;
          const RING_CIRC = 2 * Math.PI * RING_R;
          const ringProgress = secsLeft != null ? secsLeft / 30 : 0;
          const strokeDash = ringProgress * RING_CIRC;

          return (
            <section
              className="space-y-3"
              data-testid="section-awaiting-captains"
            >
              {/* Countdown ring shown once all captains are ready */}
              {secsLeft != null ? (
                <div className="bg-emerald-500/10 border border-emerald-500/40 rounded-lg p-5 text-center">
                  <div className="relative w-28 h-28 mx-auto mb-3">
                    <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                      {/* Track */}
                      <circle cx="50" cy="50" r={RING_R} fill="none" stroke="currentColor"
                        strokeWidth="8" className="text-emerald-500/20" />
                      {/* Progress arc */}
                      <circle cx="50" cy="50" r={RING_R} fill="none" stroke="currentColor"
                        strokeWidth="8" strokeLinecap="round"
                        className="text-emerald-500 transition-all duration-1000 ease-linear"
                        strokeDasharray={`${strokeDash} ${RING_CIRC}`} />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-3xl font-extrabold tabular-nums text-emerald-600 dark:text-emerald-300">
                        {secsLeft}
                      </span>
                      <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                        sec
                      </span>
                    </div>
                  </div>
                  <h2 className="text-lg font-bold mb-1 text-emerald-700 dark:text-emerald-300">
                    Everyone's ready!
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Draft begins automatically when the countdown hits zero.
                  </p>
                </div>
              ) : (
                <div className="bg-amber-500/10 border border-amber-500/40 rounded-lg p-4 text-center">
                  <Zap className="w-8 h-8 text-amber-500 mx-auto mb-2" />
                  <h2 className="text-lg font-bold mb-1">
                    Draft starting soon
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    All captains must confirm they're at the keyboard before the
                    draft begins.
                  </p>
                  <div className="text-xs text-muted-foreground mt-2 font-medium">
                    {readyCount} of {captainTeams.length} captains ready
                  </div>
                </div>
              )}

              {!!myCaptainTeam && !meReady && (
                <button
                  onClick={() => captainReadyMutation.mutate()}
                  disabled={captainReadyMutation.isPending}
                  className="w-full px-4 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold text-base flex items-center justify-center gap-2 disabled:opacity-50"
                  data-testid="button-captain-ready"
                >
                  <CheckCircle2 className="w-5 h-5" />
                  I'm ready — let's draft!
                </button>
              )}
              {!!myCaptainTeam && meReady && (
                <div
                  className="w-full px-4 py-3 bg-emerald-500/15 border border-emerald-500/40 rounded-lg text-emerald-700 dark:text-emerald-300 text-center font-medium flex items-center justify-center gap-2"
                  data-testid="status-captain-ready"
                >
                  <CheckCircle2 className="w-5 h-5" />
                  {secsLeft != null ? "Draft is launching!" : "You're ready. Waiting on the others..."}
                </div>
              )}

              {isCommissioner && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => resendInvitesMutation.mutate()}
                    disabled={resendInvitesMutation.isPending}
                    className="flex-1 px-3 py-2 bg-card border border-border rounded text-sm font-medium hover-elevate active-elevate-2 disabled:opacity-50"
                    data-testid="button-resend-invites"
                  >
                    Resend reminders
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm("Cancel the lobby and return to setup?")) {
                        cancelLobbyMutation.mutate();
                      }
                    }}
                    disabled={cancelLobbyMutation.isPending}
                    className="flex-1 px-3 py-2 bg-destructive/10 border border-destructive/40 text-destructive rounded text-sm font-medium hover-elevate active-elevate-2 disabled:opacity-50"
                    data-testid="button-cancel-lobby"
                  >
                    Back to setup
                  </button>
                </div>
              )}

              <div className="border border-border rounded-lg divide-y divide-border bg-card">
                {captainTeams.map((t: any) => {
                  const cap = t.captainId
                    ? memberById.get(t.captainId)
                    : null;
                  const isReady = !!t.captainId && !!ready[t.captainId];
                  const noCaptain = !t.captainId;
                  return (
                    <div
                      key={t.id}
                      className="flex items-center gap-3 p-3"
                      data-testid={`captain-ready-row-${t.id}`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">
                          {t.name}
                        </div>
                        <div className={`text-xs truncate ${noCaptain ? "text-amber-600 dark:text-amber-400 font-medium" : "text-muted-foreground"}`}>
                          {cap
                            ? `${cap.user.firstName || ""} ${cap.user.lastName || ""}`.trim() ||
                              cap.user.displayName ||
                              cap.user.email
                            : "⚠ No captain assigned — go back to setup"}
                        </div>
                      </div>
                      {noCaptain ? (
                        <span
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-amber-500/15 text-amber-700 dark:text-amber-400"
                          data-testid={`status-no-captain-${t.id}`}
                        >
                          <Zap className="w-3.5 h-3.5" /> Unassigned
                        </span>
                      ) : isReady ? (
                        <span
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                          data-testid={`status-ready-${t.id}`}
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" /> Ready
                        </span>
                      ) : (
                        <span
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground"
                          data-testid={`status-waiting-${t.id}`}
                        >
                          <Hourglass className="w-3.5 h-3.5" /> Waiting
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })()}

        {/* Teams + their picks (for non-active states: pending, awaiting_captains, completed) */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-bold">Rosters</h2>
            <button
              onClick={() => setTeamPanelId(bundle.pickingTeamId || (draft.draftOrder?.[0] ?? null))}
              className="text-xs text-primary font-medium underline-offset-2 hover:underline"
              data-testid="button-open-team-panel"
            >
              View team detail
            </button>
          </div>
          <div className="space-y-2">
            {(draft.draftOrder || []).map((teamId, idx) => {
              const team = teamById.get(teamId);
              const teamPicks = bundle.picks.filter((p) => p.teamId === teamId);
              const goalieId = draft.goalieAssignments?.[teamId];
              const goalie = goalieId ? memberById.get(goalieId) : null;
              const isPicking = bundle.pickingTeamId === teamId;
              return (
                <button
                  key={teamId}
                  onClick={() => setTeamPanelId(teamId)}
                  className={`w-full text-left p-3 rounded-lg border ${
                    isPicking ? "border-primary bg-primary/5" : "border-border bg-card"
                  } hover:border-primary transition-colors`}
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
                          <span key={p.id} className="px-2 py-0.5 bg-muted text-muted-foreground rounded text-[11px] italic">
                            R{p.round} forfeit
                          </span>
                        );
                      const player = p.playerId ? memberById.get(p.playerId) : null;
                      return (
                        <span
                          key={p.id}
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
                        </span>
                      );
                    })}
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      </div>
      )}

      {/* Team detail slide-up panel */}
      {teamPanelId && (() => {
        const team = teamById.get(teamPanelId);
        const teamPicks = bundle.picks.filter((p) => p.teamId === teamPanelId);
        const goalieId = draft.goalieAssignments?.[teamPanelId];
        const goalie = goalieId ? memberById.get(goalieId) : null;
        const captain = team?.captainId ? memberById.get(team.captainId) : null;
        const orderIdx = (draft.draftOrder || []).indexOf(teamPanelId);
        return (
          <div
            className="fixed inset-0 z-40 bg-black/40 flex items-end"
            onClick={() => setTeamPanelId(null)}
          >
            <div
              className="w-full bg-background rounded-t-2xl max-h-[80vh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
              data-testid={`team-panel-${teamPanelId}`}
            >
              <div className="p-3 border-b border-border flex items-center justify-between">
                <div className="min-w-0">
                  <div className="text-xs text-muted-foreground uppercase tracking-wide">
                    Pick #{orderIdx + 1} · {teamPicks.filter((p) => !p.forfeited).length} drafted
                  </div>
                  <h3 className="font-bold truncate">{team?.name || "Team"}</h3>
                  {captain && (
                    <div className="text-xs text-muted-foreground truncate">
                      Captain: {captain.user.firstName || captain.user.displayName || captain.user.email}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => setTeamPanelId(null)}
                  className="p-1"
                  data-testid="button-close-team-panel"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {goalie && (
                  <button
                    onClick={() => setCardUserId(goalie.user.id)}
                    className="w-full flex items-center gap-2 p-2 bg-blue-500/10 border border-blue-500/30 rounded-lg text-left"
                    data-testid={`team-panel-goalie-${goalie.user.id}`}
                  >
                    {goalie.user.profileImageUrl ? (
                      <img
                        src={getImageUrl(goalie.user.profileImageUrl) || ""}
                        alt=""
                        className="w-9 h-9 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-xs font-bold">
                        {(goalie.user.firstName?.[0] || "?").toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">
                        {goalie.user.firstName} {goalie.user.lastName}
                      </div>
                      <div className="text-[10px] text-blue-600 dark:text-blue-300 uppercase tracking-wider">
                        Goaltender
                      </div>
                    </div>
                  </button>
                )}
                {teamPicks.length === 0 && !goalie && (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    No picks yet.
                  </p>
                )}
                {teamPicks.map((p) => {
                  if (p.forfeited) {
                    return (
                      <div
                        key={p.id}
                        className="p-2 border border-dashed border-border rounded-lg text-xs italic text-muted-foreground"
                        data-testid={`team-panel-forfeit-${p.id}`}
                      >
                        Round {p.round} — forfeited (buddy auto-add)
                      </div>
                    );
                  }
                  const player = p.playerId ? memberById.get(p.playerId) : null;
                  if (!player) return null;
                  return (
                    <button
                      key={p.id}
                      onClick={() => p.playerId && setCardUserId(p.playerId)}
                      className="w-full flex items-center gap-2 p-2 bg-card border border-border rounded-lg text-left hover:border-primary"
                      data-testid={`team-panel-pick-${p.id}`}
                    >
                      <span className="text-[10px] text-muted-foreground font-mono w-6 text-right">
                        R{p.round}
                      </span>
                      {player.user.profileImageUrl ? (
                        <img
                          src={getImageUrl(player.user.profileImageUrl) || ""}
                          alt=""
                          className="w-9 h-9 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-xs font-bold">
                          {(player.user.firstName?.[0] || "?").toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate">
                          {player.user.firstName} {player.user.lastName}
                        </div>
                        <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                          {p.isAutoBuddy && (
                            <span className="text-pink-600 dark:text-pink-300">♥ buddy</span>
                          )}
                          {p.expiredAutoPick && (
                            <span className="text-amber-600 dark:text-amber-300">⏱ auto</span>
                          )}
                          {draft.skillRankingEnabled && player.membership.skillLevel && (
                            <span className="px-1 bg-amber-500/20 text-amber-700 dark:text-amber-300 rounded font-bold">
                              {player.membership.skillLevel}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Card overlay */}
      {cardUserId && (() => {
        const buddyNames: string[] = [];
        for (const pair of bundle?.buddyPairs || []) {
          if (!pair.userIds.includes(cardUserId)) continue;
          for (const uid of pair.userIds) {
            if (uid === cardUserId) continue;
            const bm = memberById.get(uid);
            if (!bm) continue;
            const name =
              [bm.user.firstName, bm.user.lastName].filter(Boolean).join(" ") ||
              bm.user.displayName ||
              bm.user.email ||
              "Player";
            buddyNames.push(name);
          }
        }
        return (
        <PlayerCardOverlay
          buddyNames={buddyNames}
          draftId={draftId!}
          userId={cardUserId}
          onClose={() => setCardUserId(null)}
          canPick={canPick && draft.status === "active" && !draftedSet.has(cardUserId)}
          onPick={() => setPendingPickUserId(cardUserId)}
          isPicking={pickMutation.isPending}
        />
        );
      })()}

      {/* Pick confirmation dialog */}
      <AlertDialog
        open={!!pendingPickUserId}
        onOpenChange={(open) => {
          if (!open && !pickMutation.isPending) setPendingPickUserId(null);
        }}
      >
        <AlertDialogContent data-testid="dialog-confirm-pick">
          <AlertDialogHeader>
            <AlertDialogTitle>Draft this player?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              {(() => {
                const m = pendingPickUserId ? memberById.get(pendingPickUserId) : null;
                const name =
                  m?.user.firstName ||
                  m?.user.displayName ||
                  m?.user.email ||
                  "this player";
                const teamName = pickingTeam?.name || "the team on the clock";
                // Find any buddies of the player about to be picked.
                const buddyNames: string[] = [];
                if (pendingPickUserId) {
                  for (const pair of bundle?.buddyPairs || []) {
                    if (!pair.userIds.includes(pendingPickUserId)) continue;
                    for (const uid of pair.userIds) {
                      if (uid === pendingPickUserId) continue;
                      const bm = memberById.get(uid);
                      if (!bm) continue;
                      // Skip already-drafted buddies — they won't be re-added.
                      if (draftedSet.has(uid)) continue;
                      buddyNames.push(
                        bm.user.firstName ||
                          bm.user.displayName ||
                          bm.user.email ||
                          "Player",
                      );
                    }
                  }
                }
                return (
                  <span className="block space-y-2">
                    <span className="block">
                      <span className="font-semibold text-foreground">{name}</span>
                      {" will be added to "}
                      <span className="font-semibold text-foreground">{teamName}</span>
                      {". This pick can be undone for 30 seconds."}
                    </span>
                    {buddyNames.length > 0 && (
                      <span
                        className="flex items-start gap-2 p-2 rounded-md bg-pink-50 dark:bg-pink-950/40 border border-pink-300 dark:border-pink-800"
                        data-testid="buddy-warning"
                      >
                        <Link2 className="w-4 h-4 mt-0.5 text-pink-600 dark:text-pink-300 flex-shrink-0" />
                        <span className="block text-foreground text-sm">
                          <span className="font-bold text-pink-700 dark:text-pink-300">
                            Heads up — buddy rule:
                          </span>{" "}
                          <span className="font-semibold">
                            {buddyNames.join(" & ")}
                          </span>{" "}
                          will be auto-added to {teamName}, and {teamName}'s next
                          round pick will be skipped.
                        </span>
                      </span>
                    )}
                  </span>
                );
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={pickMutation.isPending}
              data-testid="button-cancel-pick"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={pickMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (pendingPickUserId) pickMutation.mutate(pendingPickUserId);
              }}
              data-testid="button-confirm-pick"
            >
              {pickMutation.isPending ? "Drafting…" : "Draft player"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Finalize confirmation */}
      <AlertDialog open={finalizeOpen} onOpenChange={setFinalizeOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Finalize draft?</AlertDialogTitle>
            <AlertDialogDescription>
              This will assign every drafted player to their team in the
              league and send each one a push notification congratulating
              them on their new team. It's safe to run more than once —
              players already on the right team won't be re-notified.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={finalizeMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                finalizeMutation.mutate();
              }}
              disabled={finalizeMutation.isPending}
              data-testid="button-confirm-finalize"
            >
              {finalizeMutation.isPending ? "Finalizing…" : "Finalize & notify"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Chat drawer */}
      {showChat && (
        <div
          className="fixed inset-0 z-[110] bg-black/40 flex items-start"
          onClick={() => setShowChat(false)}
        >
          <div
            className="w-full bg-background rounded-b-2xl flex flex-col"
            style={{ maxHeight: "70dvh", paddingTop: "env(safe-area-inset-top, 0px)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-3 border-b border-border flex items-center justify-between shrink-0">
              <h3 className="font-bold">Draft Chat</h3>
              <button
                onClick={() => setShowChat(false)}
                className="p-1"
                data-testid="button-close-chat"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
              {bundle.chatMessages.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">No messages yet.</p>
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
            <div
              className="p-3 border-t border-border flex gap-2 shrink-0"
            >
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

      {/* Pick announcement modal — auto-dismisses after 4s */}
      {lastPick && (() => {
        const announcedTeam = teamById.get(lastPick.teamId);
        const announcedMember = lastPick.playerId ? memberById.get(lastPick.playerId) : null;
        const playerName = announcedMember
          ? [announcedMember.user.firstName, announcedMember.user.lastName].filter(Boolean).join(" ") ||
            announcedMember.user.displayName ||
            "Player"
          : "Unknown Player";
        const isGoalie = announcedMember?.membership?.isGoalie;
        const imgUrl = announcedMember?.user?.profileImageUrl
          ? getImageUrl(announcedMember.user.profileImageUrl)
          : null;
        const ordinal = (n: number) => {
          const s = ["th","st","nd","rd"], v = n % 100;
          return n + (s[(v-20)%10] || s[v] || s[0]);
        };
        return (
          <div
            className="fixed inset-x-0 bottom-20 sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2 z-[60] flex justify-center px-4 pointer-events-none"
            data-testid="pick-announcement-modal"
          >
            <div className="pointer-events-auto bg-background border border-border rounded-2xl shadow-2xl p-5 w-full max-w-sm animate-in fade-in slide-in-from-bottom-4 duration-300">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                  <span className="text-xs font-semibold text-primary uppercase tracking-wide">
                    {lastPick.isAutoPick ? "Auto-pick" : "Pick made"}
                  </span>
                </div>
                <button
                  onClick={() => setLastPick(null)}
                  className="text-muted-foreground hover:text-foreground p-0.5 rounded"
                  data-testid="button-dismiss-pick-announcement"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-center gap-3">
                {/* Avatar */}
                <div className="relative shrink-0">
                  {imgUrl ? (
                    <img
                      src={imgUrl}
                      alt={playerName}
                      className="w-14 h-14 rounded-full object-cover border-2 border-primary/30"
                    />
                  ) : (
                    <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center border-2 border-border">
                      <Users className="w-6 h-6 text-muted-foreground" />
                    </div>
                  )}
                  {isGoalie && (
                    <div className="absolute -bottom-1 -right-1 bg-primary text-primary-foreground rounded-full p-0.5">
                      <Shield className="w-3 h-3" />
                    </div>
                  )}
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-lg leading-tight truncate">{playerName}</div>
                  {isGoalie && (
                    <span className="inline-block text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded mb-0.5 font-medium">
                      Goalie
                    </span>
                  )}
                  <div className="text-sm text-muted-foreground flex items-center gap-1 mt-0.5 flex-wrap">
                    <Crown className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate font-medium">{announcedTeam?.name ?? "Unknown team"}</span>
                    {lastPick.isAutoPick && (
                      <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded font-medium">
                        Auto-pick
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Round {lastPick.round} · {ordinal(lastPick.pick)} overall
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
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
  buddyNames,
}: {
  draftId: string;
  userId: string;
  onClose: () => void;
  canPick: boolean;
  onPick: () => void;
  isPicking: boolean;
  buddyNames: string[];
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
                  {buddyNames.length > 0 && (
                    <div
                      className="mt-2 p-2 bg-pink-50 dark:bg-pink-950/40 border-l-2 border-pink-500 rounded text-[11px] flex items-start gap-1.5"
                      data-testid="player-card-buddies"
                    >
                      <Link2 className="w-3 h-3 mt-0.5 text-pink-600 dark:text-pink-300 flex-shrink-0" />
                      <div>
                        <span className="font-bold text-pink-700 dark:text-pink-300">
                          Buddied with:
                        </span>{" "}
                        <span className="text-foreground">{buddyNames.join(", ")}</span>
                        <div className="text-[10px] text-muted-foreground mt-0.5">
                          Drafting this player auto-adds {buddyNames.length === 1 ? "their buddy" : "their buddies"} to the same team.
                        </div>
                      </div>
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
