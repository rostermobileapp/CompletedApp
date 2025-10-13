import { useState } from 'react';
import { useParams, useLocation } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Target, Check } from 'lucide-react';
import { format } from 'date-fns';

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
      
      // Find games that need commissioner verification based on the correct business logic:
      // 1. Today's date is AFTER the game's date (past games)
      // 2. Game has problematic score submissions (0, 1, or 2 mismatched)
      const gamesNeedingVerification = [];
      const today = new Date();
      today.setHours(0, 0, 0, 0); // Start of today
      
      for (const game of allGames) {
        const gameDate = new Date(game.scheduledAt);
        gameDate.setHours(0, 0, 0, 0); // Start of game date
        
        // Only check games from past dates
        if (gameDate >= today) {
          continue; // Skip future games
        }
        
        try {
          const submissionsResponse = await apiRequest('GET', `/api/games/${game.id}/score-submissions`);
          
          // If we get a 403, it means user doesn't have access to this game's submissions
          // This likely means they're not a captain of this game, so skip it (don't mark as needing verification)
          if (!submissionsResponse.ok) {
            if (submissionsResponse.status === 403) {
              continue; // Skip games user doesn't have access to
            }
            throw new Error(`Failed to fetch submissions: ${submissionsResponse.status}`);
          }
          
          const submissions = await submissionsResponse.json();
          
          if (!Array.isArray(submissions)) continue;
          
          const submissionCount = submissions.length;
          let needsVerification = false;
          let reason = '';
          let submissionDetails = submissions;
          
          // Check if there's a commissioner submission - if so, no verification needed
          const hasCommissionerSubmission = submissions.some(sub => 
            sub.submitterRole === 'commissioner' || sub.isCommissionerOverride === true
          );
          
          if (hasCommissionerSubmission) {
            // Commissioner has already submitted final score - no verification needed
            needsVerification = false;
          } else if (submissionCount === 0) {
            // No score submissions - needs verification
            needsVerification = true;
            reason = 'No score submissions';
          } else if (submissionCount === 1) {
            // Only one team submitted - needs verification
            needsVerification = true;
            reason = 'Missing one team submission';
          } else if (submissionCount === 2) {
            // Two submissions - check if they match
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
          // Skip on error
          continue;
        }
      }
      
      return gamesNeedingVerification;
    },
    enabled: !!leagueId,
  });

  // Mutation to submit/update score for a game
  const submitScoreMutation = useMutation({
    mutationFn: async ({ gameId, homeScore, awayScore }: { gameId: string; homeScore: number; awayScore: number }) => {
      const response = await apiRequest('POST', `/api/games/${gameId}/submit-score`, {
        homeScore,
        awayScore,
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

  // Component to handle individual score submission
  const ScoreSubmissionCard = ({ game }: { game: any }) => {
    const [homeScore, setHomeScore] = useState('');
    const [awayScore, setAwayScore] = useState('');

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
      
      submitScoreMutation.mutate({ gameId: game.id, homeScore: home, awayScore: away });
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
        {/* Show existing submissions if any */}
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
        {/* Score submission form */}
        <div className="grid grid-cols-3 gap-4 items-center mb-3">
          <div className="text-center">
            <label className="block text-sm font-medium mb-1">
              {game.homeTeam?.name}
            </label>
            <Input
              type="number"
              min="0"
              value={homeScore}
              onChange={(e) => setHomeScore(e.target.value)}
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
              onChange={(e) => setAwayScore(e.target.value)}
              className="text-center"
              placeholder="0"
              data-testid={`input-away-score-${game.id}`}
            />
          </div>
        </div>
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

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-card border-b border-border px-6 py-4">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(`/league/${leagueId}`)}
            className="flex items-center gap-2"
            data-testid="button-back-to-league"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to League
          </Button>
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
      </div>

      {/* Content */}
      <div className="p-6">
        <div className="max-w-4xl mx-auto">
          {isLoading ? (
            <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-6">
              <div className="flex items-center gap-3">
                <Target className="w-6 h-6 text-blue-600 dark:text-blue-400 animate-pulse" />
                <span className="text-blue-600 dark:text-blue-300">Checking for games needing verification...</span>
              </div>
            </div>
          ) : !Array.isArray(gamesNeedingVerification) || gamesNeedingVerification.length === 0 ? (
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
                  <span className="text-white text-sm font-bold">{gamesNeedingVerification.length}</span>
                </div>
                <h2 className="text-xl font-bold text-red-600">
                  {gamesNeedingVerification.length === 1 ? '1 Game' : `${gamesNeedingVerification.length} Games`} Needing Verification
                </h2>
              </div>
              
              <div className="space-y-4">
                {gamesNeedingVerification.map((game: any) => (
                  <ScoreSubmissionCard key={game.id} game={game} />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
