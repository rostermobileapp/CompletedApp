import { useState, useEffect, useMemo, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  X,
  Snowflake,
  ArrowRight,
  Users,
  Star,
  Shield,
  Clock,
  Heart,
  StickyNote,
  Lock,
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  Sparkles,
  Crown,
} from "lucide-react";

type DraftStyle = "snake" | "linear" | "auction" | "3rd_round_reversal";
type GoalieMethod = "commissioner_assigned" | "random_draw" | "included_with_skaters";
type TimerExpiryRule = "auto_pick" | "halve_next";

function timerRuleLabel(rule: TimerExpiryRule): string {
  if (rule === "halve_next")
    return "+30s extension, then halve your next pick's timer";
  return "Auto-pick a random available player";
}

function goalieMethodLabel(m: string): string {
  switch (m) {
    case "included_with_skaters":
      return "Included with skaters";
    case "commissioner_assigned":
      return "Commissioner assigned";
    case "random_draw":
      return "Random draw";
    default:
      return m.replace(/_/g, " ");
  }
}
type SkillScale = "letters" | "numbers" | null;

interface Member {
  membership: {
    id: string;
    userId: string;
    leagueId: string;
    isGoalie: boolean;
    isSkater?: boolean;
    skillLevel?: string | null;
  };
  user: {
    id: string;
    firstName?: string | null;
    lastName?: string | null;
    displayName?: string | null;
    email?: string | null;
    profileImageUrl?: string | null;
  };
}

interface Team {
  id: string;
  name: string;
  captainId?: string | null;
}

interface Props {
  leagueId: string;
  seasonId: string;
  teams: Team[];
  onClose: () => void;
  onLaunched?: (draftId: string) => void;
}

const STEPS = [
  { id: "captains", label: "Captains" },
  { id: "goalies", label: "Goalies" },
  { id: "format", label: "Format" },
  { id: "timer", label: "Timer" },
  { id: "skill", label: "Skill" },
  { id: "buddies", label: "Buddies" },
  { id: "notes", label: "Notes" },
  { id: "review", label: "Review" },
] as const;

type StepId = (typeof STEPS)[number]["id"];

function memberName(m: Member): string {
  const first = m.user.firstName || "";
  const last = m.user.lastName || "";
  const full = `${first} ${last}`.trim();
  return full || m.user.displayName || m.user.email || "Player";
}

export function DraftSetupWizard({ leagueId, seasonId, teams, onClose, onLaunched }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [stepIdx, setStepIdx] = useState(0);
  const stepId: StepId = STEPS[stepIdx].id;

  // Captains
  const [captainAssignments, setCaptainAssignments] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const t of teams) {
      if (t.captainId) init[t.id] = t.captainId;
    }
    return init;
  });
  const [captainSearch, setCaptainSearch] = useState("");

  // Format
  const [draftStyle, setDraftStyle] = useState<DraftStyle>("snake");
  const [draftOrder, setDraftOrder] = useState<string[]>(teams.map((t) => t.id));
  const [totalRounds, setTotalRounds] = useState<number>(8);

  // Goalies
  const [goalieMethod, setGoalieMethod] = useState<GoalieMethod>("included_with_skaters");
  const [goalieAssignments, setGoalieAssignments] = useState<Record<string, string>>({});

  // Timer
  const [timePerPick, setTimePerPick] = useState<number>(60);
  const [timerExpiryRule, setTimerExpiryRule] = useState<TimerExpiryRule>("auto_pick");

  // Skill
  const [skillRankingEnabled, setSkillRankingEnabled] = useState(false);
  const [skillScale, setSkillScale] = useState<SkillScale>("numbers");
  const [skillLevels, setSkillLevels] = useState<Record<string, string>>({});

  // Buddies
  const [buddyPairs, setBuddyPairs] = useState<string[][]>([]);
  const [pendingPair, setPendingPair] = useState<string[]>([]);

  // Notes
  const [playerNotes, setPlayerNotes] = useState<Record<string, string>>({});

  // Buddy add-row filter (replaces the old <select>)
  const [buddySearch, setBuddySearch] = useState("");

  // One-shot init guard so a query refetch (e.g. after another tab updates the
  // draft, after a window focus) doesn't blow away in-progress edits to the
  // notes textareas.
  const hydratedRef = useRef(false);

  // Tracks whether the user has manually edited totalRounds. If they have, we
  // stop auto-suggesting rounds based on goalie method / roster size.
  const userOverrodeRoundsRef = useRef(false);

  // Load league members
  const { data: members = [] } = useQuery<Member[]>({
    queryKey: ["/api/leagues", leagueId, "draft-players"],
    enabled: !!leagueId,
  });

  // Pre-load existing draft config (if any)
  const { data: existing } = useQuery<{
    draft: any;
    buddyPairs: { id: string; userIds: string[] }[];
  }>({
    queryKey: ["/api/leagues", leagueId, "seasons", seasonId, "draft"],
    enabled: !!leagueId && !!seasonId,
  });

  useEffect(() => {
    // Hydrate from the persisted draft EXACTLY ONCE so we don't clobber
    // in-progress edits (e.g. notes the user is typing) when the underlying
    // query refetches after a window focus or another mutation.
    if (existing?.draft && !hydratedRef.current) {
      hydratedRef.current = true;
      const d = existing.draft;
      if (d.draftStyle) setDraftStyle(d.draftStyle);
      if (d.goalieMethod) setGoalieMethod(d.goalieMethod);
      if (d.timerExpiryRule) setTimerExpiryRule(d.timerExpiryRule);
      if (d.timePerPick) setTimePerPick(d.timePerPick);
      if (typeof d.skillRankingEnabled === "boolean") setSkillRankingEnabled(d.skillRankingEnabled);
      if (d.skillScale) setSkillScale(d.skillScale);
      if (d.playerNotes && typeof d.playerNotes === "object") setPlayerNotes(d.playerNotes);
      if (d.goalieAssignments) setGoalieAssignments(d.goalieAssignments);
      if (d.captainAssignments) setCaptainAssignments(d.captainAssignments);
      if (Array.isArray(d.draftOrder) && d.draftOrder.length) setDraftOrder(d.draftOrder);
      if (d.totalRounds) {
        setTotalRounds(d.totalRounds);
        // Persisted rounds count as a user override — preserve it.
        userOverrodeRoundsRef.current = true;
      }
      if (existing.buddyPairs?.length) setBuddyPairs(existing.buddyPairs.map((p) => p.userIds));
    }
  }, [existing]);

  // Auto-suggest totalRounds based on roster size + goalie method, until the
  // user manually edits the value. The suggestion uses (skaters / teams)
  // when goalies are pulled out (commissioner_assigned / random_draw) and
  // ((skaters + goalies) / teams) when goalies are drafted as skaters.
  const suggestedRounds = useMemo(() => {
    const teamCount = Math.max(1, draftOrder.length || 0);
    const skaters = members.filter((m) => !m.membership.isGoalie).length;
    const goalies = members.filter((m) => m.membership.isGoalie).length;
    const drafterPool =
      goalieMethod === "included_with_skaters" ? skaters + goalies : skaters;
    if (drafterPool === 0) return 8;
    return Math.max(1, Math.ceil(drafterPool / teamCount));
  }, [members, draftOrder.length, goalieMethod]);

  useEffect(() => {
    if (!userOverrodeRoundsRef.current) {
      setTotalRounds(suggestedRounds);
    }
  }, [suggestedRounds]);

  // Initialize skillLevels from existing memberships
  useEffect(() => {
    if (!members.length) return;
    setSkillLevels((prev) => {
      const next = { ...prev };
      for (const m of members) {
        if (!next[m.user.id] && m.membership.skillLevel) {
          next[m.user.id] = m.membership.skillLevel;
        }
      }
      return next;
    });
  }, [members]);

  const skaters = useMemo(
    () => members.filter((m) => !m.membership.isGoalie),
    [members],
  );
  const goalies = useMemo(
    () => members.filter((m) => m.membership.isGoalie),
    [members],
  );

  const saveMutation = useMutation({
    mutationFn: async (launch: boolean) => {
      const body = {
        draftStyle,
        goalieMethod,
        timerExpiryRule,
        timePerPick,
        skillRankingEnabled,
        skillScale: skillRankingEnabled ? skillScale : null,
        skillLevels: skillRankingEnabled ? skillLevels : undefined,
        playerNotes,
        buddyPairs: buddyPairs.length ? buddyPairs : undefined,
        goalieAssignments: goalieMethod === "commissioner_assigned" ? goalieAssignments : undefined,
        captainAssignments: Object.keys(captainAssignments).length ? captainAssignments : undefined,
        draftOrder,
        totalRounds,
      };
      const res = await apiRequest(
        "POST",
        `/api/leagues/${leagueId}/seasons/${seasonId}/draft`,
        body,
      );
      const data = await res.json();
      if (launch) {
        await apiRequest("POST", `/api/drafts/${data.draft.id}/start`, {});
      }
      return data;
    },
    onSuccess: (data, launch) => {
      queryClient.invalidateQueries({
        queryKey: ["/api/leagues", leagueId, "seasons", seasonId, "draft"],
      });
      toast({
        title: launch ? "Draft started!" : "Draft saved",
        description: launch ? "Captains can now make their picks." : "Configuration saved.",
      });
      if (launch && onLaunched) onLaunched(data.draft.id);
      onClose();
    },
    onError: (err: any) => {
      toast({
        title: "Failed to save draft",
        description: err?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const next = () => setStepIdx((i) => Math.min(STEPS.length - 1, i + 1));
  const prev = () => setStepIdx((i) => Math.max(0, i - 1));
  const goTo = (id: StepId) => setStepIdx(STEPS.findIndex((s) => s.id === id));

  const playerLabel = (userId: string) => {
    const m = members.find((mm) => mm.user.id === userId);
    return m ? memberName(m) : userId.slice(0, 6);
  };

  const moveTeam = (idx: number, dir: -1 | 1) => {
    setDraftOrder((order) => {
      const next = [...order];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return order;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };

  const teamById = useMemo(() => {
    const m = new Map<string, Team>();
    for (const t of teams) m.set(t.id, t);
    return m;
  }, [teams]);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-background rounded-t-2xl sm:rounded-2xl hairline elev-inset w-full sm:max-w-3xl max-h-[85dvh] sm:max-h-[90vh] flex flex-col">
        <div className="p-5 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            <div>
              <h2 className="text-lg font-bold">Draft Setup</h2>
              <p className="text-xs text-muted-foreground">
                Step {stepIdx + 1} of {STEPS.length} · {STEPS[stepIdx].label}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground p-1"
            data-testid="button-close-draft-wizard"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center gap-1 px-5 pt-3">
          {STEPS.map((s, i) => (
            <div
              key={s.id}
              className={`h-1.5 flex-1 rounded-full transition ${
                i <= stepIdx ? "bg-primary" : "bg-muted"
              }`}
            />
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {stepId === "captains" && (
            <div className="space-y-4" data-testid="step-captains">
              <h3 className="font-semibold flex items-center gap-2">
                <Crown className="w-4 h-4" /> Assign Team Captains
              </h3>
              <p className="text-sm text-muted-foreground">
                Captains make picks during the draft. Assign one member per team.
              </p>

              {members.length > 0 && (
                <input
                  type="text"
                  value={captainSearch}
                  onChange={(e) => setCaptainSearch(e.target.value)}
                  placeholder="Filter members..."
                  className="w-full p-2 bg-card border border-border rounded-lg text-sm"
                  data-testid="input-captain-search"
                />
              )}

              <div className="space-y-2">
                {teams.map((team) => {
                  const assignedId = captainAssignments[team.id] || "";
                  const assignedMember = members.find((m) => m.user.id === assignedId);
                  const filtered = members.filter((m) => {
                    const q = captainSearch.trim().toLowerCase();
                    return !q || memberName(m).toLowerCase().includes(q);
                  });
                  return (
                    <div
                      key={team.id}
                      className="p-3 bg-card border border-border rounded-lg space-y-2"
                      data-testid={`captain-row-${team.id}`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{team.name}</span>
                        {assignedMember && (
                          <span className="text-xs text-primary font-medium flex items-center gap-1">
                            <Crown className="w-3 h-3" />
                            {memberName(assignedMember)}
                          </span>
                        )}
                      </div>
                      <select
                        value={assignedId}
                        onChange={(e) =>
                          setCaptainAssignments((prev) => ({
                            ...prev,
                            [team.id]: e.target.value,
                          }))
                        }
                        className="w-full p-2 bg-background border border-border rounded text-sm"
                        data-testid={`select-captain-${team.id}`}
                      >
                        <option value="">— Select captain —</option>
                        {filtered.map((m) => (
                          <option key={m.user.id} value={m.user.id}>
                            {memberName(m)}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>

              {teams.some((t) => !captainAssignments[t.id]) && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  Teams without a captain can still draft — the commissioner picks for them.
                </p>
              )}
            </div>
          )}

          {stepId === "format" && (
            <div className="space-y-4" data-testid="step-format">
              <div className="space-y-2">
                <label className="block text-sm font-medium">Draft Style</label>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      { v: "snake", label: "Snake", desc: "Order reverses each round (most common)" },
                      { v: "linear", label: "Linear", desc: "Same order every round" },
                      { v: "3rd_round_reversal", label: "3rd Round Reversal", desc: "R1 forward, R2 & R3 reverse" },
                      { v: "auction", label: "Auction", desc: "Captains bid (basic)" },
                    ] as { v: DraftStyle; label: string; desc: string }[]
                  ).map((o) => (
                    <button
                      key={o.v}
                      type="button"
                      onClick={() => setDraftStyle(o.v)}
                      className={`p-3 rounded-lg border text-left text-sm ${
                        draftStyle === o.v
                          ? "border-primary bg-primary/10"
                          : "border-border hover:bg-muted/40"
                      }`}
                      data-testid={`option-style-${o.v}`}
                    >
                      <div className="font-medium">{o.label}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{o.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Total Rounds</label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={totalRounds}
                  onChange={(e) => {
                    userOverrodeRoundsRef.current = true;
                    setTotalRounds(parseInt(e.target.value) || 1);
                  }}
                  className="w-32 p-2 bg-card border border-border rounded-lg"
                  data-testid="input-total-rounds"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  Draft Order ({draftOrder.length} teams)
                </label>
                <div className="space-y-2 max-h-72 overflow-y-auto border border-border rounded-lg p-2">
                  {draftOrder.map((teamId, i) => {
                    const team = teamById.get(teamId);
                    return (
                      <div
                        key={teamId}
                        className="flex items-center gap-2 p-2 bg-card rounded border border-border"
                        data-testid={`order-row-${teamId}`}
                      >
                        <span className="text-xs w-6 text-muted-foreground">{i + 1}.</span>
                        <span className="flex-1 text-sm font-medium">
                          {team?.name || "Unknown team"}
                        </span>
                        <button
                          onClick={() => moveTeam(i, -1)}
                          disabled={i === 0}
                          className="p-1 disabled:opacity-30"
                          aria-label="Move up"
                        >
                          <ChevronLeft className="w-4 h-4 rotate-90" />
                        </button>
                        <button
                          onClick={() => moveTeam(i, 1)}
                          disabled={i === draftOrder.length - 1}
                          className="p-1 disabled:opacity-30"
                          aria-label="Move down"
                        >
                          <ChevronRight className="w-4 h-4 rotate-90" />
                        </button>
                      </div>
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={() => setDraftOrder((o) => [...o].sort(() => Math.random() - 0.5))}
                  className="mt-2 text-xs text-primary hover:underline"
                  data-testid="button-randomize-order"
                >
                  Randomize order
                </button>
              </div>
            </div>
          )}

          {stepId === "goalies" && (
            <div className="space-y-3" data-testid="step-goalies">
              <h3 className="font-semibold flex items-center gap-2">
                <Shield className="w-4 h-4" /> How are goalies handled?
              </h3>
              {(
                [
                  { v: "commissioner_assigned", label: "Commissioner assigns", desc: "You manually pair goalies with teams" },
                  { v: "random_draw", label: "Random draw", desc: "Goalies are randomly assigned at draft start" },
                  { v: "included_with_skaters", label: "Included with skaters", desc: "Captains pick goalies as part of the draft" },
                ] as { v: GoalieMethod; label: string; desc: string }[]
              ).map((o) => (
                <button
                  key={o.v}
                  type="button"
                  onClick={() => setGoalieMethod(o.v)}
                  className={`w-full p-3 rounded-lg border text-left text-sm ${
                    goalieMethod === o.v
                      ? "border-primary bg-primary/10"
                      : "border-border hover:bg-muted/40"
                  }`}
                  data-testid={`option-goalie-${o.v}`}
                >
                  <div className="font-medium">{o.label}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{o.desc}</div>
                </button>
              ))}

              {goalieMethod === "commissioner_assigned" && (
                <div className="mt-3 space-y-2 border-t border-border pt-3">
                  <p className="text-sm text-muted-foreground">
                    Assign one goalie to each team:
                  </p>
                  {teams.map((team) => (
                    <div key={team.id} className="flex items-center gap-2">
                      <span className="text-sm w-32 truncate">{team.name}</span>
                      <select
                        value={goalieAssignments[team.id] || ""}
                        onChange={(e) =>
                          setGoalieAssignments((prev) => ({
                            ...prev,
                            [team.id]: e.target.value,
                          }))
                        }
                        className="flex-1 p-2 bg-card border border-border rounded text-sm"
                        data-testid={`select-goalie-${team.id}`}
                      >
                        <option value="">— Select goalie —</option>
                        {goalies.map((g) => (
                          <option key={g.user.id} value={g.user.id}>
                            {memberName(g)}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {stepId === "timer" && (
            <div className="space-y-4" data-testid="step-timer">
              <h3 className="font-semibold flex items-center gap-2">
                <Clock className="w-4 h-4" /> Pick Timer
              </h3>
              <div>
                <label className="block text-sm font-medium mb-2">
                  Time per pick: {timePerPick}s
                </label>
                <input
                  type="range"
                  min={15}
                  max={300}
                  step={15}
                  value={timePerPick}
                  onChange={(e) => setTimePerPick(parseInt(e.target.value))}
                  className="w-full"
                  data-testid="input-time-per-pick"
                />
                <div className="flex justify-between text-xs text-muted-foreground mt-1">
                  <span>15s</span>
                  <span>5min</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">If timer expires:</label>
                <div className="space-y-2">
                  {(
                    [
                      { v: "auto_pick", label: "Auto-pick a random available player" },
                      { v: "halve_next", label: "Buzzer: +30s extension, halve YOUR next pick's timer" },
                    ] as { v: TimerExpiryRule; label: string }[]
                  ).map((o) => (
                    <label
                      key={o.v}
                      className="flex items-center gap-2 p-3 border border-border rounded-lg cursor-pointer hover:bg-muted/40"
                      data-testid={`option-expiry-${o.v}`}
                    >
                      <input
                        type="radio"
                        checked={timerExpiryRule === o.v}
                        onChange={() => setTimerExpiryRule(o.v)}
                      />
                      <span className="text-sm">{o.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          {stepId === "skill" && (
            <div className="space-y-4" data-testid="step-skill">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold flex items-center gap-2">
                  <Star className="w-4 h-4" /> Skill Tier Ranking
                </h3>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={skillRankingEnabled}
                    onChange={(e) => setSkillRankingEnabled(e.target.checked)}
                    data-testid="checkbox-skill-enabled"
                  />
                  Enable
                </label>
              </div>

              {skillRankingEnabled && (
                <>
                  <div>
                    <label className="block text-sm font-medium mb-2">Tier Scale</label>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setSkillScale("numbers")}
                        className={`px-3 py-2 rounded-lg border text-sm ${
                          skillScale === "numbers"
                            ? "border-primary bg-primary/10"
                            : "border-border"
                        }`}
                        data-testid="button-scale-numbers"
                      >
                        Numbers (1-5)
                      </button>
                      <button
                        onClick={() => setSkillScale("letters")}
                        className={`px-3 py-2 rounded-lg border text-sm ${
                          skillScale === "letters"
                            ? "border-primary bg-primary/10"
                            : "border-border"
                        }`}
                        data-testid="button-scale-letters"
                      >
                        Letters (A-D)
                      </button>
                    </div>
                  </div>

                  <div className="border border-border rounded-lg max-h-72 overflow-y-auto divide-y divide-border">
                    {members.map((m) => {
                      const tier = skillLevels[m.user.id] || "";
                      const options =
                        skillScale === "letters"
                          ? ["A", "B", "C", "D"]
                          : ["1", "2", "3", "4", "5"];
                      return (
                        <div key={m.user.id} className="flex items-center gap-2 p-2">
                          <span className="text-sm flex-1 truncate">{memberName(m)}</span>
                          <select
                            value={tier}
                            onChange={(e) =>
                              setSkillLevels((prev) => ({
                                ...prev,
                                [m.user.id]: e.target.value,
                              }))
                            }
                            className="p-1.5 bg-card border border-border rounded text-sm"
                            data-testid={`select-skill-${m.user.id}`}
                          >
                            <option value="">—</option>
                            {options.map((o) => (
                              <option key={o} value={o}>
                                {o}
                              </option>
                            ))}
                          </select>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}

          {stepId === "buddies" && (
            <div className="space-y-3" data-testid="step-buddies">
              <h3 className="font-semibold flex items-center gap-2">
                <Heart className="w-4 h-4" /> Buddy Pairs
              </h3>
              <p className="text-sm text-muted-foreground">
                Buddied players go to the same team. Drafting one auto-adds the others, and the
                captain forfeits their next-round pick.
              </p>

              {buddyPairs.map((pair, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 p-2 bg-card border border-border rounded-lg"
                  data-testid={`buddy-pair-${i}`}
                >
                  <span className="flex-1 text-sm">
                    {pair.map((id) => playerLabel(id)).join(" + ")}
                  </span>
                  <button
                    onClick={() => setBuddyPairs((prev) => prev.filter((_, idx) => idx !== i))}
                    className="text-destructive p-1"
                    data-testid={`button-remove-buddy-${i}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}

              <div className="border border-dashed border-border rounded-lg p-3 space-y-2">
                <p className="text-xs font-medium">Add a new buddy pair (2-4 players):</p>
                {pendingPair.map((uid, i) => (
                  <div key={i} className="text-sm pl-2">
                    • {playerLabel(uid)}{" "}
                    <button
                      onClick={() =>
                        setPendingPair((p) => p.filter((_, idx) => idx !== i))
                      }
                      className="text-destructive ml-2 text-xs"
                    >
                      remove
                    </button>
                  </div>
                ))}
                <input
                  type="text"
                  value={buddySearch}
                  onChange={(e) => setBuddySearch(e.target.value)}
                  placeholder="Search players to add..."
                  className="w-full p-2 bg-card border border-border rounded text-sm"
                  data-testid="input-buddy-search"
                />
                <div className="max-h-48 overflow-y-auto border border-border rounded divide-y divide-border bg-card">
                  {members
                    .filter((m) => {
                      if (pendingPair.includes(m.user.id)) return false;
                      if (buddyPairs.some((p) => p.includes(m.user.id))) return false;
                      const q = buddySearch.trim().toLowerCase();
                      if (!q) return true;
                      return memberName(m).toLowerCase().includes(q);
                    })
                    .slice(0, 20)
                    .map((m) => (
                      <button
                        key={m.user.id}
                        type="button"
                        onClick={() => {
                          setPendingPair([...pendingPair, m.user.id]);
                          setBuddySearch("");
                        }}
                        className="w-full text-left text-sm p-2 hover-elevate active-elevate-2"
                        data-testid={`button-add-buddy-candidate-${m.user.id}`}
                      >
                        + {memberName(m)}
                      </button>
                    ))}
                  {members.filter((m) => {
                    if (pendingPair.includes(m.user.id)) return false;
                    if (buddyPairs.some((p) => p.includes(m.user.id))) return false;
                    const q = buddySearch.trim().toLowerCase();
                    if (!q) return true;
                    return memberName(m).toLowerCase().includes(q);
                  }).length === 0 && (
                    <div className="text-xs text-muted-foreground p-2 text-center">
                      No players match.
                    </div>
                  )}
                </div>
                <button
                  onClick={() => {
                    if (pendingPair.length >= 2) {
                      setBuddyPairs([...buddyPairs, pendingPair]);
                      setPendingPair([]);
                    }
                  }}
                  disabled={pendingPair.length < 2}
                  className="w-full px-3 py-2 bg-primary text-primary-foreground rounded text-sm disabled:opacity-50"
                  data-testid="button-confirm-buddy"
                >
                  <Plus className="w-3 h-3 inline mr-1" />
                  Add Pair
                </button>
              </div>
            </div>
          )}

          {stepId === "notes" && (
            <div className="space-y-3" data-testid="step-notes">
              <h3 className="font-semibold flex items-center gap-2">
                <StickyNote className="w-4 h-4" /> Player Notes (optional)
              </h3>
              <p className="text-sm text-muted-foreground">
                These notes appear on the trading-card overlay during the draft. Max 200 chars per player.
              </p>
              <div className="border border-border rounded-lg max-h-96 overflow-y-auto divide-y divide-border">
                {members.map((m) => {
                  const noteVal = playerNotes[m.user.id] || "";
                  const remaining = 200 - noteVal.length;
                  return (
                    <div key={m.user.id} className="p-2">
                      <div className="flex items-center justify-between mb-1">
                        <div className="text-sm font-medium">{memberName(m)}</div>
                        <div
                          className={`text-[10px] font-mono tabular-nums ${
                            remaining < 20
                              ? "text-amber-600 dark:text-amber-400"
                              : "text-muted-foreground"
                          }`}
                          data-testid={`note-charcount-${m.user.id}`}
                        >
                          {noteVal.length}/200
                        </div>
                      </div>
                      <textarea
                        value={noteVal}
                        onChange={(e) =>
                          setPlayerNotes((prev) => ({
                            ...prev,
                            [m.user.id]: e.target.value.slice(0, 200),
                          }))
                        }
                        placeholder="e.g. Plays defense, fast skater..."
                        maxLength={200}
                        rows={1}
                        className="w-full p-2 bg-card border border-border rounded text-xs resize-none"
                        data-testid={`textarea-note-${m.user.id}`}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {stepId === "review" && (
            <div className="space-y-3" data-testid="step-review">
              <h3 className="font-semibold flex items-center gap-2">
                <Lock className="w-4 h-4" /> Review & Lock
              </h3>
              <div className="space-y-2 text-sm">
                <Row
                  label="Captains"
                  value={`${Object.values(captainAssignments).filter(Boolean).length} of ${teams.length} assigned`}
                  onEdit={() => goTo("captains")}
                />
                <Row label="Goalies" value={goalieMethodLabel(goalieMethod)} onEdit={() => goTo("goalies")} />
                <Row label="Style" value={draftStyle.replace(/_/g, " ")} onEdit={() => goTo("format")} />
                <Row label="Rounds" value={`${totalRounds}`} onEdit={() => goTo("format")} />
                <Row label="Timer" value={`${timePerPick}s · ${timerRuleLabel(timerExpiryRule)}`} onEdit={() => goTo("timer")} />
                <Row
                  label="Skill ranking"
                  value={skillRankingEnabled ? `On (${skillScale})` : "Off"}
                  onEdit={() => goTo("skill")}
                />
                <Row label="Buddy pairs" value={`${buddyPairs.length}`} onEdit={() => goTo("buddies")} />
                <Row
                  label="Player notes"
                  value={`${Object.values(playerNotes).filter(Boolean).length}`}
                  onEdit={() => goTo("notes")}
                />
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-border p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] flex gap-2 shrink-0">
          {stepIdx > 0 ? (
            <button
              onClick={prev}
              className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground border border-border rounded-lg"
              data-testid="button-wizard-back"
            >
              Back
            </button>
          ) : (
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground border border-border rounded-lg"
              data-testid="button-wizard-cancel"
            >
              Cancel
            </button>
          )}
          {stepIdx < STEPS.length - 1 ? (
            <button
              onClick={next}
              className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium flex items-center justify-center gap-1"
              data-testid="button-wizard-next"
            >
              Next <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <>
              <button
                onClick={() => saveMutation.mutate(false)}
                disabled={saveMutation.isPending}
                className="flex-1 px-4 py-2 border border-primary text-primary rounded-lg text-sm font-medium disabled:opacity-50"
                data-testid="button-wizard-save"
              >
                {saveMutation.isPending ? "Saving..." : "Save Only"}
              </button>
              <button
                onClick={() => saveMutation.mutate(true)}
                disabled={saveMutation.isPending}
                className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium flex items-center justify-center gap-1 disabled:opacity-50"
                data-testid="button-wizard-launch"
              >
                <Snowflake className="w-4 h-4" /> Launch Draft
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, onEdit }: { label: string; value: string; onEdit: () => void }) {
  return (
    <div className="flex items-center justify-between p-3 bg-card border border-border rounded-lg">
      <div>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-sm font-medium capitalize">{value}</div>
      </div>
      <button onClick={onEdit} className="text-xs text-primary hover:underline">
        Edit
      </button>
    </div>
  );
}
