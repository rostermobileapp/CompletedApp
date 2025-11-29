import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Users } from 'lucide-react';

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
            <p>No players on this roster yet.</p>
          </div>
        ) : (
          <div className="space-y-1">
            {sortedMembers.map((member: any) => {
              const firstName = member.displayFirstName || member.user?.firstName || '';
              const lastName = member.displayLastName || member.user?.lastName || '';
              const jerseyNumber = member.jerseyNumber;
              const isCaptain = member.isCaptain;
              
              return (
                <div
                  key={member.id || member.user?.id || member.userId}
                  className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-muted/50 transition-colors"
                  data-testid={`roster-player-${member.user?.id || member.userId}`}
                >
                  <div className="flex items-center gap-3">
                    {jerseyNumber && (
                      <span className="text-sm font-bold text-muted-foreground w-6 text-right">
                        #{jerseyNumber}
                      </span>
                    )}
                    <span className="font-medium">
                      {lastName}{firstName ? `, ${firstName}` : ''}
                    </span>
                    {isCaptain && (
                      <Badge variant="outline" className="text-xs">C</Badge>
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
      </CardContent>
    </Card>
  );
}
