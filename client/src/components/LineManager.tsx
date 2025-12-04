import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Users } from 'lucide-react';
import { Link } from 'wouter';
import { getImageUrl } from '@/lib/queryClient';

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
          <div className="grid grid-cols-2 gap-2">
            {sortedMembers.map((member: any) => {
              const firstName = member.displayFirstName || member.user?.firstName || '';
              const lastName = member.displayLastName || member.user?.lastName || '';
              const jerseyNumber = member.jerseyNumber;
              const isCaptain = member.isCaptain;
              const profileImageUrl = member.user?.profileImageUrl;
              
              const playerId = member.user?.id || member.userId;
              
              return (
                <Link
                  key={member.id || playerId}
                  href={`/user/${playerId}`}
                  className="flex items-center py-1.5 px-2 rounded hover:bg-muted/50 transition-colors cursor-pointer bg-card border border-border"
                  data-testid={`roster-player-${playerId}`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center shrink-0 overflow-hidden">
                      {profileImageUrl ? (
                        <img 
                          src={getImageUrl(profileImageUrl) || ''} 
                          alt={`${firstName} ${lastName}`}
                          className="w-full h-full rounded-full object-cover"
                        />
                      ) : (
                        <span className="text-primary-foreground font-semibold text-xs">
                          {firstName?.[0]}{lastName?.[0]}
                        </span>
                      )}
                    </div>
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
