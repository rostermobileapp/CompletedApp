/**
 * PlayerActionSheet
 *
 * A bottom-sheet that appears when a player row is tapped on a roster.
 * Shows the player's avatar, name, streak status (if available), and two actions:
 *   1. View Profile  → /user/:userId
 *   2. Player Stats & Trends → /player-stats/:userId?leagueId=&seasonId=
 *
 * Placeholders (no userId) show only the name (no actions).
 */
import { Flame, Snowflake, User, BarChart2 } from 'lucide-react';
import { useLocation } from 'wouter';
import { setPageTransitionDirection } from '@/components/PageTransition';
import { getImageUrl } from '@/lib/queryClient';
import {
  Sheet,
  SheetContent,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';

export type StreakStatus = 'HOT' | 'COLD' | 'NEUTRAL' | undefined;

interface PlayerActionSheetProps {
  open: boolean;
  onClose: () => void;
  userId: string | null | undefined;
  firstName: string;
  lastName: string;
  profileImageUrl?: string | null;
  /** Optional: leagueId to pass to the Stats & Trends screen */
  leagueId?: string | null;
  /** Optional: seasonId to pass to the Stats & Trends screen */
  seasonId?: string | null;
  /** Streak status to display next to the name */
  streakStatus?: StreakStatus;
}

function StreakIcon({ status }: { status: StreakStatus }) {
  if (status === 'HOT') return <Flame className="w-5 h-5 text-orange-500" />;
  if (status === 'COLD') return <Snowflake className="w-5 h-5 text-blue-400" />;
  return null;
}

export function PlayerActionSheet({
  open,
  onClose,
  userId,
  firstName,
  lastName,
  profileImageUrl,
  leagueId,
  seasonId,
  streakStatus,
}: PlayerActionSheetProps) {
  const [, navigate] = useLocation();
  const fullName = `${firstName} ${lastName}`.trim() || 'Player';
  const initials = (firstName.charAt(0) + lastName.charAt(0)).toUpperCase() || '?';

  const goToProfile = () => {
    onClose();
    setPageTransitionDirection('up');
    navigate(`/user/${userId}`);
  };

  const goToStatsTrends = () => {
    onClose();
    setPageTransitionDirection('up');
    const params = new URLSearchParams({ name: fullName });
    if (leagueId) params.set('leagueId', leagueId);
    if (seasonId) params.set('seasonId', seasonId);
    navigate(`/player-stats/${userId}?${params}`);
  };

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent side="bottom" className="rounded-t-2xl px-6 pb-20 pt-6">
        {/* Avatar + name */}
        <div className="flex flex-col items-center gap-3 mb-6">
          {profileImageUrl ? (
            <img
              src={getImageUrl(profileImageUrl) || ''}
              alt={fullName}
              className="w-20 h-20 rounded-full object-cover"
            />
          ) : (
            <div className="w-20 h-20 rounded-full bg-primary flex items-center justify-center">
              <span className="text-primary-foreground text-2xl font-bold">{initials}</span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <span className="text-xl font-semibold">{fullName}</span>
            <StreakIcon status={streakStatus} />
          </div>
          {streakStatus === 'HOT' && (
            <span className="text-xs text-orange-500 font-medium -mt-2">Hot Streak 🔥</span>
          )}
          {streakStatus === 'COLD' && (
            <span className="text-xs text-blue-400 font-medium -mt-2">Cold Streak ❄️</span>
          )}
        </div>

        {/* Actions */}
        {userId ? (
          <div className="space-y-3">
            <Button
              variant="outline"
              className="w-full h-12 text-base justify-start gap-3"
              onClick={goToProfile}
              data-testid="action-view-profile"
            >
              <User className="w-5 h-5 text-muted-foreground" />
              View Profile
            </Button>
            <Button
              variant="outline"
              className="w-full h-12 text-base justify-start gap-3"
              onClick={goToStatsTrends}
              data-testid="action-stats-trends"
            >
              <BarChart2 className="w-5 h-5 text-muted-foreground" />
              Player Stats &amp; Trends
            </Button>
          </div>
        ) : (
          <p className="text-center text-sm text-muted-foreground">
            This player hasn't joined the app yet.
          </p>
        )}
      </SheetContent>
    </Sheet>
  );
}
