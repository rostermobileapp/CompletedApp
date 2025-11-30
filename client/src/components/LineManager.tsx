import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Users } from 'lucide-react';
import { Link } from 'wouter';

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
    <Card className="rounded-lg border text-card-foreground shadow-sm bg-[#e2e2e2] dark:bg-[#212121] mt-[4px] mb-[4px]">
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
          <div className="grid grid-cols-3 gap-x-3 gap-y-2">
            {sortedMembers.map((member: any) => {
              const firstName = member.displayFirstName || member.user?.firstName || '';
              const lastName = member.displayLastName || member.user?.lastName || '';
              const jerseyNumber = member.jerseyNumber;
              const isCaptain = member.isCaptain;
              
              const playerId = member.user?.id || member.userId;
              
              return (
                <Link
                  key={member.id || playerId}
                  href={`/user/${playerId}`}
                  className="flex items-center py-1 px-2 rounded hover:bg-muted/50 transition-colors cursor-pointer bg-[#2563eb] text-center"
                  data-testid={`roster-player-${playerId}`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {jerseyNumber && (
                      <span className="text-sm font-bold text-muted-foreground w-5 text-right shrink-0">
                        {jerseyNumber}
                      </span>
                    )}
                    <span className="text-sm font-medium truncate">
                      {lastName}{firstName ? `, ${firstName.charAt(0)}.` : ''}
                    </span>
                    {isCaptain && (
                      <Badge variant="outline" className="text-xs shrink-0">C</Badge>
                    )}
                  </div>
                </Link>
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
