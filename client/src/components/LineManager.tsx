import { useState, useEffect, useMemo, useRef } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  Users, UserPlus, Plus, Upload, Clock,
  Flame, Snowflake, X, Save, TrendingUp, Minus,
} from 'lucide-react';
import { ClickableAvatar } from '@/components/ClickableAvatar';
import { PlayerActionSheet } from '@/components/PlayerActionSheet';
import { useToast } from '@/hooks/use-toast';
import { getAuthHeaders, queryClient, apiRequest } from '@/lib/queryClient';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

// ─────────────────────────────────────────────────────────────
// Types (shared with the inline line editor)
// ─────────────────────────────────────────────────────────────

type SlotState = {
  playerId: string | null;
  playerName: string | null;
  playerImage?: string | null;
  assignmentId?: string;
};

type LineEditor = {
  id?: string;
  lineType: 'forward' | 'defense';
  lineNumber: number;
  slots: Record<string, SlotState>;
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
// Constants
// ─────────────────────────────────────────────────────────────

const FORWARD_POSITIONS = ['LW', 'C', 'RW'];
const DEFENSE_POSITIONS = ['LD', 'RD'];

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function makeEmptyLine(lineType: 'forward' | 'defense', lineNumber: number): LineEditor {
  const positions = lineType === 'forward' ? FORWARD_POSITIONS : DEFENSE_POSITIONS;
  const slots: Record<string, SlotState> = {};
  for (const pos of positions) slots[pos] = { playerId: null, playerName: null };
  return { lineType, lineNumber, slots };
}

function dbLinesToEditorState(dbLines: any[]): {
  forwardLines: LineEditor[];
  defensePairs: LineEditor[];
} {
  const forwards = dbLines.filter((l) => l.lineType === 'forward').sort((a, b) => a.lineNumber - b.lineNumber);
  const defense  = dbLines.filter((l) => l.lineType === 'defense').sort((a, b) => a.lineNumber - b.lineNumber);

  const toEditor = (l: any): LineEditor => {
    const positions = l.lineType === 'forward' ? FORWARD_POSITIONS : DEFENSE_POSITIONS;
    const slots: Record<string, SlotState> = {};
    for (const pos of positions) slots[pos] = { playerId: null, playerName: null };
    for (const a of l.assignments ?? []) {
      if (a.position && slots[a.position] !== undefined) {
        slots[a.position] = {
          playerId: a.playerId ?? a.player?.id ?? null,
          playerName: a.player ? `${a.player.firstName || ''} ${a.player.lastName || ''}`.trim() : null,
          playerImage: a.player?.profileImageUrl ?? null,
          assignmentId: a.id,
        };
      }
    }
    return { id: l.id, lineType: l.lineType, lineNumber: l.lineNumber, slots };
  };

  const fLines = forwards.length > 0
    ? forwards.map(toEditor)
    : [makeEmptyLine('forward', 1), makeEmptyLine('forward', 2)];
  const dPairs = defense.length > 0
    ? defense.map(toEditor)
    : [makeEmptyLine('defense', 1), makeEmptyLine('defense', 2)];

  return { forwardLines: fLines, defensePairs: dPairs };
}

// ─────────────────────────────────────────────────────────────
// Slot button sub-component
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
          ? 'bg-background border-border'
          : canEdit
            ? 'border-dashed border-border bg-muted/30 hover:bg-muted/60'
            : 'border-dashed border-border bg-muted/20'
        }
        ${canEdit ? 'cursor-pointer active:scale-95' : 'cursor-default'}
      `}
      data-testid={`slot-${position}`}
    >
      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">{position}</span>
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
          <span className="text-[11px] font-medium text-center leading-tight truncate w-full">
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

// ─────────────────────────────────────────────────────────────
// Combo trend badge
// ─────────────────────────────────────────────────────────────

function ComboTrend({ combo, members }: { combo: ComboStat | undefined; members: any[] }) {
  if (!combo) return null;
  const MIN_GAMES = 3;
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
// Props
// ─────────────────────────────────────────────────────────────

interface LineManagerProps {
  teamId: string;
  isTeamCaptain: boolean;
  teamMembers: any[];
  leagueId?: string | null;
  seasonId?: string | null;
}

// ─────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────

export function LineManager({ teamId, isTeamCaptain, teamMembers, leagueId, seasonId }: LineManagerProps) {
  const { toast } = useToast();

  // ── View toggle ───────────────────────────────────────────────
  const [view, setView] = useState<'roster' | 'lines'>('roster');

  // ── Roster view state ─────────────────────────────────────────
  const [showAddPlayers, setShowAddPlayers] = useState(false);
  const [actionSheetPlayer, setActionSheetPlayer] = useState<{
    userId: string;
    firstName: string;
    lastName: string;
    profileImageUrl?: string | null;
  } | null>(null);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName]   = useState('');
  const [email, setEmail]         = useState('');
  const [jerseyNumber, setJerseyNumber] = useState('');
  const [position, setPosition]   = useState('');

  const [csvFile, setCsvFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Lines view state ──────────────────────────────────────────
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

  // ── Queries ───────────────────────────────────────────────────

  // Streak data (roster view)
  const { data: streaksData } = useQuery<{ streaks: Record<string, string> }>({
    queryKey: ['/api/teams', teamId, 'streaks', seasonId ?? null],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (seasonId) params.set('seasonId', seasonId);
      const qs = params.toString() ? `?${params}` : '';
      const res = await apiRequest('GET', `/api/teams/${teamId}/streaks${qs}`);
      return res.json();
    },
    enabled: !!teamId && !!leagueId,
    staleTime: 5 * 60 * 1000,
  });

  // Template lines (lines view — gameId=null)
  const { data: existingLines = [], isLoading: linesLoading } = useQuery<any[]>({
    queryKey: ['/api/teams', teamId, 'line-combinations', 'template'],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/teams/${teamId}/line-combinations`);
      return res.json();
    },
    enabled: !!teamId && view === 'lines',
    staleTime: 60 * 1000,
  });

  // Combo stats (lines view)
  const { data: comboStats } = useQuery<{ forward: ComboStat[]; defense: ComboStat[] }>({
    queryKey: ['/api/teams', teamId, 'line-combos', 'stats'],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/teams/${teamId}/line-combos/stats`);
      return res.json();
    },
    enabled: !!teamId && view === 'lines',
    staleTime: 5 * 60 * 1000,
  });

  // ── Sync DB template → editor state ──────────────────────────
  useEffect(() => {
    if (linesLoading) return;
    const { forwardLines: fl, defensePairs: dp } = dbLinesToEditorState(existingLines);
    setForwardLines(fl);
    setDefensePairs(dp);
  }, [existingLines, linesLoading]);

  // ── Mutations (roster view) ───────────────────────────────────

  const addManualPlayerMutation = useMutation({
    mutationFn: async (data: {
      firstName: string; lastName: string;
      email?: string; jerseyNumber?: string; position?: string;
    }) => {
      const response = await apiRequest('POST', `/api/teams/${teamId}/players/manual`, { teamId, ...data });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/teams', teamId, 'members'] });
      toast({ title: 'Player Added', description: 'Player has been added to the roster.' });
      setFirstName(''); setLastName(''); setEmail(''); setJerseyNumber(''); setPosition('');
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const importPlayersMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      const authHeaders = await getAuthHeaders();
      const res = await fetch(`/api/teams/${teamId}/players/import`, {
        method: 'POST', headers: authHeaders, body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: res.statusText }));
        throw new Error(err.message || res.statusText);
      }
      return res.json();
    },
    onSuccess: (data: { successCount: number; failedCount: number }) => {
      queryClient.invalidateQueries({ queryKey: ['/api/teams', teamId, 'members'] });
      const msg = [
        data.successCount > 0 ? `${data.successCount} imported` : null,
        data.failedCount > 0 ? `${data.failedCount} failed` : null,
      ].filter(Boolean).join(', ');
      toast({ title: 'Import Complete', description: msg || 'Players imported.' });
      setCsvFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    onError: (error: Error) => {
      toast({ title: 'Import Failed', description: error.message, variant: 'destructive' });
    },
  });

  // ── Handlers (roster view) ────────────────────────────────────

  const handleAddPlayer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim()) {
      toast({ title: 'Error', description: 'First and last name are required.', variant: 'destructive' });
      return;
    }
    addManualPlayerMutation.mutate({
      firstName: firstName.trim(), lastName: lastName.trim(),
      email: email.trim() || undefined,
      jerseyNumber: jerseyNumber.trim() || undefined,
      position: position.trim() || undefined,
    });
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith('.csv')) {
      toast({ title: 'Invalid File', description: 'Please upload a CSV file.', variant: 'destructive' });
      return;
    }
    setCsvFile(file);
  };

  const handleImportPlayers = () => {
    if (!csvFile) return;
    importPlayersMutation.mutate(csvFile);
  };

  // ── Lines handlers ────────────────────────────────────────────

  const handleSave = async () => {
    if (!teamId) return;
    setSaving(true);
    try {
      const linesPayload = [...forwardLines, ...defensePairs]
        .map((line) => ({
          lineType: line.lineType,
          lineNumber: line.lineNumber,
          name: `${line.lineType === 'forward' ? 'Line' : 'Pair'} ${line.lineNumber}`,
          slots: Object.entries(line.slots)
            .filter(([, slot]) => slot.playerId)
            .map(([pos, slot]) => ({ position: pos, playerId: slot.playerId as string })),
        }))
        .filter((line) => line.slots.length > 0);

      const resp = await apiRequest(
        'PUT',
        `/api/teams/${teamId}/line-combinations/template`,
        { lines: linesPayload },
      );
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error((err as any).message ?? 'Save failed');
      }
      await queryClient.invalidateQueries({ queryKey: ['/api/teams', teamId, 'line-combinations'] });
      await queryClient.invalidateQueries({ queryKey: ['/api/teams', teamId, 'line-combos', 'stats'] });
      toast({ title: 'Lines saved!' });
    } catch (err: any) {
      toast({ title: 'Failed to save lines', description: err?.message ?? 'Please try again.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  // Computed: which player IDs are already assigned
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
    () => teamMembers.filter((m: any) => !assignedPlayerIds.has(m.user?.id ?? m.userId ?? '')),
    [teamMembers, assignedPlayerIds],
  );

  function handlePickPlayer(playerId: string | null) {
    if (!pickerTarget) return;
    const { lineType, lineIdx, position: pos } = pickerTarget;

    // Deep-clone both arrays
    const newForward: LineEditor[] = forwardLines.map((l) => ({
      ...l, slots: Object.fromEntries(Object.entries(l.slots).map(([p, s]) => [p, { ...s }])),
    }));
    const newDefense: LineEditor[] = defensePairs.map((l) => ({
      ...l, slots: Object.fromEntries(Object.entries(l.slots).map(([p, s]) => [p, { ...s }])),
    }));

    const targetArr = lineType === 'forward' ? newForward : newDefense;

    if (!playerId) {
      targetArr[lineIdx].slots[pos] = { playerId: null, playerName: null };
      setForwardLines(newForward);
      setDefensePairs(newDefense);
      setPickerTarget(null);
      return;
    }

    // Resolve display info
    const member = teamMembers.find((m: any) => (m.user?.id ?? m.userId) === playerId);
    const playerName = member
      ? `${member.user?.firstName || member.displayFirstName || ''} ${member.user?.lastName || member.displayLastName || ''}`.trim()
      : '';
    const playerImage = member?.user?.profileImageUrl ?? null;

    // Find the current location of the selected player
    type SlotLoc = { arr: LineEditor[]; li: number; pos: string };
    let sourceLoc: SlotLoc | null = null;
    outer: for (const arr of [newForward, newDefense]) {
      for (let li = 0; li < arr.length; li++) {
        for (const p of Object.keys(arr[li].slots)) {
          if (arr[li].slots[p].playerId === playerId) {
            sourceLoc = { arr, li, pos: p };
            break outer;
          }
        }
      }
    }

    // Displaced player from target slot (if any)
    const displacedSlot = { ...targetArr[lineIdx].slots[pos] };

    if (sourceLoc) {
      if (displacedSlot.playerId) {
        // Genuine swap: move displaced player to vacated source slot
        sourceLoc.arr[sourceLoc.li].slots[sourceLoc.pos] = {
          playerId: displacedSlot.playerId,
          playerName: displacedSlot.playerName,
          playerImage: displacedSlot.playerImage ?? null,
        };
      } else {
        // Clear the source slot
        sourceLoc.arr[sourceLoc.li].slots[sourceLoc.pos] = { playerId: null, playerName: null };
      }
    }
    // If no sourceLoc the player was on bench; displaced (if any) goes to bench

    // Assign to target slot
    targetArr[lineIdx].slots[pos] = { playerId, playerName, playerImage };

    setForwardLines(newForward);
    setDefensePairs(newDefense);
    setPickerTarget(null);
  }

  function addLine(lineType: 'forward' | 'defense') {
    if (lineType === 'forward') {
      setForwardLines((prev) => [...prev, makeEmptyLine('forward', prev.length + 1)]);
    } else {
      setDefensePairs((prev) => [...prev, makeEmptyLine('defense', prev.length + 1)]);
    }
  }

  function removeLine(lineType: 'forward' | 'defense', idx: number) {
    if (lineType === 'forward') {
      setForwardLines((prev) =>
        prev.filter((_, i) => i !== idx).map((l, i) => ({ ...l, lineNumber: i + 1 })),
      );
    } else {
      setDefensePairs((prev) =>
        prev.filter((_, i) => i !== idx).map((l, i) => ({ ...l, lineNumber: i + 1 })),
      );
    }
  }

  function findCombo(line: LineEditor): ComboStat | undefined {
    if (!comboStats) return undefined;
    const playerIds = Object.values(line.slots).map((s) => s.playerId).filter(Boolean) as string[];
    const sorted = [...playerIds].sort();
    const statsArr = line.lineType === 'forward' ? comboStats.forward : comboStats.defense;
    return statsArr.find(
      (c) => c.playerIds.length === sorted.length && c.playerIds.every((id, i) => id === sorted[i]),
    );
  }

  // ── Sorted roster members ─────────────────────────────────────
  const sortedMembers = [...teamMembers].sort((a, b) => {
    const la = (a.displayLastName || a.user?.lastName || '').toLowerCase();
    const lb = (b.displayLastName || b.user?.lastName || '').toLowerCase();
    return la.localeCompare(lb);
  });

  // ── Render ────────────────────────────────────────────────────
  return (
    <>
      <Card className="rounded-lg hairline elev-rest text-card-foreground bg-[#e2e2e2] dark:bg-[#212121] mt-[4px] mb-[4px]">
        {/* ── Header ── */}
        <CardHeader className="flex flex-col space-y-1.5 p-6 pl-[12px] pr-[12px] pt-[8px] pb-[4px]">
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5 shrink-0" />
            {isTeamCaptain && (
              <Badge variant="secondary" className="shrink-0">Captain</Badge>
            )}

            {/* Roster | Lines pill toggle */}
            <div className="flex items-center bg-muted rounded-full p-0.5 text-xs ml-1">
              <button
                onClick={() => setView('roster')}
                className={`px-2.5 py-1 rounded-full font-medium transition-colors ${
                  view === 'roster'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                data-testid="toggle-roster-view"
              >
                Roster
              </button>
              <button
                onClick={() => setView('lines')}
                className={`px-2.5 py-1 rounded-full font-medium transition-colors ${
                  view === 'lines'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                data-testid="toggle-lines-view"
              >
                Lines
              </button>
            </div>

            {/* Add-players button (roster view, captain only) */}
            {isTeamCaptain && view === 'roster' && (
              <button
                onClick={() => setShowAddPlayers(true)}
                className="ml-auto w-7 h-7 rounded-full bg-primary flex items-center justify-center text-primary-foreground hover:bg-primary/80 transition-colors shrink-0"
                data-testid="button-add-players"
                aria-label="Add players"
              >
                <Plus className="w-4 h-4" />
              </button>
            )}

            {/* Save button (lines view, captain only) */}
            {isTeamCaptain && view === 'lines' && (
              <button
                onClick={handleSave}
                disabled={saving}
                className="ml-auto flex items-center gap-1 px-3 py-1 rounded-full bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/80 transition-colors disabled:opacity-50 shrink-0"
                data-testid="button-save-lines"
              >
                <Save className="w-3 h-3" />
                {saving ? 'Saving…' : 'Save'}
              </button>
            )}
          </CardTitle>
        </CardHeader>

        {/* ── Content ── */}
        <CardContent className="p-6 pl-[12px] pr-[12px] pt-[4px] pb-[12px]">
          {view === 'roster' ? (
            /* ── Roster view ── */
            <>
              {sortedMembers.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground">
                  <Users className="w-10 h-10 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">No players on this roster yet.</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {sortedMembers.map((member: any) => {
                    const memberFirstName  = member.displayFirstName || member.user?.firstName || '';
                    const memberLastName   = member.displayLastName  || member.user?.lastName  || '';
                    const memberJerseyNumber = member.jerseyNumber;
                    const isCaptain        = member.isCaptain;
                    const isPlaceholder    = member.isPlaceholder;
                    const profileImageUrl  = member.user?.profileImageUrl;
                    const playerId         = member.user?.id || member.userId;
                    const streak           = !isPlaceholder && playerId ? streaksData?.streaks?.[playerId] : undefined;

                    const nameContent = (
                      <div className="flex items-center gap-2 min-w-0">
                        {memberJerseyNumber && (
                          <span className="text-xs font-bold text-muted-foreground shrink-0">
                            #{memberJerseyNumber}
                          </span>
                        )}
                        <span className="text-sm font-medium truncate">
                          {memberLastName}{memberFirstName ? `, ${memberFirstName.charAt(0)}.` : ''}
                        </span>
                        {isCaptain && <span className="text-warning font-bold text-xs shrink-0">C</span>}
                        {streak === 'HOT'  && <Flame    className="w-3 h-3 text-orange-500 shrink-0" />}
                        {streak === 'COLD' && <Snowflake className="w-3 h-3 text-blue-400 shrink-0"  />}
                      </div>
                    );

                    return (
                      <div
                        key={member.id || playerId}
                        className={`flex items-center pr-2 rounded-full hover:bg-muted/50 transition-colors bg-card hairline elev-rest overflow-hidden${!isPlaceholder && playerId ? ' cursor-pointer' : ''}`}
                        data-testid={`roster-player-${playerId}`}
                        onClick={!isPlaceholder && playerId ? () => {
                          setActionSheetPlayer({ userId: playerId, firstName: memberFirstName, lastName: memberLastName, profileImageUrl });
                        } : undefined}
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <ClickableAvatar
                            userId={isPlaceholder ? undefined : playerId}
                            profileImageUrl={profileImageUrl}
                            firstName={memberFirstName}
                            lastName={memberLastName}
                            size="xs"
                            className="!h-[45px] !w-[45px] shrink-0"
                          />
                          {isPlaceholder ? (
                            <div className="flex items-center gap-1 min-w-0 flex-1">
                              {nameContent}
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="inline-flex items-center gap-0.5 shrink-0 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-700 px-1.5 py-0.5 text-[10px] font-semibold leading-none cursor-help select-none">
                                      <Clock className="w-2.5 h-2.5" />
                                      Pending
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="max-w-[200px] text-center text-xs">
                                    This spot is reserved but the player hasn't created an account yet.
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 min-w-0 flex-1">{nameContent}</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="mt-3 pt-3 border-t border-border">
                <p className="text-sm text-muted-foreground">
                  {sortedMembers.length} {sortedMembers.length === 1 ? 'player' : 'players'}
                </p>
              </div>
            </>
          ) : (
            /* ── Lines view ── */
            <div className="space-y-4">
              {linesLoading ? (
                <p className="text-sm text-muted-foreground text-center py-4">Loading lines…</p>
              ) : (
                <>
                  {/* Forward Lines */}
                  <div>
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                      Forward Lines
                    </p>
                    <div className="space-y-2">
                      {forwardLines.map((line, idx) => (
                        <div key={idx} className="bg-background rounded-xl border border-border p-2">
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-[11px] font-semibold text-muted-foreground">Line {idx + 1}</span>
                            {isTeamCaptain && forwardLines.length > 1 && (
                              <button
                                onClick={() => removeLine('forward', idx)}
                                className="p-0.5 rounded hover:text-destructive text-muted-foreground transition-colors"
                                data-testid={`remove-forward-line-${idx}`}
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                          <div className="flex gap-1">
                            {FORWARD_POSITIONS.map((pos) => (
                              <SlotButton
                                key={pos}
                                position={pos}
                                slot={line.slots[pos]}
                                canEdit={isTeamCaptain}
                                onClick={() => setPickerTarget({ lineType: 'forward', lineIdx: idx, position: pos })}
                              />
                            ))}
                          </div>
                          <ComboTrend combo={findCombo(line)} members={teamMembers} />
                        </div>
                      ))}
                    </div>
                    {isTeamCaptain && forwardLines.length < 4 && (
                      <button
                        onClick={() => addLine('forward')}
                        className="mt-1.5 w-full flex items-center justify-center gap-1 py-1.5 rounded-lg border border-dashed border-border text-xs text-muted-foreground hover:bg-muted/50 transition-colors"
                        data-testid="button-add-forward-line"
                      >
                        <Plus className="w-3 h-3" /> Add Line
                      </button>
                    )}
                  </div>

                  {/* Defense Pairs */}
                  <div>
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                      Defense Pairs
                    </p>
                    <div className="space-y-2">
                      {defensePairs.map((line, idx) => (
                        <div key={idx} className="bg-background rounded-xl border border-border p-2">
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-[11px] font-semibold text-muted-foreground">Pair {idx + 1}</span>
                            {isTeamCaptain && defensePairs.length > 1 && (
                              <button
                                onClick={() => removeLine('defense', idx)}
                                className="p-0.5 rounded hover:text-destructive text-muted-foreground transition-colors"
                                data-testid={`remove-defense-pair-${idx}`}
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                          <div className="flex gap-2 max-w-[200px]">
                            {DEFENSE_POSITIONS.map((pos) => (
                              <SlotButton
                                key={pos}
                                position={pos}
                                slot={line.slots[pos]}
                                canEdit={isTeamCaptain}
                                onClick={() => setPickerTarget({ lineType: 'defense', lineIdx: idx, position: pos })}
                              />
                            ))}
                          </div>
                          <ComboTrend combo={findCombo(line)} members={teamMembers} />
                        </div>
                      ))}
                    </div>
                    {isTeamCaptain && defensePairs.length < 4 && (
                      <button
                        onClick={() => addLine('defense')}
                        className="mt-1.5 w-full flex items-center justify-center gap-1 py-1.5 rounded-lg border border-dashed border-border text-xs text-muted-foreground hover:bg-muted/50 transition-colors"
                        data-testid="button-add-defense-pair"
                      >
                        <Plus className="w-3 h-3" /> Add Pair
                      </button>
                    )}
                  </div>

                  {/* Bench */}
                  <div>
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                      Bench ({benchPlayers.length})
                    </p>
                    {benchPlayers.length === 0 ? (
                      <p className="text-xs text-muted-foreground">All players assigned!</p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {benchPlayers.map((m: any) => {
                          const memberId = m.user?.id ?? m.userId;
                          const fn = m.user?.firstName ?? m.displayFirstName ?? '';
                          const ln = m.user?.lastName  ?? m.displayLastName  ?? '';
                          return (
                            <div
                              key={memberId}
                              className="flex items-center gap-1 bg-card border border-border rounded-full px-2 py-1 text-xs"
                              data-testid={`bench-player-${memberId}`}
                            >
                              <ClickableAvatar
                                userId={memberId}
                                profileImageUrl={m.user?.profileImageUrl}
                                firstName={fn}
                                lastName={ln}
                                size="xs"
                                className="!h-5 !w-5 pointer-events-none"
                              />
                              <span className="font-medium">{ln || fn}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Add Players Sheet (roster view) ── */}
      <Sheet open={showAddPlayers} onOpenChange={setShowAddPlayers}>
        <SheetContent side="bottom" className="h-[90vh] overflow-y-auto rounded-t-2xl">
          <SheetHeader className="mb-4">
            <SheetTitle className="flex items-center gap-2">
              <UserPlus className="w-5 h-5" /> Add Players
            </SheetTitle>
          </SheetHeader>

          <div className="mb-6">
            <h3 className="font-semibold mb-1">Add Manually</h3>
            <p className="text-sm text-muted-foreground mb-4">Enter a player's details to add them one at a time.</p>
            <form onSubmit={handleAddPlayer} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="add-first-name">First Name *</Label>
                  <Input id="add-first-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="John" disabled={addManualPlayerMutation.isPending} data-testid="input-add-first-name" />
                </div>
                <div>
                  <Label htmlFor="add-last-name">Last Name *</Label>
                  <Input id="add-last-name" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Doe" disabled={addManualPlayerMutation.isPending} data-testid="input-add-last-name" />
                </div>
              </div>
              <div>
                <Label htmlFor="add-email">Email</Label>
                <Input id="add-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="john.doe@example.com" disabled={addManualPlayerMutation.isPending} data-testid="input-add-email" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="add-jersey">Jersey Number</Label>
                  <Input id="add-jersey" value={jerseyNumber} onChange={(e) => setJerseyNumber(e.target.value)} placeholder="23" disabled={addManualPlayerMutation.isPending} data-testid="input-add-jersey" />
                </div>
                <div>
                  <Label htmlFor="add-position">Position</Label>
                  <Input id="add-position" value={position} onChange={(e) => setPosition(e.target.value)} placeholder="Forward" disabled={addManualPlayerMutation.isPending} data-testid="input-add-position" />
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={addManualPlayerMutation.isPending || !firstName.trim() || !lastName.trim()} data-testid="button-submit-add-player">
                <UserPlus className="w-4 h-4 mr-2" />
                {addManualPlayerMutation.isPending ? 'Adding...' : 'Add Player'}
              </Button>
            </form>
          </div>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border" /></div>
            <div className="relative flex justify-center text-xs uppercase"><span className="bg-background px-2 text-muted-foreground">or import</span></div>
          </div>

          <div>
            <h3 className="font-semibold mb-1">Import via CSV</h3>
            <p className="text-sm text-muted-foreground mb-3">Upload a CSV with columns: firstName, lastName, email, jerseyNumber, position</p>
            <a href="/player-import-template.csv" download="player-import-template.csv" className="text-sm text-primary hover:underline block mb-3">Download CSV Template</a>
            <div className="space-y-3">
              <Input ref={fileInputRef} type="file" accept=".csv" onChange={handleFileSelect} disabled={importPlayersMutation.isPending} data-testid="input-csv-file" />
              {csvFile && <p className="text-sm text-muted-foreground">Selected: {csvFile.name}</p>}
              <Button onClick={handleImportPlayers} className="w-full" variant="outline" disabled={!csvFile || importPlayersMutation.isPending} data-testid="button-import-csv">
                <Upload className="w-4 h-4 mr-2" />
                {importPlayersMutation.isPending ? 'Importing...' : 'Import Players'}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* ── Player picker sheet (lines view) ── */}
      <Sheet open={!!pickerTarget} onOpenChange={(open) => { if (!open) setPickerTarget(null); }}>
        <SheetContent side="bottom" className="h-[65vh] rounded-t-2xl overflow-y-auto pb-safe">
          <SheetHeader className="mb-3">
            <SheetTitle>
              Pick player for{' '}
              {pickerTarget && (
                <span className="text-primary">
                  {pickerTarget.lineType === 'forward' ? 'Line' : 'Pair'} {pickerTarget.lineIdx + 1} — {pickerTarget.position}
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
                className="w-full flex items-center gap-3 p-3 rounded-xl border border-dashed border-border mb-2 hover:bg-muted/50 transition-colors"
                onClick={() => handlePickPlayer(null)}
                data-testid="picker-clear-slot"
              >
                <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center">
                  <X className="w-4 h-4 text-muted-foreground" />
                </div>
                <span className="text-sm text-muted-foreground font-medium">Clear slot</span>
              </button>
            ) : null;
          })()}

          <div className="space-y-0.5">
            {teamMembers.map((m: any) => {
              const memberId = m.user?.id ?? m.userId;
              if (!memberId) return null;
              const fn = m.user?.firstName ?? m.displayFirstName ?? '';
              const ln = m.user?.lastName  ?? m.displayLastName  ?? '';

              // Find where this player currently sits
              let assignedAt = '';
              for (const [type, lines] of [['forward', forwardLines], ['defense', defensePairs]] as any) {
                for (let i = 0; i < lines.length; i++) {
                  for (const [p, slot] of Object.entries(lines[i].slots)) {
                    if ((slot as SlotState).playerId === memberId) {
                      assignedAt = `${type === 'forward' ? 'Line' : 'Pair'} ${i + 1} · ${p}`;
                    }
                  }
                }
              }

              return (
                <button
                  key={memberId}
                  className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-muted/50 transition-colors text-left"
                  onClick={() => handlePickPlayer(memberId)}
                  data-testid={`picker-player-${memberId}`}
                >
                  <ClickableAvatar
                    userId={memberId}
                    profileImageUrl={m.user?.profileImageUrl}
                    firstName={fn}
                    lastName={ln}
                    size="sm"
                    className="pointer-events-none shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{fn} {ln}</p>
                    {assignedAt && <p className="text-xs text-muted-foreground">{assignedAt}</p>}
                  </div>
                  {assignedAt && (
                    <Badge variant="outline" className="text-[10px] shrink-0">Move here</Badge>
                  )}
                </button>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>

      {/* ── Player action sheet (roster view) ── */}
      <PlayerActionSheet
        open={!!actionSheetPlayer}
        onClose={() => setActionSheetPlayer(null)}
        userId={actionSheetPlayer?.userId ?? null}
        firstName={actionSheetPlayer?.firstName ?? ''}
        lastName={actionSheetPlayer?.lastName ?? ''}
        profileImageUrl={actionSheetPlayer?.profileImageUrl}
        leagueId={leagueId}
        seasonId={seasonId}
        streakStatus={
          actionSheetPlayer?.userId
            ? (streaksData?.streaks?.[actionSheetPlayer.userId] as any)
            : undefined
        }
      />
    </>
  );
}
