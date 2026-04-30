import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Users } from 'lucide-react';
import { Link } from 'wouter';
import { ClickableAvatar } from '@/components/ClickableAvatar';

interface LineManagerProps {
  teamId: string;
  isTeamCaptain: boolean;
  teamMembers: any[];
}

export function LineManager({ teamId, isTeamCaptain, teamMembers }: LineManagerProps) {
  const sortedMembers = [...teamMembers].sort((a, b) => {
    const lastNameA = (a.displayLastName || a.user?.lastName || '').toLowerCase();
    const lastNameB = (b.displayLastName || b.user?.lastName || '').toLowerCase();
    return lastNameA.localeCompare(lastNameB);
  });

  return (
    <Card className="rounded-lg hairline elev-rest text-card-foreground bg-[#e2e2e2] dark:bg-[#212121] mt-[4px] mb-[4px]">
      <CardHeader className="flex flex-col space-y-1.5 p-6 pl-[12px] pr-[12px] pt-[8px] pb-[4px]">
        <CardTitle className="flex items-center gap-2">
          <Users className="w-5 h-5" />
          Roster
          {isTeamCaptain && (
            <Badge variant="secondary" className="ml-2">Captain</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6 pl-[12px] pr-[12px] pt-[4px] pb-[12px]">
        {sortedMembers.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <Users className="w-10 h-10 mx-auto mb-3 opacity-50" />
            <p className="text-sm">No players on this roster yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {sortedMembers.map((member: any) => {
              const firstName = member.displayFirstName || member.user?.firstName || '';
              const lastName = member.displayLastName || member.user?.lastName || '';
              const jerseyNumber = member.jerseyNumber;
              const isCaptain = member.isCaptain;
              const profileImageUrl = member.user?.profileImageUrl;
              
              const playerId = member.user?.id || member.userId;
              
              return (
                <div
                  key={member.id || playerId}
                  className="flex items-center pr-4 rounded-full hover:bg-muted/50 transition-colors bg-card hairline elev-rest overflow-hidden"
                  data-testid={`roster-player-${playerId}`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <ClickableAvatar
                      userId={playerId}
                      profileImageUrl={profileImageUrl}
                      firstName={firstName}
                      lastName={lastName}
                      size="xs"
                      className="!h-[45px] !w-[45px]"
                    />
                    <Link
                      href={`/user/${playerId}`}
                      className="flex items-center gap-2 min-w-0 cursor-pointer"
                    >
                      {jerseyNumber && (
                        <span className="text-xs font-bold text-muted-foreground shrink-0">
                          #{jerseyNumber}
                        </span>
                      )}
                      <span className="text-sm font-medium truncate">
                        {lastName}{firstName ? `, ${firstName.charAt(0)}.` : ''}
                      </span>
                      {isCaptain && (
                        <span className="text-warning font-bold text-xs shrink-0">C</span>
                      )}
                    </Link>
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
      </CardContent>
    </Card>
  );
}
