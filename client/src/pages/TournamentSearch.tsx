import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Search, Trophy, Calendar, Users, MapPin, CheckCircle, Clock, XCircle } from "lucide-react";
import { getImageUrl } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { format } from "date-fns";

type Tournament = {
  id: string;
  name: string;
  type: 'season_playoff' | 'standalone';
  format: string;
  numTeams: number;
  startDate: string | null;
  description: string | null;
  accessStartDate: string | null;
  accessEndDate: string | null;
  paymentStatus: 'unpaid' | 'paid' | 'refunded';
  leagueId: string;
  leagueName?: string;
  sport?: string;
  logoUrl?: string | null;
};

type TournamentParticipant = {
  id: string;
  tournamentId: string;
  userId: string;
  status: 'pending' | 'approved' | 'rejected';
  requestedAt: string;
  respondedAt: string | null;
};

export default function TournamentSearch() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [searchId, setSearchId] = useState("");
  const [searchedId, setSearchedId] = useState<string | null>(null);

  const { data: tournament, isLoading: tournamentLoading, error } = useQuery<Tournament>({
    queryKey: ['/api/tournaments/search', searchedId],
    enabled: !!searchedId,
  });

  const { data: participant } = useQuery<TournamentParticipant>({
    queryKey: ['/api/tournaments', tournament?.id, 'my-participation'],
    enabled: !!tournament?.id,
  });

  const joinMutation = useMutation({
    mutationFn: async (tournamentId: string) => {
      return await apiRequest('POST', `/api/tournaments/${tournamentId}/join`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tournaments', tournament?.id, 'my-participation'] });
      toast({
        title: "Request sent!",
        description: "Your join request has been submitted. You'll be notified when it's approved."
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error?.message || "Failed to send join request",
        variant: "destructive"
      });
    }
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchId.trim()) {
      setSearchedId(searchId.trim().toUpperCase());
    }
  };

  const getFormatLabel = (format: string) => {
    const formats: Record<string, string> = {
      'single_elimination': 'Single Elimination',
      'double_elimination': 'Double Elimination',
      'round_robin': 'Round Robin',
      'round_robin_split': 'Round Robin + Playoffs',
      'triple_elimination': 'Triple Elimination',
      'three_game_guarantee': '3-Game Guarantee',
      'consolation': 'Consolation',
      'compass_draw': 'Compass Draw',
      'custom_bracket': 'Custom Bracket'
    };
    return formats[format] || format;
  };

  const getStatusBadge = () => {
    if (!participant) return null;

    switch (participant.status) {
      case 'approved':
        return (
          <Badge variant="default" className="bg-green-600" data-testid="badge-status-approved">
            <CheckCircle className="h-3 w-3 mr-1" />
            Approved
          </Badge>
        );
      case 'pending':
        return (
          <Badge variant="outline" className="border-amber-500 text-amber-600" data-testid="badge-status-pending">
            <Clock className="h-3 w-3 mr-1" />
            Pending Approval
          </Badge>
        );
      case 'rejected':
        return (
          <Badge variant="destructive" data-testid="badge-status-rejected">
            <XCircle className="h-3 w-3 mr-1" />
            Request Rejected
          </Badge>
        );
    }
  };

  const now = new Date();
  const windowOpen = !tournament?.accessStartDate || new Date(tournament.accessStartDate) <= now;
  const windowNotClosed = !tournament?.accessEndDate || new Date(tournament.accessEndDate) >= now;
  const windowActive = windowOpen && windowNotClosed;
  // Allow players to send a join request as soon as a tournament is paid for and
  // its access window has not yet closed/expired. Pre-window joins are allowed
  // (and queued for commissioner approval) so players don't have to wait until
  // the window flips open. Closed/expired windows are still blocked.
  const canJoin = tournament && !participant && tournament.paymentStatus === 'paid' && windowNotClosed;
  const canView = participant?.status === 'approved';

  return (
    <div className="min-h-screen bg-background p-4 md:p-8 pb-24">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2" data-testid="text-page-title">
            Find a Tournament
          </h1>
          <p className="text-muted-foreground">
            Enter a tournament ID to search and request access
          </p>
        </div>

        {/* Search Form */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              Search by Tournament ID
            </CardTitle>
            <CardDescription>
              Enter the 8-character tournament ID provided by your commissioner
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSearch} className="flex gap-2">
              <Input
                placeholder="e.g., ABC12DEF"
                value={searchId}
                onChange={(e) => setSearchId(e.target.value.toUpperCase())}
                maxLength={8}
                className="font-mono uppercase"
                data-testid="input-tournament-id"
              />
              <Button
                type="submit"
                disabled={searchId.trim().length !== 8 || tournamentLoading}
                data-testid="button-search"
              >
                {tournamentLoading ? 'Searching...' : 'Search'}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Error State */}
        {error && searchedId && (
          <Card className="border-destructive">
            <CardHeader>
              <CardTitle className="text-destructive flex items-center gap-2">
                <XCircle className="h-5 w-5" />
                Tournament Not Found
              </CardTitle>
              <CardDescription>
                No tournament found with ID "{searchedId}". Please check the ID and try again.
              </CardDescription>
            </CardHeader>
          </Card>
        )}

        {/* Tournament Result */}
        {tournament && (
          <Card data-testid="card-tournament-result">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 overflow-hidden">
                    {tournament.logoUrl ? (
                      <img
                        src={getImageUrl(tournament.logoUrl) || undefined}
                        alt={`${tournament.name} logo`}
                        className="w-full h-full object-cover"
                        data-testid="img-tournament-logo"
                      />
                    ) : (
                      <Trophy className="h-6 w-6 text-primary" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-2xl mb-1" data-testid="text-tournament-name">
                      {tournament.name}
                    </CardTitle>
                    <div className="flex flex-wrap gap-2 mb-2">
                      <Badge variant="secondary" data-testid="badge-format">
                        {getFormatLabel(tournament.format)}
                      </Badge>
                      {tournament.type === 'standalone' && (
                        <Badge variant="outline" data-testid="badge-type">
                          Standalone
                        </Badge>
                      )}
                      {getStatusBadge()}
                    </div>
                    {tournament.leagueName && (
                      <CardDescription className="capitalize" data-testid="text-league-name">
                        {tournament.leagueName} {tournament.sport && `• ${tournament.sport}`}
                      </CardDescription>
                    )}
                  </div>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-6">
              {/* Tournament Details */}
              <div className="grid gap-4 md:grid-cols-2">
                {tournament.startDate && (
                  <div className="flex items-center gap-3">
                    <Calendar className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="text-sm text-muted-foreground">Start Date</p>
                      <p className="font-medium" data-testid="text-start-date">
                        {format(new Date(tournament.startDate), 'MMM d, yyyy')}
                      </p>
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <Users className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Teams</p>
                    <p className="font-medium" data-testid="text-num-teams">
                      {tournament.numTeams} teams
                    </p>
                  </div>
                </div>
              </div>

              {/* Access Window */}
              {tournament.accessStartDate && (
                <div className="p-4 rounded-lg border bg-muted/50">
                  <div className="flex items-start gap-3">
                    <Clock className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div className="flex-1">
                      <p className="font-medium mb-1">Access Window</p>
                      <p className="text-sm text-muted-foreground" data-testid="text-access-window">
                        {format(new Date(tournament.accessStartDate), 'MMM d, yyyy')} -{' '}
                        {tournament.accessEndDate
                          ? format(new Date(tournament.accessEndDate), 'MMM d, yyyy')
                          : 'TBD (1 week after final game)'}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        You'll have access to this tournament during this time period
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Description */}
              {tournament.description && (
                <div>
                  <p className="text-sm text-muted-foreground mb-2">About this tournament</p>
                  <p className="text-sm" data-testid="text-description">{tournament.description}</p>
                </div>
              )}

              {/* Payment Status Warning */}
              {tournament.paymentStatus !== 'paid' && !participant && (
                <div className="p-4 rounded-lg border border-amber-500/50 bg-amber-500/10">
                  <p className="text-sm text-amber-600 dark:text-amber-400">
                    This tournament is not yet open for registration.
                  </p>
                </div>
              )}

              {/* Pre-window note (informational — joining is still allowed) */}
              {tournament.paymentStatus === 'paid' && !participant && !windowOpen && windowNotClosed && (
                <div className="p-4 rounded-lg border border-blue-500/50 bg-blue-500/10">
                  <p className="text-sm text-blue-700 dark:text-blue-300" data-testid="text-prewindow-note">
                    Tournament access opens on {format(new Date(tournament.accessStartDate!), 'MMM d, yyyy h:mm a')}.
                    You can still request to join now — your request will be queued for the commissioner.
                  </p>
                </div>
              )}

              {/* Access Window Closed Warning (blocks joining) */}
              {tournament.paymentStatus === 'paid' && !participant && !windowNotClosed && (
                <div className="p-4 rounded-lg border border-amber-500/50 bg-amber-500/10">
                  <p className="text-sm text-amber-600 dark:text-amber-400" data-testid="text-window-closed">
                    Registration for this tournament has closed.
                  </p>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2">
                {canJoin && (
                  <Button
                    onClick={() => joinMutation.mutate(tournament.id)}
                    disabled={joinMutation.isPending}
                    className="flex-1"
                    data-testid="button-request-join"
                  >
                    {joinMutation.isPending ? 'Sending...' : 'Request to Join'}
                  </Button>
                )}
                {canView && (
                  <Button
                    onClick={() => navigate(`/tournaments/${tournament.id}`)}
                    className="flex-1"
                    data-testid="button-view-tournament"
                  >
                    View Tournament
                  </Button>
                )}
                {participant?.status === 'pending' && (
                  <Button
                    variant="secondary"
                    disabled
                    className="flex-1"
                    data-testid="button-pending"
                  >
                    <Clock className="h-4 w-4 mr-2" />
                    Awaiting Approval
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
