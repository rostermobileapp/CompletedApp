import { useState } from 'react';
import { useParams, useLocation } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Target, Check, Trophy } from 'lucide-react';
import { format } from 'date-fns';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';

export default function ScoreVerification() {
  const { leagueId } = useParams<{ leagueId: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch games that need score verification using correct business logic
  const { data: gamesNeedingVerification = [], isLoading } = useQuery({
    queryKey: ['/api/leagues', leagueId, 'games-needing-verification'],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/leagues/${leagueId}/games`);
      const allGames = await response.json();
      
      if (!Array.isArray(allGames)) return [];
      
      const gamesNeedingVerification = [];
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      for (const game of allGames) {
        const gameDate = new Date(game.scheduledAt);
        gameDate.setHours(0, 0, 0, 0);
        
        if (gameDate >= today) {
          continue;
        }
        
        const hasValidHomeScore = game.homeScore !== null && game.homeScore !== undefined && typeof game.homeScore === 'number';
        const hasValidAwayScore = game.awayScore !== null && game.awayScore !== undefined && typeof game.awayScore === 'number';
        
        if (hasValidHomeScore && hasValidAwayScore) {
          continue;
        }
        
        try {
          const submissionsResponse = await apiRequest('GET', `/api/games/${game.id}/score-submissions`);
          
          if (!submissionsResponse.ok) {
            if (submissionsResponse.status === 403) {
              continue;
            }
            throw new Error(`Failed to fetch submissions: ${submissionsResponse.status}`);
          }
          
          const submissions = await submissionsResponse.json();
          
          if (!Array.isArray(submissions)) continue;
          
          const submissionCount = submissions.length;
          let needsVerification = false;
          let reason = '';
          let submissionDetails = submissions;
          
          const hasCommissionerSubmission = submissions.some(sub => 
            sub.submitterRole === 'commissioner' || sub.isCommissionerOverride === true
          );
          
          if (hasCommissionerSubmission) {
            needsVerification = false;
          } else if (submissionCount === 0) {
            needsVerification = true;
            reason = 'No score submissions';
          } else if (submissionCount === 1) {
            needsVerification = true;
            reason = 'Missing one team submission';
          } else if (submissionCount === 2) {
            const [sub1, sub2] = submissions;
            if (sub1.homeScore !== sub2.homeScore || sub1.awayScore !== sub2.awayScore) {
              needsVerification = true;
              reason = `Mismatched scores`;
            }
          }
          
          if (needsVerification) {
            gamesNeedingVerification.push({
              ...game,
              submissionCount,
              reason,
              submissions: submissionDetails
            });
          }
        } catch (error) {
          continue;
        }
      }
      
      return gamesNeedingVerification;
    },
    enabled: !!leagueId,
  });

  // Fetch tournament matches needing verification
  const { data: tournamentMatchesNeedingVerification = [], isLoading: isLoadingTournaments } = useQuery({
    queryKey: ['/api/leagues', leagueId, 'tournament-matches-needing-verification'],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/leagues/${leagueId}/tournament-matches-needing-verification`);
      if (!response.ok) {
        return [];
      }
      return response.json();
    },
    enabled: !!leagueId,
  });

  // Mutation to submit/update score for a game
  const submitScoreMutation = useMutation({
    mutationFn: async ({ gameId, homeScore, awayScore, resultType }: { gameId: string; homeScore: number; awayScore: number; resultType?: string }) => {
      const response = await apiRequest('POST', `/api/games/${gameId}/submit-score`, {
        homeScore,
        awayScore,
        resultType: resultType || 'regulation',
      });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Score submitted",
        description: "Game score has been updated successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/leagues', leagueId, 'games-needing-verification'] });
      queryClient.invalidateQueries({ queryKey: ['/api/leagues', leagueId, 'games'] });
    },
    onError: (error) => {
      console.error('Error submitting score:', error);
      toast({
        title: "Error",
        description: "Failed to submit score. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Mutation to submit score for a tournament match
  const submitTournamentScoreMutation = useMutation({
    mutationFn: async ({ tournamentId, matchId, team1Score, team2Score }: { tournamentId: string; matchId: string; team1Score: number; team2Score: number }) => {
      const response = await apiRequest('POST', `/api/tournaments/${tournamentId}/matches/${matchId}/score`, {
        team1Score,
        team2Score,
        playerStats: []
      });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Tournament score submitted",
        description: "Match score has been updated and winner will advance automatically.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/leagues', leagueId, 'tournament-matches-needing-verification'] });
      queryClient.invalidateQueries({ queryKey: ['/api/tournaments'] });
    },
    onError: (error) => {
      console.error('Error submitting tournament score:', error);
      toast({
        title: "Error",
        description: "Failed to submit tournament score. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Component to handle individual score submission for regular games
  const ScoreSubmissionCard = ({ game }: { game: any }) => {
    const [homeScore, setHomeScore] = useState('');
    const [awayScore, setAwayScore] = useState('');
    const [isOvertimeShootout, setIsOvertimeShootout] = useState(false);

    const handleSubmitScore = () => {
      const home = parseInt(homeScore);
      const away = parseInt(awayScore);
      
      if (isNaN(home) || isNaN(away) || home < 0 || away < 0) {
        toast({
          title: "Invalid Score",
          description: "Please enter valid scores (numbers only).",
          variant: "destructive",
        });
        return;
      }
      
      const scoreDiff = Math.abs(home - away);
      const canUseOvertimeShootout = scoreDiff <= 1;
      const resultType = (isOvertimeShootout && canUseOvertimeShootout) ? 'overtime' : 'regulation';
      
      submitScoreMutation.mutate({ gameId: game.id, homeScore: home, awayScore: away, resultType });
    };

    return (
      <div className="bg-card border border-border rounded-lg p-4 pt-[4px] pb-[4px]">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-medium">
            {game.homeTeam?.name} vs {game.awayTeam?.name}
          </h3>
          <p className="text-sm text-muted-foreground">
            {format(new Date(game.scheduledAt), 'MMM d, yyyy • h:mm a')}
          </p>
        </div>
        {game.submissions && game.submissions.length > 0 && (
          <div className="mb-3 p-3 bg-muted rounded-lg">
            <h4 className="text-sm font-medium mb-2">Current Submissions:</h4>
            {game.submissions.map((sub: any, index: number) => (
              <div key={index} className="text-sm text-muted-foreground">
                Submission {index + 1}: {game.homeTeam?.name} {sub.homeScore} - {sub.awayScore} {game.awayTeam?.name}
              </div>
            ))}
          </div>
        )}
        <div className="grid grid-cols-3 gap-4 items-center mt-[4px] mb-[4px]">
          <div className="text-center">
            <label className="block text-sm font-medium mb-1">
              {game.homeTeam?.name}
            </label>
            <Input
              type="number"
              min="0"
              value={homeScore}
              onChange={(e) => {
                const newHomeScore = e.target.value;
                setHomeScore(newHomeScore);
                const homeVal = parseInt(newHomeScore);
                const awayVal = parseInt(awayScore);
                if (!isNaN(homeVal) && !isNaN(awayVal) && Math.abs(homeVal - awayVal) > 1) {
                  setIsOvertimeShootout(false);
                }
              }}
              className="text-center"
              placeholder="0"
              data-testid={`input-home-score-${game.id}`}
            />
          </div>
          
          <div className="text-center text-xl font-bold text-muted-foreground">
            -
          </div>
          
          <div className="text-center">
            <label className="block text-sm font-medium mb-1">
              {game.awayTeam?.name}
            </label>
            <Input
              type="number"
              min="0"
              value={awayScore}
              onChange={(e) => {
                const newAwayScore = e.target.value;
                setAwayScore(newAwayScore);
                const homeVal = parseInt(homeScore);
                const awayVal = parseInt(newAwayScore);
                if (!isNaN(homeVal) && !isNaN(awayVal) && Math.abs(homeVal - awayVal) > 1) {
                  setIsOvertimeShootout(false);
                }
              }}
              className="text-center"
              placeholder="0"
              data-testid={`input-away-score-${game.id}`}
            />
          </div>
        </div>
        
        {(() => {
          const homeVal = parseInt(homeScore);
          const awayVal = parseInt(awayScore);
          const hasValidScores = !isNaN(homeVal) && !isNaN(awayVal) && homeVal >= 0 && awayVal >= 0;
          const scoreDiff = hasValidScores ? Math.abs(homeVal - awayVal) : 0;
          const canSelectOvertimeShootout = !hasValidScores || scoreDiff <= 1;
          
          return (
            <div className={`flex items-center gap-2 my-3 p-2 bg-muted/50 rounded-lg ${!canSelectOvertimeShootout ? 'opacity-50' : ''}`}>
              <input
                type="checkbox"
                id={`overtime-${game.id}`}
                checked={isOvertimeShootout && canSelectOvertimeShootout}
                onChange={(e) => {
                  if (canSelectOvertimeShootout) {
                    setIsOvertimeShootout(e.target.checked);
                  }
                }}
                disabled={!canSelectOvertimeShootout}
                className="h-4 w-4 rounded border-border disabled:cursor-not-allowed"
                data-testid={`checkbox-overtime-${game.id}`}
              />
              <label 
                htmlFor={`overtime-${game.id}`} 
                className={`text-sm font-medium ${canSelectOvertimeShootout ? 'cursor-pointer' : 'cursor-not-allowed'}`}
              >
                Game ended in Overtime/Shootout (losing team gets 1 point)
                {!canSelectOvertimeShootout && (
                  <span className="ml-2 text-xs text-muted-foreground">(score difference must be 0 or 1)</span>
                )}
              </label>
            </div>
          );
        })()}
        
        <Button
          onClick={handleSubmitScore}
          disabled={submitScoreMutation.isPending || !homeScore || !awayScore}
          className="w-full"
          data-testid={`button-submit-score-${game.id}`}
        >
          {submitScoreMutation.isPending ? "Submitting..." : "Submit Final Score"}
        </Button>
      </div>
    );
  };

  // Component to handle tournament match score submission
  const TournamentMatchScoreCard = ({ match }: { match: any }) => {
    const [team1Score, setTeam1Score] = useState('');
    const [team2Score, setTeam2Score] = useState('');

    const handleSubmitScore = () => {
      const score1 = parseInt(team1Score);
      const score2 = parseInt(team2Score);
      
      if (isNaN(score1) || isNaN(score2) || score1 < 0 || score2 < 0) {
        toast({
          title: "Invalid Score",
          description: "Please enter valid scores (numbers only).",
          variant: "destructive",
        });
        return;
      }

      if (score1 === score2) {
        toast({
          title: "Invalid Score",
          description: "Tournament matches cannot end in a tie. Please enter different scores.",
          variant: "destructive",
        });
        return;
      }
      
      submitTournamentScoreMutation.mutate({ 
        tournamentId: match.tournamentId, 
        matchId: match.id, 
        team1Score: score1, 
        team2Score: score2 
      });
    };

    return (
      <div className="bg-card border border-border rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Trophy className="w-4 h-4 text-amber-500" />
            <Badge variant="outline" className="text-xs">{match.tournamentName}</Badge>
          </div>
          <Badge variant="secondary" className="text-xs">{match.round}</Badge>
        </div>
        
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-medium">
            {match.team1Name} vs {match.team2Name}
          </h3>
          {match.scheduledTime && (
            <p className="text-sm text-muted-foreground">
              {format(new Date(match.scheduledTime), 'MMM d, yyyy • h:mm a')}
            </p>
          )}
        </div>

        <div className="mb-3 p-2 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg">
          <p className="text-xs text-amber-700 dark:text-amber-300">
            Winner will automatically advance to the next round in the bracket.
          </p>
        </div>
        
        <div className="grid grid-cols-3 gap-4 items-center mt-2 mb-2">
          <div className="text-center">
            <label className="block text-sm font-medium mb-1">
              {match.team1Name}
            </label>
            <Input
              type="number"
              min="0"
              value={team1Score}
              onChange={(e) => setTeam1Score(e.target.value)}
              className="text-center"
              placeholder="0"
              data-testid={`input-team1-score-${match.id}`}
            />
          </div>
          
          <div className="text-center text-xl font-bold text-muted-foreground">
            -
          </div>
          
          <div className="text-center">
            <label className="block text-sm font-medium mb-1">
              {match.team2Name}
            </label>
            <Input
              type="number"
              min="0"
              value={team2Score}
              onChange={(e) => setTeam2Score(e.target.value)}
              className="text-center"
              placeholder="0"
              data-testid={`input-team2-score-${match.id}`}
            />
          </div>
        </div>
        
        <Button
          onClick={handleSubmitScore}
          disabled={submitTournamentScoreMutation.isPending || !team1Score || !team2Score}
          className="w-full mt-3"
          data-testid={`button-submit-tournament-score-${match.id}`}
        >
          {submitTournamentScoreMutation.isPending ? "Submitting..." : "Submit Final Score & Advance Winner"}
        </Button>
      </div>
    );
  };

  const totalNeedingVerification = (gamesNeedingVerification?.length || 0) + (tournamentMatchesNeedingVerification?.length || 0);
  const isAllLoading = isLoading || isLoadingTournaments;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-card border-b border-border px-6 py-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Target className="w-6 h-6 text-primary" />
            Score Verification
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Review and verify game scores that need attention
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        <div className="max-w-4xl mx-auto">
          {isAllLoading ? (
            <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-6">
              <div className="flex items-center gap-3">
                <Target className="w-6 h-6 text-blue-600 dark:text-blue-400 animate-pulse" />
                <span className="text-blue-600 dark:text-blue-300">Checking for games needing verification...</span>
              </div>
            </div>
          ) : totalNeedingVerification === 0 ? (
            <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-6">
              <div className="flex items-center gap-3 mb-2">
                <Check className="w-6 h-6 text-green-600 dark:text-green-400" />
                <span className="text-lg font-medium text-green-600 dark:text-green-300">All caught up!</span>
              </div>
              <p className="text-sm text-green-600 dark:text-green-400 ml-9">
                All game scores are up to date - no verification needed.
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-8 h-8 bg-red-500 rounded-full flex items-center justify-center">
                  <span className="text-white text-sm font-bold">{totalNeedingVerification}</span>
                </div>
                <h2 className="text-xl font-bold text-red-600">
                  {totalNeedingVerification === 1 ? '1 Game' : `${totalNeedingVerification} Games`} Needing Verification
                </h2>
              </div>
              
              <Tabs defaultValue={tournamentMatchesNeedingVerification.length > 0 ? "tournaments" : "regular"} className="w-full">
                <TabsList className="grid w-full grid-cols-2 mb-6">
                  <TabsTrigger value="regular" className="flex items-center gap-2">
                    <Target className="w-4 h-4" />
                    Regular Games
                    {gamesNeedingVerification.length > 0 && (
                      <Badge variant="destructive" className="ml-1">{gamesNeedingVerification.length}</Badge>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="tournaments" className="flex items-center gap-2">
                    <Trophy className="w-4 h-4" />
                    Tournament Matches
                    {tournamentMatchesNeedingVerification.length > 0 && (
                      <Badge variant="destructive" className="ml-1">{tournamentMatchesNeedingVerification.length}</Badge>
                    )}
                  </TabsTrigger>
                </TabsList>
                
                <TabsContent value="regular">
                  {gamesNeedingVerification.length === 0 ? (
                    <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-6">
                      <div className="flex items-center gap-3">
                        <Check className="w-5 h-5 text-green-600 dark:text-green-400" />
                        <span className="text-green-600 dark:text-green-300">All regular game scores are up to date.</span>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {gamesNeedingVerification.map((game: any) => (
                        <ScoreSubmissionCard key={game.id} game={game} />
                      ))}
                    </div>
                  )}
                </TabsContent>
                
                <TabsContent value="tournaments">
                  {tournamentMatchesNeedingVerification.length === 0 ? (
                    <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-6">
                      <div className="flex items-center gap-3">
                        <Check className="w-5 h-5 text-green-600 dark:text-green-400" />
                        <span className="text-green-600 dark:text-green-300">All tournament match scores are up to date.</span>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {tournamentMatchesNeedingVerification.map((match: any) => (
                        <TournamentMatchScoreCard key={match.id} match={match} />
                      ))}
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
