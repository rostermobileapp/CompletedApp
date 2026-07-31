import { useState, useEffect, useMemo } from 'react';
import { useLocation, useParams, useSearch } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  ArrowLeft, Plus, X, Save, TrendingUp, Minus,
  Flame, Snowflake, Trophy
} from 'lucide-react';
import { setPageTransitionDirection } from '@/components/PageTransition';
import { ClickableAvatar } from '@/components/ClickableAvatar';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

type SlotState = {
  playerId: string | null;
  playerName: string | null;
  playerImage?: string | null;
  assignmentId?: string;
};

type LineEditor = {
  id?: string; // DB lineCombination id (undefined if not yet saved)
  lineType: 'forward' | 'defense';
  lineNumber: number;
  slots: Record<string, SlotState>; // key = position
};

type PickerTarget = {
  lineType: 'forward' | 'defense';
  lineIdx: number;
  position: string;
};

type ComboStat = {
  playerIds: string[];
  lineType: string;
  gamesTogether: number;
  goalsFor: number;
  goalsForPerGame: number;
};

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

const FORWARD_POSITIONS = ['LW', 'C', 'RW'];
const DEFENSE_POSITIONS = ['LD', 'RD'];

function makeEmptyLine(lineType: 'forward' | 'defense', lineNumber: number): LineEditor {
  const positions = lineType === 'forward' ? FORWARD_POSITIONS : DEFENSE_POSITIONS;
  const slots: Record<string, SlotState> = {};
  for (const pos of positions) {
    slots[pos] = { playerId: null, playerName: null };
  }
  return { lineType, lineNumber, slots };
}

function dbLinesToEditorState(dbLines: any[]): {
  forwardLines: LineEditor[];
  defensePairs: LineEditor[];
} {
  const forwards = dbLines
    .filter((l) => l.lineType === 'forward')
    .sort((a, b) => a.lineNumber - b.lineNumber);
  const defense = dbLines
    .filter((l) => l.lineType === 'defense')
    .sort((a, b) => a.lineNumber - b.lineNumber);

  const toEditor = (l: any): LineEditor => {
    const positions = l.lineType === 'forward' ? FORWARD_POSITIONS : DEFENSE_POSITIONS;
    const slots: Record<string, SlotState> = {};
    for (const pos of positions) {
      slots[pos] = { playerId: null, playerName: null };
    }
    for (const a of l.assignments ?? []) {
      if (a.position && slots[a.position] !== undefined) {
        slots[a.position] = {
          playerId: a.playerId ?? a.player?.id ?? null,
          playerName: a.player
            ? `${a.player.firstName || ''} ${a.player.lastName || ''}`.trim()
            : null,
          playerImage: a.player?.profileImageUrl ?? null,
          assignmentId: a.id,
        };
      }
    }
    return { id: l.id, lineType: l.lineType, lineNumber: l.lineNumber, slots };
  };

  const fLines =
    forwards.length > 0
      ? forwards.map(toEditor)
      : [makeEmptyLine('forward', 1), makeEmptyLine('forward', 2)];
  const dPairs =
    defense.length > 0
      ? defense.map(toEditor)
      : [makeEmptyLine('defense', 1), makeEmptyLine('defense', 2)];

  return { forwardLines: fLines, defensePairs: dPairs };
}

// ─────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────

function SlotButton({
  position,
  slot,
  canEdit,
  onClick,
}: {
  position: string;
  slot: SlotState;
  canEdit: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={canEdit ? onClick : undefined}
      className={`flex flex-col items-center gap-1 flex-1 min-w-0 rounded-xl border p-2 transition-colors
        ${slot.playerId
          ? 'bg-card border-border'
          : canEdit
            ? 'border-dashed border-border bg-muted/30 hover:bg-muted/60'
            : 'border-dashed border-border bg-muted/20'
        }
        ${canEdit ? 'cursor-pointer active:scale-95' : 'cursor-default'}
      `}
      data-testid={`slot-${position}`}
    >
      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">
        {position}
      </span>
      {slot.playerId ? (
        <>
          <ClickableAvatar
            userId={slot.playerId}
            profileImageUrl={slot.playerImage}
            firstName={slot.playerName?.split(' ')[0]}
            lastName={slot.playerName?.split(' ')[1]}
            size="xs"
            className="!h-8 !w-8 pointer-events-none"
          />
          <span className="text-[11px] font-medium text-center leading-tight truncate w-full text-center">
            {slot.playerName?.split(' ').pop() || '—'}
          </span>
        </>
      ) : (
        <div className="h-8 w-8 rounded-full bg-muted/50 flex items-center justify-center">
          {canEdit && <Plus className="w-4 h-4 text-muted-foreground" />}
        </div>
      )}
    </button>
  );
}

function ComboTrend({
  combo,
  members,
}: {
  combo: ComboStat | undefined;
  members: any[];
}) {
  if (!combo) return null;

  const MIN_GAMES = 3;
  const names = combo.playerIds
    .map((id) => {
      const m = members.find((m: any) => (m.user?.id ?? m.userId) === id);
      return m?.user?.lastName ?? m?.displayLastName ?? null;
    })
    .filter(Boolean);

  if (combo.gamesTogether < MIN_GAMES) {
    return (
      <div className="mt-1.5 flex items-center gap-1 text-[11px] text-muted-foreground">
        <Minus className="w-3 h-3" />
        Not enough data ({combo.gamesTogether} game{combo.gamesTogether !== 1 ? 's' : ''})
      </div>
    );
  }

  const gpg = combo.goalsForPerGame;
  const icon =
    gpg >= 1.5 ? <Flame className="w-3 h-3 text-orange-500" /> :
    gpg <= 0.5 ? <Snowflake className="w-3 h-3 text-blue-400" /> :
    <TrendingUp className="w-3 h-3 text-green-500" />;

  return (
    <div className="mt-1.5 flex items-center gap-1.5 text-[11px]">
      {icon}
      <span className="font-semibold">{gpg.toFixed(1)} GF/game</span>
      <span className="text-muted-foreground">({combo.gamesTogether} games)</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────

export default function SetLines() {
  const [, navigate] = useLocation();
  const { teamId } = useParams<{ teamId: string }>();
  const rawSearch = useSearch(); // e.g. "?gameId=abc" or ""
  const { user } = useAuth();
  const { toast } = useToast();

  // Read gameId from query string
  const searchParams = useMemo(() => new URLSearchParams(rawSearch), [rawSearch]);
  const gameIdFromUrl = searchParams.get('gameId') ?? null;

  const [selectedGameId, setSelectedGameId] = useState<string | null>(gameIdFromUrl);
  const [forwardLines, setForwardLines] = useState<LineEditor[]>([
    makeEmptyLine('forward', 1),
    makeEmptyLine('forward', 2),
  ]);
  const [defensePairs, setDefensePairs] = useState<LineEditor[]>([
    makeEmptyLine('defense', 1),
    makeEmptyLine('defense', 2),
  ]);
  const [pickerTarget, setPickerTarget] = useState<PickerTarget | null>(null);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<'lines' | 'combos'>('lines');
  const [minComboGames, setMinComboGames] = useState(3);
  const [prefillOffered, setPrefillOffered] = useState(false);
  const [prefillDismissed, setPrefillDismissed] = useState(false);

  // ── Fetch team info ──────────────────────────────────────────
  const { data: team } = useQuery({
    queryKey: ['/api/teams', teamId],
    enabled: !!teamId,
  });

  const isCaptain =
    !!(team as any)?.captainId && (team as any)?.captainId === (user as any)?.id;
  const isCreator =
    !!(team as any)?.creatorId && (team as any)?.creatorId === (user as any)?.id;
  const canEdit = isCaptain || isCreator;

  // ── Fetch team members ───────────────────────────────────────
  const { data: teamMembers = [] } = useQuery<any[]>({
    queryKey: ['/api/teams', teamId, 'members'],
    enabled: !!teamId,
  });

  // ── Fetch all user games (to populate game picker) ───────────
  const { data: allGames = [] } = useQuery<any[]>({
    queryKey: ['/api/user/games/all'],
    enabled: !!user,
  });

  const teamGames = useMemo(
    () =>
      (allGames as any[])
        .filter(
          (g: any) => g.homeTeamId === teamId || g.awayTeamId === teamId,
        )
        .sort(
          (a: any, b: any) =>
            new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime(),
        ),
    [allGames, teamId],
  );

  // ── Fetch existing lines for selected game ───────────────────
  const { data: existingLines = [], isLoading: linesLoading } = useQuery<any[]>({
    queryKey: ['/api/teams', teamId, 'line-combinations', selectedGameId],
    queryFn: async () => {
      const qs = selectedGameId ? `?gameId=${selectedGameId}` : '';
      const res = await apiRequest('GET', `/api/teams/${teamId}/line-combinations${qs}`);
      return res.json();
    },
    enabled: !!teamId && !!selectedGameId,
    staleTime: 30 * 1000,
  });

  // ── Fetch combo stats ────────────────────────────────────────
  const { data: comboStats } = useQuery<{
    forward: ComboStat[];
    defense: ComboStat[];
  }>({
    queryKey: ['/api/teams', teamId, 'line-combos', 'stats'],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/teams/${teamId}/line-combos/stats`);
      return res.json();
    },
    enabled: !!teamId,
    staleTime: 5 * 60 * 1000,
  });

  // ── Sync DB → local state when lines load ───────────────────
  useEffect(() => {
    if (!selectedGameId) return;
    if (linesLoading) return;
    const { forwardLines: fl, defensePairs: dp } = dbLinesToEditorState(existingLines as any[]);
    setForwardLines(fl);
    setDefensePairs(dp);
    setPrefillOffered(false);
    setPrefillDismissed(false);
  }, [existingLines, selectedGameId, linesLoading]);

  // ── Offer pre-fill when game selected but has no lines ───────
  const hasNoLines =
    !linesLoading &&
    !!selectedGameId &&
    existingLines.length === 0 &&
    !prefillOffered &&
    !prefillDismissed;

  useEffect(() => {
    if (hasNoLines) setPrefillOffered(true);
  }, [hasNoLines]);

  // ── Pre-fill from last game ──────────────────────────────────
  const handlePrefill = async () => {
    setPrefillOffered(false);
    setPrefillDismissed(true);

    // Find the most recent game BEFORE the selected game that has lines
    const selectedGame = teamGames.find((g) => g.id === selectedGameId);
    if (!selectedGame) return;

    const previousGames = teamGames.filter(
      (g) =>
        g.id !== selectedGameId &&
        new Date(g.scheduledAt) < new Date(selectedGame.scheduledAt),
    );

    for (const prev of previousGames) {
      const res = await apiRequest(
        'GET',
        `/api/teams/${teamId}/line-combinations?gameId=${prev.id}`,
      );
      const prevLines: any[] = await res.json();
      if (prevLines.length > 0) {
        const { forwardLines: fl, defensePairs: dp } = dbLinesToEditorState(prevLines);
        // Clear the assignment IDs so we know these are new (unsaved) assignments
        const clearIds = (lines: LineEditor[]) =>
          lines.map((l) => ({
            ...l,
            id: undefined,
            slots: Object.fromEntries(
              Object.entries(l.slots).map(([pos, slot]) => [
                pos,
                { ...slot, assignmentId: undefined },
              ]),
            ),
          }));
        setForwardLines(clearIds(fl));
        setDefensePairs(clearIds(dp));
        toast({ title: 'Lines copied from previous game' });
        return;
      }
    }
    toast({ title: 'No previous game lines found', variant: 'destructive' });
  };

  // ── Save all lines (atomic server-side replace) ───────────────
  const handleSave = async () => {
    if (!selectedGameId || !teamId) return;
    setSaving(true);
    try {
      // Build the lines payload for the atomic endpoint
      const linesPayload = [...forwardLines, ...defensePairs]
        .map((line) => {
          const slots = Object.entries(line.slots)
            .filter(([, slot]) => slot.playerId)
            .map(([position, slot]) => ({
              position,
              playerId: slot.playerId as string,
            }));
          return {
            lineType: line.lineType,
            lineNumber: line.lineNumber,
            name: `${line.lineType === 'forward' ? 'Line' : 'Pair'} ${line.lineNumber}`,
            slots,
          };
        })
        .filter((line) => line.slots.length > 0); // skip fully-empty lines

      const resp = await apiRequest(
        'PUT',
        `/api/teams/${teamId}/line-combinations/game/${selectedGameId}`,
        { lines: linesPayload },
      );

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error((err as any).message ?? 'Save failed');
      }

      await queryClient.invalidateQueries({
        queryKey: ['/api/teams', teamId, 'line-combinations'],
      });
      await queryClient.invalidateQueries({
        queryKey: ['/api/teams', teamId, 'line-combos', 'stats'],
      });

      toast({ title: 'Lines saved!' });
    } catch (err: any) {
      console.error('[SetLines] Save error:', err);
      toast({
        title: 'Failed to save lines',
        description: err?.message ?? 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  // ── Player picker ────────────────────────────────────────────
  const assignedPlayerIds = useMemo(() => {
    const ids = new Set<string>();
    for (const line of [...forwardLines, ...defensePairs]) {
      for (const slot of Object.values(line.slots)) {
        if (slot.playerId) ids.add(slot.playerId);
      }
    }
    return ids;
  }, [forwardLines, defensePairs]);

  const benchPlayers = useMemo(
    () =>
      (teamMembers as any[]).filter(
        (m) => !assignedPlayerIds.has(m.user?.id ?? m.userId ?? ''),
      ),
    [teamMembers, assignedPlayerIds],
  );

  function openPicker(target: PickerTarget) {
    if (!canEdit) return;
    setPickerTarget(target);
  }

  function handlePickPlayer(playerId: string | null) {
    if (!pickerTarget) return;
    const { lineType, lineIdx, position } = pickerTarget;

    // Deep-clone both arrays so we can mutate freely
    const newForward: LineEditor[] = forwardLines.map((l) => ({
      ...l,
      slots: Object.fromEntries(
        Object.entries(l.slots).map(([p, s]) => [p, { ...s }]),
      ),
    }));
    const newDefense: LineEditor[] = defensePairs.map((l) => ({
      ...l,
      slots: Object.fromEntries(
        Object.entries(l.slots).map(([p, s]) => [p, { ...s }]),
      ),
    }));

    const targetArr = lineType === 'forward' ? newForward : newDefense;

    if (!playerId) {
      // Clear the target slot
      targetArr[lineIdx].slots[position] = { playerId: null, playerName: null };
      setForwardLines(newForward);
      setDefensePairs(newDefense);
      setPickerTarget(null);
      return;
    }

    // Resolve player display info
    const member = (teamMembers as any[]).find(
      (m) => (m.user?.id ?? m.userId) === playerId,
    );
    const playerName = member
      ? `${member.user?.firstName || member.displayFirstName || ''} ${member.user?.lastName || member.displayLastName || ''}`.trim()
      : '';
    const playerImage = member?.user?.profileImageUrl ?? null;

    // Find the current location of the selected player across both arrays
    type SlotLoc = { arr: LineEditor[]; li: number; pos: string };
    let sourceLoc: SlotLoc | null = null;
    outer: for (const arr of [newForward, newDefense]) {
      for (let li = 0; li < arr.length; li++) {
        for (const pos of Object.keys(arr[li].slots)) {
          if (arr[li].slots[pos].playerId === playerId) {
            sourceLoc = { arr, li, pos };
            break outer;
          }
        }
      }
    }

    // Read the player currently in the target slot (may be null)
    const displacedSlot = { ...targetArr[lineIdx].slots[position] };

    if (sourceLoc) {
      if (displacedSlot.playerId) {
        // Genuine swap: displaced player moves to the vacated source slot
        sourceLoc.arr[sourceLoc.li].slots[sourceLoc.pos] = {
          playerId: displacedSlot.playerId,
          playerName: displacedSlot.playerName,
          playerImage: displacedSlot.playerImage ?? null,
        };
      } else {
        // Target was empty — just clear the source slot
        sourceLoc.arr[sourceLoc.li].slots[sourceLoc.pos] = {
          playerId: null,
          playerName: null,
        };
      }
    }
    // If no sourceLoc the player was on the bench; displaced player (if any) simply moves to bench

    // Place selected player in target slot
    targetArr[lineIdx].slots[position] = { playerId, playerName, playerImage };

    setForwardLines(newForward);
    setDefensePairs(newDefense);
    setPickerTarget(null);
  }

  // ── Combo lookup helper ──────────────────────────────────────
  function findCombo(line: LineEditor): ComboStat | undefined {
    if (!comboStats) return undefined;
    const playerIds = Object.values(line.slots)
      .map((s) => s.playerId)
      .filter(Boolean) as string[];
    const sorted = [...playerIds].sort();
    const statsArr =
      line.lineType === 'forward' ? comboStats.forward : comboStats.defense;
    return statsArr.find(
      (c) =>
        c.playerIds.length === sorted.length &&
        c.playerIds.every((id, i) => id === sorted[i]),
    );
  }

  // ── Render helpers ───────────────────────────────────────────
  function addLine(lineType: 'forward' | 'defense') {
    if (lineType === 'forward') {
      setForwardLines((prev) => [
        ...prev,
        makeEmptyLine('forward', prev.length + 1),
      ]);
    } else {
      setDefensePairs((prev) => [
        ...prev,
        makeEmptyLine('defense', prev.length + 1),
      ]);
    }
  }

  function removeLine(lineType: 'forward' | 'defense', idx: number) {
    if (lineType === 'forward') {
      setForwardLines((prev) =>
        prev
          .filter((_, i) => i !== idx)
          .map((l, i) => ({ ...l, lineNumber: i + 1 })),
      );
    } else {
      setDefensePairs((prev) =>
        prev
          .filter((_, i) => i !== idx)
          .map((l, i) => ({ ...l, lineNumber: i + 1 })),
      );
    }
  }

  function formatGameLabel(game: any) {
    const date = new Date(game.scheduledAt);
    const dateStr = date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
    const opponent =
      game.homeTeamId === teamId
        ? (game.awayTeam?.name ?? game.opponentName ?? 'Opponent')
        : (game.homeTeam?.name ?? 'Opponent');
    const prefix = game.homeTeamId === teamId ? 'vs' : '@';
    const completed = game.isCompleted ? ' ✓' : '';
    return `${dateStr} ${prefix} ${opponent}${completed}`;
  }

  // ── Render ───────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background pb-28">
      {/* Header */}
      <div className="bg-card border-b border-border px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <Button
          variant="ghost"
          size="sm"
          className="p-2 -ml-1"
          onClick={() => {
            setPageTransitionDirection('down');
            window.history.back();
          }}
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <h1 className="text-lg font-semibold flex-1">Game Lines</h1>
        {canEdit && selectedGameId && (
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving}
            className="gap-1.5"
            data-testid="button-save-lines"
          >
            <Save className="w-3.5 h-3.5" />
            {saving ? 'Saving…' : 'Save'}
          </Button>
        )}
      </div>

      <div className="px-4 pt-4 space-y-4">
        {/* Game picker */}
        <div>
          <label className="text-sm font-medium text-muted-foreground mb-1 block">
            Game
          </label>
          <Select
            value={selectedGameId ?? ''}
            onValueChange={(v) => setSelectedGameId(v || null)}
          >
            <SelectTrigger className="w-full" data-testid="select-game">
              <SelectValue placeholder="Select a game…" />
            </SelectTrigger>
            <SelectContent>
              {teamGames.map((g) => (
                <SelectItem key={g.id} value={g.id}>
                  {formatGameLabel(g)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* No game selected */}
        {!selectedGameId && (
          <Card className="hairline elev-rest">
            <CardContent className="p-8 text-center">
              <Trophy className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground text-sm">
                Select a game to view or set lines.
              </p>
            </CardContent>
          </Card>
        )}

        {selectedGameId && (
          <>
            {/* Pre-fill banner */}
            {prefillOffered && canEdit && (
              <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-xl p-3 flex items-center gap-3">
                <div className="flex-1 text-sm text-blue-800 dark:text-blue-200">
                  No lines set yet. Copy from your last game?
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0 text-xs h-7"
                  onClick={() => { setPrefillOffered(false); setPrefillDismissed(true); }}
                >
                  Skip
                </Button>
                <Button
                  size="sm"
                  className="shrink-0 text-xs h-7"
                  onClick={handlePrefill}
                  data-testid="button-prefill-lines"
                >
                  Copy Lines
                </Button>
              </div>
            )}

            {/* Tabs */}
            <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
              <TabsList className="w-full">
                <TabsTrigger value="lines" className="flex-1">
                  Set Lines
                </TabsTrigger>
                <TabsTrigger value="combos" className="flex-1">
                  Top Combos
                </TabsTrigger>
              </TabsList>

              {/* ── Set Lines tab ── */}
              <TabsContent value="lines" className="mt-3 space-y-4">
                {/* Forward Lines */}
                <div>
                  <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                    Forward Lines
                  </h2>
                  <div className="space-y-3">
                    {forwardLines.map((line, idx) => {
                      const combo = findCombo(line);
                      return (
                        <Card key={idx} className="hairline elev-rest">
                          <CardContent className="p-3">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs font-semibold text-muted-foreground">
                                Line {idx + 1}
                              </span>
                              {canEdit && forwardLines.length > 1 && (
                                <button
                                  onClick={() => removeLine('forward', idx)}
                                  className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                                  data-testid={`remove-forward-line-${idx}`}
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                            <div className="flex gap-1.5">
                              {FORWARD_POSITIONS.map((pos) => (
                                <SlotButton
                                  key={pos}
                                  position={pos}
                                  slot={line.slots[pos]}
                                  canEdit={canEdit}
                                  onClick={() =>
                                    openPicker({
                                      lineType: 'forward',
                                      lineIdx: idx,
                                      position: pos,
                                    })
                                  }
                                />
                              ))}
                            </div>
                            <ComboTrend combo={combo} members={teamMembers} />
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                  {canEdit && forwardLines.length < 4 && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2 w-full gap-1.5 border-dashed"
                      onClick={() => addLine('forward')}
                      data-testid="button-add-forward-line"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add Forward Line
                    </Button>
                  )}
                </div>

                {/* Defense Pairs */}
                <div>
                  <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                    Defense Pairs
                  </h2>
                  <div className="space-y-3">
                    {defensePairs.map((line, idx) => {
                      const combo = findCombo(line);
                      return (
                        <Card key={idx} className="hairline elev-rest">
                          <CardContent className="p-3">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs font-semibold text-muted-foreground">
                                Pair {idx + 1}
                              </span>
                              {canEdit && defensePairs.length > 1 && (
                                <button
                                  onClick={() => removeLine('defense', idx)}
                                  className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                                  data-testid={`remove-defense-pair-${idx}`}
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                            <div className="flex gap-2">
                              {DEFENSE_POSITIONS.map((pos) => (
                                <SlotButton
                                  key={pos}
                                  position={pos}
                                  slot={line.slots[pos]}
                                  canEdit={canEdit}
                                  onClick={() =>
                                    openPicker({
                                      lineType: 'defense',
                                      lineIdx: idx,
                                      position: pos,
                                    })
                                  }
                                />
                              ))}
                              {/* spacer so LD/RD fill width nicely */}
                              <div className="flex-1" />
                            </div>
                            <ComboTrend combo={combo} members={teamMembers} />
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                  {canEdit && defensePairs.length < 4 && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2 w-full gap-1.5 border-dashed"
                      onClick={() => addLine('defense')}
                      data-testid="button-add-defense-pair"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add Defense Pair
                    </Button>
                  )}
                </div>

                {/* Bench */}
                <div>
                  <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                    Bench ({benchPlayers.length})
                  </h2>
                  {benchPlayers.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-3">
                      All players are assigned!
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {benchPlayers.map((m: any) => {
                        const memberId = m.user?.id ?? m.userId;
                        const name = `${m.user?.firstName ?? m.displayFirstName ?? ''} ${m.user?.lastName ?? m.displayLastName ?? ''}`.trim();
                        return (
                          <div
                            key={memberId}
                            className="flex items-center gap-1.5 bg-card border border-border rounded-full px-2.5 py-1 text-sm"
                            data-testid={`bench-player-${memberId}`}
                          >
                            <ClickableAvatar
                              userId={memberId}
                              profileImageUrl={m.user?.profileImageUrl}
                              firstName={m.user?.firstName}
                              lastName={m.user?.lastName}
                              size="xs"
                              className="!h-5 !w-5 pointer-events-none"
                            />
                            <span className="text-xs font-medium">
                              {m.user?.lastName ?? m.displayLastName ?? name}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </TabsContent>

              {/* ── Top Combos tab ── */}
              <TabsContent value="combos" className="mt-3 space-y-4">
                {/* Min games filter */}
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Min games:</span>
                  {[1, 3, 5].map((n) => (
                    <button
                      key={n}
                      onClick={() => setMinComboGames(n)}
                      className={`px-3 py-1 rounded-full text-sm font-medium border transition-colors ${
                        minComboGames === n
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-card border-border text-muted-foreground hover:bg-muted'
                      }`}
                    >
                      {n}+
                    </button>
                  ))}
                </div>

                {/* Forward combos */}
                <div>
                  <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                    Forward Lines
                  </h2>
                  {(!comboStats || comboStats.forward.filter((c) => c.gamesTogether >= minComboGames).length === 0) ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No forward line data yet (need ≥{minComboGames} games together).
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {comboStats!.forward
                        .filter((c) => c.gamesTogether >= minComboGames)
                        .sort((a, b) => b.goalsForPerGame - a.goalsForPerGame)
                        .map((combo, i) => (
                          <ComboCard
                            key={i}
                            combo={combo}
                            members={teamMembers}
                            rank={i + 1}
                          />
                        ))}
                    </div>
                  )}
                </div>

                {/* Defense combos */}
                <div>
                  <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                    Defense Pairs
                  </h2>
                  {(!comboStats || comboStats.defense.filter((c) => c.gamesTogether >= minComboGames).length === 0) ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No defense pair data yet (need ≥{minComboGames} games together).
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {comboStats!.defense
                        .filter((c) => c.gamesTogether >= minComboGames)
                        .sort((a, b) => b.goalsForPerGame - a.goalsForPerGame)
                        .map((combo, i) => (
                          <ComboCard
                            key={i}
                            combo={combo}
                            members={teamMembers}
                            rank={i + 1}
                          />
                        ))}
                    </div>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>

      {/* Player picker sheet */}
      <Sheet open={!!pickerTarget} onOpenChange={(open) => { if (!open) setPickerTarget(null); }}>
        <SheetContent side="bottom" className="h-[70vh] rounded-t-2xl overflow-y-auto pb-safe">
          <SheetHeader className="mb-4">
            <SheetTitle>
              Pick player for{' '}
              {pickerTarget && (
                <span className="text-primary">
                  {pickerTarget.lineType === 'forward' ? 'Line' : 'Pair'}{' '}
                  {pickerTarget.lineIdx + 1} — {pickerTarget.position}
                </span>
              )}
            </SheetTitle>
          </SheetHeader>

          {/* Clear slot option */}
          {pickerTarget && (() => {
            const lines = pickerTarget.lineType === 'forward' ? forwardLines : defensePairs;
            const currentSlot = lines[pickerTarget.lineIdx]?.slots[pickerTarget.position];
            return currentSlot?.playerId ? (
              <button
                className="w-full flex items-center gap-3 p-3 rounded-xl border border-dashed border-border mb-3 hover:bg-muted/50 transition-colors"
                onClick={() => handlePickPlayer(null)}
                data-testid="picker-clear-slot"
              >
                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                  <X className="w-5 h-5 text-muted-foreground" />
                </div>
                <span className="text-sm font-medium text-muted-foreground">
                  Clear slot
                </span>
              </button>
            ) : null;
          })()}

          {/* All players list */}
          <div className="space-y-1">
            {(teamMembers as any[]).map((m: any) => {
              const memberId = m.user?.id ?? m.userId;
              if (!memberId) return null;
              const firstName = m.user?.firstName ?? m.displayFirstName ?? '';
              const lastName = m.user?.lastName ?? m.displayLastName ?? '';
              const isAssigned = assignedPlayerIds.has(memberId);

              // Find where this player is currently assigned
              let assignedAt = '';
              for (const [type, lines] of [['forward', forwardLines], ['defense', defensePairs]] as any) {
                for (let i = 0; i < lines.length; i++) {
                  for (const [pos, slot] of Object.entries(lines[i].slots)) {
                    if ((slot as SlotState).playerId === memberId) {
                      const label = type === 'forward' ? 'Line' : 'Pair';
                      assignedAt = `${label} ${i + 1} · ${pos}`;
                    }
                  }
                }
              }

              return (
                <button
                  key={memberId}
                  className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-muted/50 transition-colors text-left"
                  onClick={() => handlePickPlayer(memberId)}
                  data-testid={`picker-player-${memberId}`}
                >
                  <ClickableAvatar
                    userId={memberId}
                    profileImageUrl={m.user?.profileImageUrl}
                    firstName={firstName}
                    lastName={lastName}
                    size="sm"
                    className="pointer-events-none"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">
                      {firstName} {lastName}
                    </p>
                    {assignedAt && (
                      <p className="text-xs text-muted-foreground">{assignedAt}</p>
                    )}
                  </div>
                  {isAssigned && (
                    <Badge variant="outline" className="text-[10px] shrink-0">
                      Move here
                    </Badge>
                  )}
                </button>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Combo card for Top Combos tab
// ─────────────────────────────────────────────────────────────

function ComboCard({
  combo,
  members,
  rank,
}: {
  combo: ComboStat;
  members: any[];
  rank: number;
}) {
  const names = combo.playerIds.map((id) => {
    const m = (members as any[]).find(
      (m) => (m.user?.id ?? m.userId) === id,
    );
    return m
      ? `${m.user?.firstName ?? m.displayFirstName ?? ''} ${m.user?.lastName ?? m.displayLastName ?? ''}`.trim()
      : id.slice(0, 8);
  });

  const gpg = combo.goalsForPerGame;
  const trendColor =
    gpg >= 1.5
      ? 'text-orange-500'
      : gpg >= 1.0
        ? 'text-green-600'
        : 'text-blue-400';

  return (
    <Card className="hairline elev-rest">
      <CardContent className="p-3 flex items-center gap-3">
        <div className="text-lg font-bold text-muted-foreground w-6 text-center shrink-0">
          {rank}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{names.join(' · ')}</p>
          <p className="text-xs text-muted-foreground">
            {combo.gamesTogether} games · {combo.goalsFor} GF
          </p>
        </div>
        <div className={`text-right shrink-0 ${trendColor}`}>
          <p className="text-base font-bold">{gpg.toFixed(2)}</p>
          <p className="text-[10px] font-medium">GF/game</p>
        </div>
      </CardContent>
    </Card>
  );
}
