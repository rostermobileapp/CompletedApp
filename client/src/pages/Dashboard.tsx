import { useQuery } from '@tanstack/react-query';
import React, { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
// 🚨 SUBSCRIPTION SYSTEM REMOVED - ALL FEATURES FREE! 🚨
// import { SubscriptionGate } from '@/components/SubscriptionGate'; // DELETED
// import { useSubscription } from '@/context/SubscriptionContext'; // REMOVED
import { usePermissions } from '@/context/SubscriptionContext';
import { useLocation, Link } from 'wouter';
import { Trophy, Users, TrendingUp, Clock, Search, Coffee, Check, X, Beer, Megaphone, BarChart3, Award, ChevronDown, AlertCircle, Settings, UserCheck, Shield, DollarSign, Crown, Star } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { format } from 'date-fns';
import logoUrl from '@assets/Roster Logo White_1757083079896.png';
import beverageJarUrl from '@assets/Luminari Report (1)_1757085824172.png';
import rostersLogoUrl from '@assets/Roster R White_1757096715093.png';
import FeedbackModal from '@/components/FeedbackModal';
import { FeatureLockOverlay } from '@/components/FeatureLockOverlay';

// Notification Badge Component
function AnnouncementBadge({ leagueId }: { leagueId: string | null }) {
  const { data: unreadCount } = useQuery({
    queryKey: ['/api/leagues', leagueId, 'announcements', 'unread-count'],
    queryFn: async () => {
      if (!leagueId) return 0;
      const response = await apiRequest('GET', `/api/leagues/${leagueId}/announcements/unread-count`);
      return response.json();
    },
    enabled: !!leagueId,
    refetchInterval: 30000, // Check every 30 seconds
  });

  if (!unreadCount || unreadCount.count === 0) {
    return null;
  }

  return (
    <div className="absolute top-2 right-2 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center">
      <span className="text-white text-xs font-bold">{unreadCount.count}</span>
    </div>
  );
}

// Payment Request Badge Component
function PaymentRequestBadge() {
  const { data: unpaidCount } = useQuery({
    queryKey: ['/api/payment-requests/unpaid-count'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/payment-requests/unpaid-count');
      return response.json();
    },
    refetchInterval: 30000, // Check every 30 seconds
  });

  if (!unpaidCount || unpaidCount.count === 0) {
    return null;
  }

  return (
    <div className="absolute top-2 right-2 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center">
      <span className="text-white text-xs font-bold">{unpaidCount.count}</span>
    </div>
  );
}

// Needs Attention Modal Component
function NeedsAttentionModal({ isOpen, onClose, leagueId, onNavigate }: { 
  isOpen: boolean; 
  onClose: () => void; 
  leagueId: string | null;
  onNavigate: (path: string) => void;
}) {
  const [selectedRequest, setSelectedRequest] = useState<string | null>(null);
  const [comments, setComments] = useState("");
  const { toast } = useToast();
  // Fetch pending league member approvals
  const { data: pendingMembers = [], isLoading: pendingMembersLoading } = useQuery({
    queryKey: ['/api/leagues', leagueId, 'pending-members'],
    queryFn: async () => {
      if (!leagueId) return [];
      const response = await apiRequest('GET', `/api/leagues/${leagueId}/pending-members`);
      return response.json();
    },
    enabled: !!leagueId && isOpen,
  });

  // Fetch pending substitute approvals
  const { data: pendingSubstituteApprovals, isLoading: substituteApprovalsLoading } = useQuery({
    queryKey: ['/api/substitute-requests/pending-approvals', leagueId],
    queryFn: async () => {
      if (!leagueId) return { captain: [], commissioner: [], total: 0 };
      const response = await apiRequest('GET', `/api/substitute-requests/pending-approvals?leagueId=${leagueId}`);
      return response.json();
    },
    enabled: !!leagueId && isOpen,
  });

  // Fetch games that need score verification
  const { data: gamesNeedingVerification = [], isLoading: gamesLoading } = useQuery({
    queryKey: ['/api/leagues', leagueId, 'games-needing-verification-modal'],
    queryFn: async () => {
      if (!leagueId) return [];
      const response = await apiRequest('GET', `/api/leagues/${leagueId}/games`);
      const allGames = await response.json();
      
      if (!Array.isArray(allGames)) return [];
      
      const gamesNeedingVerification = [];
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      for (const game of allGames) {
        const gameDate = new Date(game.scheduledAt);
        gameDate.setHours(0, 0, 0, 0);
        
        if (gameDate >= today) continue;
        
        try {
          const submissionsResponse = await apiRequest('GET', `/api/games/${game.id}/score-submissions`);
          
          // If we get a 403, skip this game (user doesn't have access)
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
          
          // Check if there's a commissioner submission - if so, no verification needed
          const hasCommissionerSubmission = submissions.some((sub: any) => 
            sub.submitterRole === 'commissioner' || sub.isCommissionerOverride === true
          );
          
          if (hasCommissionerSubmission) {
            // Commissioner has already submitted final score - no verification needed
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
              reason = `Mismatched scores: ${sub1.homeScore}-${sub1.awayScore} vs ${sub2.homeScore}-${sub2.awayScore}`;
            }
          }
          
          if (needsVerification) {
            gamesNeedingVerification.push({ ...game, reason });
          }
        } catch (error) {
          continue;
        }
      }
      
      return gamesNeedingVerification;
    },
    enabled: !!leagueId && isOpen,
  });

  const totalTasks = (Array.isArray(pendingMembers) ? pendingMembers.length : 0) + 
                     (Array.isArray(gamesNeedingVerification) ? gamesNeedingVerification.length : 0) +
                     (pendingSubstituteApprovals?.total || 0);

  // Process substitute approval mutation
  const processApprovalMutation = useMutation({
    mutationFn: async ({ requestId, approverType, status, comments }: { 
      requestId: string; 
      approverType: string; 
      status: string; 
      comments?: string;
    }) => {
      await apiRequest("POST", `/api/substitute-requests/${requestId}/approve`, {
        approverType,
        status,
        comments
      });
    },
    onSuccess: (_, { status }) => {
      toast({
        title: "Request Processed",
        description: `Request ${status} successfully.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/substitute-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/substitute-requests/pending-approvals"] });
      setSelectedRequest(null);
      setComments("");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to process request. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleApprove = (request: any, approverType: string) => {
    processApprovalMutation.mutate({ 
      requestId: request.id, 
      approverType, 
      status: "approved", 
      comments 
    });
  };

  const handleDeny = (request: any, approverType: string) => {
    if (!comments.trim()) {
      toast({
        title: "Comments Required",
        description: "Please provide comments when denying a request.",
        variant: "destructive",
      });
      return;
    }
    processApprovalMutation.mutate({ 
      requestId: request.id, 
      approverType, 
      status: "denied", 
      comments 
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-card rounded-lg border border-border w-full max-w-6xl h-[67.5vh] flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-border">
          <h2 className="text-2xl font-semibold text-center">Needs Attention</h2>
          <p className="text-center text-muted-foreground mt-1">
            {totalTasks} task{totalTasks === 1 ? '' : 's'} requiring your attention
          </p>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {(pendingMembersLoading || gamesLoading || substituteApprovalsLoading) ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-center">
                <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-2"></div>
                <p className="text-muted-foreground">Loading tasks...</p>
              </div>
            </div>
          ) : totalTasks === 0 ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-center">
                <Check className="w-16 h-16 text-green-500 mx-auto mb-4" />
                <p className="text-muted-foreground">No pending tasks at this time.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Pending Member Approvals Section */}
              {Array.isArray(pendingMembers) && pendingMembers.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <UserCheck className="w-5 h-5 text-blue-600" />
                    <h3 className="text-lg font-semibold text-blue-600">
                      Pending Player Approvals ({pendingMembers.length})
                    </h3>
                  </div>
                  <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                    <div className="space-y-3">
                      {pendingMembers.map((member: any) => (
                        <div 
                          key={member.id}
                          className="bg-white dark:bg-card border border-blue-200 dark:border-blue-800 rounded-lg p-3 flex items-center justify-between"
                          data-testid={`pending-member-${member.id}`}
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center">
                              <span className="text-blue-600 text-sm font-medium">
                                {member.user?.firstName?.charAt(0) || '?'}
                              </span>
                            </div>
                            <div>
                              <p className="font-medium text-[#000000]">
                                {member.user?.firstName || 'Unknown'} {member.user?.lastName || 'User'}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                {member.user?.email}
                              </p>
                              {member.assignedTeam && (
                                <p className="text-sm text-blue-600">
                                  Assigned to: {member.assignedTeam.name}
                                </p>
                              )}
                            </div>
                          </div>
                          <Button 
                            size="sm" 
                            className="bg-blue-600 hover:bg-blue-700 text-white"
                            onClick={() => onNavigate(`/league-management?leagueId=${leagueId}`)}
                            data-testid={`button-review-member-${member.id}`}
                          >
                            Review
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Pending Substitute Approvals Section */}
              {pendingSubstituteApprovals && (pendingSubstituteApprovals.captain.length > 0 || pendingSubstituteApprovals.commissioner.length > 0) && (
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <Users className="w-5 h-5 text-purple-600" />
                    <h3 className="text-lg text-[#de0000] font-black">
                      Substitute Approvals ({pendingSubstituteApprovals.total})
                    </h3>
                  </div>
                  <div className="dark:bg-purple-950 border border-purple-200 dark:border-purple-800 rounded-lg p-4 bg-[#6b6b6b85]">
                    <div className="space-y-3">
                      {/* Captain Approvals */}
                      {pendingSubstituteApprovals.captain.map((request: any) => (
                        <div 
                          key={request.id}
                          className="bg-white dark:bg-card border border-purple-200 dark:border-purple-800 rounded-lg p-3"
                          data-testid={`pending-substitute-captain-${request.id}`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 bg-purple-100 dark:bg-purple-900 rounded-full flex items-center justify-center">
                                <Users className="w-4 h-4 text-purple-600" />
                              </div>
                              <div>
                                <p className="font-medium text-[#000000]">
                                  {request.game.homeTeam.name} vs {request.game.awayTeam.name}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                  {format(new Date(request.game.scheduledAt), 'MMM d, yyyy • h:mm a')}
                                </p>
                                <p className="text-sm text-purple-600">
                                  Substitute request from opposing captain
                                </p>
                                {request.originalPlayer && (
                                  <p className="text-sm text-muted-foreground">
                                    Player: {request.originalPlayer.firstName} {request.originalPlayer.lastName}
                                    {request.originalPlayer.skillLevel && ` • Skill: ${request.originalPlayer.skillLevel}`}
                                  </p>
                                )}
                                {request.substitutePlayer && (
                                  <p className="text-sm text-muted-foreground">
                                    Substitute: {request.substitutePlayer.firstName} {request.substitutePlayer.lastName}
                                    {request.substitutePlayer.skillLevel && ` • Skill: ${request.substitutePlayer.skillLevel}`}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                          
                          {/* Comments Input */}
                          <div className="mb-3">
                            <Textarea
                              value={selectedRequest === request.id ? comments : ""}
                              onChange={(e) => {
                                setSelectedRequest(request.id);
                                setComments(e.target.value);
                              }}
                              placeholder="Optional comments..."
                              className="min-h-[60px]"
                              data-testid={`textarea-comments-${request.id}`}
                            />
                          </div>
                          
                          {/* Action Buttons */}
                          <div className="flex gap-2">
                            <Button 
                              size="sm" 
                              onClick={() => handleApprove(request, 'opposing_captain')}
                              disabled={processApprovalMutation.isPending}
                              className="bg-green-600 hover:bg-green-700 text-white"
                              data-testid={`button-approve-substitute-${request.id}`}
                            >
                              Approve
                            </Button>
                            <Button 
                              size="sm" 
                              onClick={() => handleDeny(request, 'opposing_captain')}
                              disabled={processApprovalMutation.isPending}
                              className="bg-red-600 hover:bg-red-700 text-white"
                              data-testid={`button-deny-substitute-${request.id}`}
                            >
                              Deny
                            </Button>
                          </div>
                        </div>
                      ))}
                      
                      {/* Commissioner Approvals */}
                      {pendingSubstituteApprovals.commissioner.map((request: any) => {
                        return (
                          <div 
                            key={request.id}
                            className="dark:bg-card border border-purple-200 dark:border-purple-800 rounded-lg p-3 text-[#ffffff] bg-[#000000]"
                            data-testid={`pending-substitute-commissioner-${request.id}`}
                          >
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-3">
                                
                                <div>
                                  <p className="font-medium text-[#000000]">
                                    {request.game.homeTeam.name} vs {request.game.awayTeam.name}
                                  </p>
                                  <p className="text-sm text-[#ffffff]">
                                    {format(new Date(request.game.scheduledAt), 'MMM d, yyyy • h:mm a')}
                                  </p>
                                  <p className="ml-[1px] mr-[1px] mt-[1px] mb-[1px] pt-[5px] pb-[5px] text-[#de0000] bg-[#ffffff00] text-[16px] font-extrabold text-left pl-[0px] pr-[0px]">Substitution requires approval</p>
                                  {request.originalPlayer && (
                                    <p className="text-sm font-bold text-[#ffffff]">
                                      Player: {request.originalPlayer.firstName} {request.originalPlayer.lastName}
                                      {request.originalPlayer.skillLevel && ` • Skill: ${request.originalPlayer.skillLevel}`}
                                    </p>
                                  )}
                                  {request.substitutePlayer && (
                                    <p className="text-sm text-[#ffffff] font-bold">
                                      Substitute: {request.substitutePlayer.firstName} {request.substitutePlayer.lastName}
                                      {request.substitutePlayer.skillLevel && ` • Skill: ${request.substitutePlayer.skillLevel}`}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </div>
                            
                            {/* Comments Input */}
                            <div className="mb-3">
                              <Textarea
                                value={selectedRequest === request.id ? comments : ""}
                                onChange={(e) => {
                                  setSelectedRequest(request.id);
                                  setComments(e.target.value);
                                }}
                                placeholder="Optional comments..."
                                className="min-h-[60px]"
                                data-testid={`textarea-comments-commissioner-${request.id}`}
                              />
                            </div>
                            
                            {/* Action Buttons */}
                            <div className="flex gap-2">
                              <Button 
                                size="sm" 
                                onClick={() => handleApprove(request, 'commissioner')}
                                disabled={processApprovalMutation.isPending}
                                className="bg-green-600 hover:bg-green-700 text-white"
                                data-testid={`button-approve-commissioner-substitute-${request.id}`}
                              >
                                Approve
                              </Button>
                              <Button 
                                size="sm" 
                                onClick={() => handleDeny(request, 'commissioner')}
                                disabled={processApprovalMutation.isPending}
                                className="bg-red-600 hover:bg-red-700 text-white"
                                data-testid={`button-deny-commissioner-substitute-${request.id}`}
                              >
                                Deny
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Games Needing Score Verification Section */}
              {Array.isArray(gamesNeedingVerification) && gamesNeedingVerification.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <BarChart3 className="w-5 h-5 text-orange-600" />
                    <h3 className="text-lg font-semibold text-orange-600">
                      Score Verifications ({gamesNeedingVerification.length})
                    </h3>
                  </div>
                  <div className="bg-orange-50 dark:bg-orange-950 border border-orange-200 dark:border-orange-800 rounded-lg p-4">
                    <div className="space-y-3">
                      {gamesNeedingVerification.map((game: any) => (
                        <div 
                          key={game.id}
                          className="bg-white dark:bg-card border border-orange-200 dark:border-orange-800 rounded-lg p-3 flex items-center justify-between"
                          data-testid={`verification-game-${game.id}`}
                        >
                          <div className="flex items-center gap-3">
                            <AlertCircle className="w-5 h-5 text-orange-500" />
                            <div>
                              <p className="font-medium text-[#000000]">
                                {game.homeTeam?.name} vs {game.awayTeam?.name}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                {format(new Date(game.scheduledAt), 'MMM d, yyyy • h:mm a')}
                              </p>
                              <p className="text-sm text-orange-600">
                                {game.reason}
                              </p>
                            </div>
                          </div>
                          <Button 
                            size="sm" 
                            className="bg-orange-600 hover:bg-orange-700 text-white"
                            onClick={() => onNavigate(`/league-management?leagueId=${leagueId}`)}
                            data-testid={`button-verify-game-${game.id}`}
                          >
                            Verify
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer with Close Button */}
        <div className="p-6 border-t border-border">
          <div className="flex justify-center">
            <Button 
              onClick={onClose}
              className="px-8 py-2"
              data-testid="button-close-needs-attention"
            >
              Close
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Standings Modal Component
function StandingsModal({ isOpen, onClose, leagueId }: { 
  isOpen: boolean; 
  onClose: () => void; 
  leagueId: string | null; 
}) {
  const { canAccessPremiumFeatures } = usePermissions();
  const { data: standings = [], isLoading } = useQuery({
    queryKey: ['/api/leagues', leagueId, 'standings'],
    queryFn: async () => {
      if (!leagueId) return [];
      const response = await apiRequest('GET', `/api/leagues/${leagueId}/standings`);
      return response.json();
    },
    enabled: !!leagueId && isOpen,
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-card rounded-lg border border-border w-full max-w-6xl h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-border relative">
          <h2 className="text-2xl font-semibold text-center">League Standings</h2>
          <button
            onClick={onClose}
            className="absolute top-6 right-6 w-10 h-10 bg-red-600 hover:bg-red-700 rounded flex items-center justify-center transition-colors"
            data-testid="button-close-standings"
          >
            <X className="w-5 h-5 text-white" />
          </button>
        </div>

        {/* Content */}
        <FeatureLockOverlay isLocked={!canAccessPremiumFeatures()} className="flex-1 flex flex-col">
        <div className="flex-1 overflow-auto p-6">
          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-center">
                <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-2"></div>
                <p className="text-muted-foreground">Loading standings...</p>
              </div>
            </div>
          ) : standings.length === 0 ? (
            <div className="flex items-center justify-center h-64">
              <p className="text-muted-foreground">No standings data available</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left p-3 font-semibold">Team Name</th>
                    <th className="text-center p-3 font-semibold">GP</th>
                    <th className="text-center p-3 font-semibold">W</th>
                    <th className="text-center p-3 font-semibold">L</th>
                    <th className="text-center p-3 font-semibold">T</th>
                    <th className="text-center p-3 font-semibold">SOL</th>
                    <th className="text-center p-3 font-semibold">PTS</th>
                    <th className="text-center p-3 font-semibold">GF</th>
                    <th className="text-center p-3 font-semibold">GA</th>
                  </tr>
                </thead>
                <tbody>
                  {standings.map((team: any, index: number) => (
                    <tr 
                      key={team.teamId} 
                      className={`border-b border-border/50 hover:bg-muted/30 ${index === 0 ? 'bg-primary/5' : ''}`}
                      data-testid={`standings-row-${team.teamId}`}
                    >
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{team.teamName}</span>
                        </div>
                      </td>
                      <td className="text-center p-3" data-testid={`games-played-${team.teamId}`}>
                        {team.gamesPlayed}
                      </td>
                      <td className="text-center p-3 text-green-600 font-medium" data-testid={`wins-${team.teamId}`}>
                        {team.wins}
                      </td>
                      <td className="text-center p-3 text-red-600 font-medium" data-testid={`losses-${team.teamId}`}>
                        {team.losses}
                      </td>
                      <td className="text-center p-3 text-yellow-600 font-medium" data-testid={`ties-${team.teamId}`}>
                        {team.ties}
                      </td>
                      <td className="text-center p-3 text-orange-600 font-medium" data-testid={`shootout-losses-${team.teamId}`}>
                        {team.shootoutLosses}
                      </td>
                      <td className="text-center p-3 font-bold text-primary" data-testid={`points-${team.teamId}`}>
                        {team.points}
                      </td>
                      <td className="text-center p-3" data-testid={`goals-for-${team.teamId}`}>
                        {team.goalsFor}
                      </td>
                      <td className="text-center p-3" data-testid={`goals-against-${team.teamId}`}>
                        {team.goalsAgainst}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        </FeatureLockOverlay>
      </div>
    </div>
  );
}

// Needs Attention Component for Score Verification
function NeedsAttentionTasks({ leagueId, onNavigate }: { 
  leagueId: string; 
  onNavigate: (path: string) => void; 
}) {
  // Fetch games that need score verification
  const { data: gamesNeedingVerification = [] } = useQuery({
    queryKey: ['/api/leagues', leagueId, 'games-needing-verification'],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/leagues/${leagueId}/games`);
      const allGames = await response.json();
      
      if (!Array.isArray(allGames)) return [];
      
      // Find games that need verification based on the correct business logic:
      // 1. Today's date is AFTER the game's date (past games)
      // 2. Game has problematic score submissions (0, 1, or 2 mismatched)
      const gamesNeedingVerification: any[] = [];
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
          const submissions = await submissionsResponse.json();
          
          if (!Array.isArray(submissions)) continue;
          
          const submissionCount = submissions.length;
          let needsVerification = false;
          let reason = '';
          
          if (submissionCount === 0) {
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
              reason = `Mismatched scores: ${sub1.homeScore}-${sub1.awayScore} vs ${sub2.homeScore}-${sub2.awayScore}`;
            }
          }
          
          if (needsVerification) {
            gamesNeedingVerification.push(game);
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

  // This component no longer renders UI since the permanent "Needs Attention" bar
  // in the main component handles all needs attention tasks
  return null;
}

export default function Dashboard() {
  const { user } = useAuth();
  const tier = (user as any)?.role || 'free_tier';
  const { canAccessPremiumFeatures } = usePermissions();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  
  // League selection state
  const [selectedLeagueId, setSelectedLeagueId] = useState<string | null>(null);
  const [showLeagueDropdown, setShowLeagueDropdown] = useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);
  
  // Score submission modal state
  const [showScoreModal, setShowScoreModal] = useState(false);
  const [selectedGameForScore, setSelectedGameForScore] = useState<any>(null);
  const [homeScore, setHomeScore] = useState('');
  const [awayScore, setAwayScore] = useState('');

  // Standings modal state
  const [showStandingsModal, setShowStandingsModal] = useState(false);
  
  // Needs Attention modal state
  const [showNeedsAttentionModal, setShowNeedsAttentionModal] = useState(false);
  
  // Feedback modal state
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  
  const { data: upcomingGames, isLoading: gamesLoading } = useQuery({
    queryKey: ['/api/user/games/upcoming'],
    select: (games) => {
      // Filter games by selected league if available
      if (!selectedLeagueId || !Array.isArray(games)) return games;
      return games.filter(game => 
        game.homeTeam?.leagueId === selectedLeagueId || 
        game.awayTeam?.leagueId === selectedLeagueId
      );
    }
  });

  const { data: scrimmageInvites, isLoading: invitesLoading } = useQuery({
    queryKey: ['/api/users/scrimmage-invites'],
    select: (invites) => {
      // Filter invites by selected league if available
      if (!selectedLeagueId || !Array.isArray(invites)) return invites;
      return invites.filter((invite: any) => invite.leagueId === selectedLeagueId);
    }
  });

  const { data: userTeams } = useQuery({
    queryKey: ['/api/user/teams'],
    select: (teams) => {
      // Filter teams by selected league if available
      if (!selectedLeagueId || !Array.isArray(teams)) return teams;
      return teams.filter(team => team.leagueId === selectedLeagueId);
    }
  });
  
  // Get all user teams (unfiltered) for captain checks across all leagues
  const { data: userTeamsAll } = useQuery({
    queryKey: ['/api/user/teams']
  });

  const { data: userLeagueMemberships } = useQuery({
    queryKey: ['/api/user/league-memberships'],
  });
  
  const { data: userLeagues } = useQuery({
    queryKey: ['/api/user/leagues'],
  });
  
  // Set default selected league when leagues load
  React.useEffect(() => {
    if (Array.isArray(userLeagues) && userLeagues.length > 0 && !selectedLeagueId) {
      setSelectedLeagueId(userLeagues[0].id);
    }
  }, [userLeagues, selectedLeagueId]);
  
  // Close dropdown when clicking outside
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowLeagueDropdown(false);
      }
    };

    if (showLeagueDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showLeagueDropdown]);
  
  // Get currently selected league and membership
  const selectedLeague = Array.isArray(userLeagues) && selectedLeagueId
    ? userLeagues.find(league => league.id === selectedLeagueId)
    : Array.isArray(userLeagues) && userLeagues.length > 0 
      ? userLeagues[0] 
      : null;
      
  const selectedLeagueMembership = Array.isArray(userLeagueMemberships) && selectedLeagueId
    ? userLeagueMemberships.find(membership => membership.leagueId === selectedLeagueId)
    : Array.isArray(userLeagueMemberships) && userLeagueMemberships.length > 0 
      ? userLeagueMemberships[0] 
      : null;

  const primaryTeam = Array.isArray(userTeams) && userTeams.length > 0 ? userTeams[0] : null;
  
  // Compute captain status for the selected league using team.captainId
  const isTeamCaptainInSelectedLeague = React.useMemo(() => {
    if (!selectedLeagueId || !Array.isArray(userTeams) || !(user as any)?.id) return false;
    return userTeams.some(team => team.captainId === (user as any).id);
  }, [selectedLeagueId, userTeams, (user as any)?.id]);
  
  // Helper to compute captain status for any league (for dropdown badges)
  const isCaptainInLeague = React.useCallback((leagueId: string) => {
    if (!Array.isArray(userTeamsAll) || !(user as any)?.id) return false;
    return userTeamsAll.some(team => team.leagueId === leagueId && team.captainId === (user as any).id);
  }, [userTeamsAll, (user as any)?.id]);

  // Fetch team record based on game scores
  const { data: teamRecord } = useQuery({
    queryKey: [`/api/teams/${primaryTeam?.id}/record`],
    enabled: !!primaryTeam?.id,
  });


  // Beverage duty mutation
  const claimBeverageDutyMutation = useMutation({
    mutationFn: async (data: { gameId: string; teamId: string }) => {
      return apiRequest('POST', `/api/games/${data.gameId}/beverage-duty`, { teamId: data.teamId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/user/games/upcoming'] });
      toast({
        title: "Success",
        description: "Beverage duty claimed!",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to claim beverage duty. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Score submission mutation
  const scoreSubmissionMutation = useMutation({
    mutationFn: async ({ gameId, homeScore, awayScore }: { gameId: string; homeScore: number; awayScore: number }) => {
      return await apiRequest("POST", `/api/games/${gameId}/submit-score`, { homeScore, awayScore });
    },
    onSuccess: () => {
      setShowScoreModal(false);
      setHomeScore('');
      setAwayScore('');
      setSelectedGameForScore(null);
      toast({
        title: "Score Submitted",
        description: "Game score has been submitted successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Submission Failed",
        description: error.message || "Failed to submit score. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Scrimmage check-in mutation
  const scrimmageCheckInMutation = useMutation({
    mutationFn: async (scrimmageId: string) => {
      return await apiRequest("POST", `/api/scrimmages/${scrimmageId}/requests`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/users/scrimmage-invites'] });
      queryClient.invalidateQueries({ queryKey: ['/api/user/games/upcoming'] });
      toast({
        title: "Checked In",
        description: "Your check-in request has been submitted and is pending approval.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Check-in Failed",
        description: error.message || "Failed to check in. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleScoreSubmit = () => {
    const home = parseInt(homeScore);
    const away = parseInt(awayScore);
    if (!isNaN(home) && !isNaN(away) && home >= 0 && away >= 0 && selectedGameForScore) {
      scoreSubmissionMutation.mutate({ 
        gameId: selectedGameForScore.id, 
        homeScore: home, 
        awayScore: away 
      });
    }
  };

  // Fetch needs attention data for the permanent bar
  const { data: needsAttentionData } = useQuery({
    queryKey: ['/api/needs-attention-summary', selectedLeagueId],
    queryFn: async () => {
      if (!selectedLeagueId) return { pendingMembers: 0, gamesNeedingVerification: 0, total: 0 };
      
      try {
        // Fetch pending members
        const pendingMembersResponse = await apiRequest('GET', `/api/leagues/${selectedLeagueId}/pending-members`);
        const pendingMembers = await pendingMembersResponse.json();
        
        // Fetch games needing verification
        const gamesResponse = await apiRequest('GET', `/api/leagues/${selectedLeagueId}/games`);
        const allGames = await gamesResponse.json();
        
        let gamesNeedingVerification = 0;
        if (Array.isArray(allGames)) {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          
          for (const game of allGames) {
            const gameDate = new Date(game.scheduledAt);
            gameDate.setHours(0, 0, 0, 0);
            
            if (gameDate >= today) continue;
            
            try {
              const submissionsResponse = await apiRequest('GET', `/api/games/${game.id}/score-submissions`);
              
              // If we get a 403, skip this game (user doesn't have access)
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
              
              // Check if there's a commissioner submission - if so, no verification needed
              const hasCommissionerSubmission = submissions.some((sub: any) => 
                sub.submitterRole === 'commissioner' || sub.isCommissionerOverride === true
              );
              
              if (hasCommissionerSubmission) {
                // Commissioner has already submitted final score - no verification needed
                needsVerification = false;
              } else if (submissionCount === 0 || submissionCount === 1) {
                needsVerification = true;
              } else if (submissionCount === 2) {
                const [sub1, sub2] = submissions;
                if (sub1.homeScore !== sub2.homeScore || sub1.awayScore !== sub2.awayScore) {
                  needsVerification = true;
                }
              }
              
              if (needsVerification) {
                gamesNeedingVerification++;
              }
            } catch (error) {
              continue;
            }
          }
        }
        
        // Fetch pending substitute approvals
        let pendingSubstituteApprovals = 0;
        try {
          const substituteApprovalsResponse = await apiRequest('GET', `/api/substitute-requests/pending-approvals?leagueId=${selectedLeagueId}`);
          const substituteData = await substituteApprovalsResponse.json();
          pendingSubstituteApprovals = substituteData.total || 0;
        } catch (error) {
          // If substitute approvals endpoint fails, just continue without it
          pendingSubstituteApprovals = 0;
        }
        
        const pendingMembersCount = Array.isArray(pendingMembers) ? pendingMembers.length : 0;
        const total = pendingMembersCount + gamesNeedingVerification + pendingSubstituteApprovals;
        
        
        return {
          pendingMembers: pendingMembersCount,
          gamesNeedingVerification,
          pendingSubstituteApprovals,
          total
        };
      } catch (error) {
        return { pendingMembers: 0, gamesNeedingVerification: 0, pendingSubstituteApprovals: 0, total: 0 };
      }
    },
    enabled: !!selectedLeagueId,
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  return (
    <div className="min-h-screen flex flex-col pb-24" data-testid="dashboard-page">
      {/* Header */}
      <div className="p-3 pt-[0px] pb-[0px] flex items-center mt-[12px] mb-[12px] pl-[16px] pr-[16px]">
        <div className="flex items-center justify-between w-full mt-[4px] mb-[4px] pt-[8px] pb-[8px]">
          <div className="flex items-center gap-2">
            <img 
              src={logoUrl}
              alt="Roster Logo" 
              className="h-[30px] w-auto pt-[0px] pb-[0px] pl-[12px] pr-[12px]"
              data-testid="img-roster-logo"
            />
            {tier !== 'free' && (
              <>
                {tier === 'commissioner' || tier === 'secondary_commissioner' ? (
                  <Crown className="w-[30px] h-[30px] text-yellow-500" data-testid="badge-subscription-tier" />
                ) : (
                  <Star className="w-[30px] h-[30px] text-primary fill-current" data-testid="badge-subscription-tier" />
                )}
              </>
            )}
          </div>
          <div className="flex items-center gap-3 pr-16">
            {teamRecord ? (
              <span className="text-[16px] text-center font-bold bg-[#3c83f685] text-[#ffffff] ml-[4px] mr-[4px] mt-[0px] mb-[0px] pl-[4px] pr-[4px] pt-[4px] pb-[4px]" data-testid="text-team-record">
                {`${(teamRecord as any).wins}-${(teamRecord as any).losses}-${(teamRecord as any).ties}`}
              </span>
            ) : null}
            
            {/* Captain Badge */}
            {isTeamCaptainInSelectedLeague && (
              <span className="w-[30px] h-[30px] bg-warning text-black font-bold text-base flex items-center justify-center rounded">
                C
              </span>
            )}
            
            <button 
              onClick={() => navigate('/profile')}
              className="w-[30px] h-[30px] rounded-full flex items-center justify-center overflow-hidden bg-primary"
              data-testid="button-profile"
            >
              {(user as any)?.profileImageUrl ? (
                <img 
                  src={(user as any).profileImageUrl} 
                  alt="Profile"
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-primary-foreground text-sm font-semibold">
                  {(user as any)?.firstName?.[0] || 'U'}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>
      {/* League Selection Dropdown */}
      {Array.isArray(userLeagues) && userLeagues.length > 0 && (
        <div className="px-6 mb-4">
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setShowLeagueDropdown(!showLeagueDropdown)}
              className="w-full border border-border rounded-lg p-3 flex items-center justify-between hover:bg-muted/50 transition-colors bg-[#212121]"
              data-testid="button-league-selector"
            >
              <div className="flex items-center gap-2">
                <Trophy className="w-4 h-4 text-primary" />
                <span className="font-medium text-sm">
                  {selectedLeague?.name || 'Select League'}
                </span>
              </div>
              <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${showLeagueDropdown ? 'rotate-180' : ''}`} />
            </button>
            
            {showLeagueDropdown && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg z-50">
                {userLeagues.map((league: any) => {
                  const membership = Array.isArray(userLeagueMemberships) 
                    ? userLeagueMemberships.find(m => m.leagueId === league.id)
                    : null;
                  return (
                    <button
                      key={league.id}
                      onClick={() => {
                        setSelectedLeagueId(league.id);
                        setShowLeagueDropdown(false);
                      }}
                      className={`w-full p-3 text-left hover:bg-muted/50 transition-colors first:rounded-t-lg last:rounded-b-lg ${
                        selectedLeagueId === league.id ? 'bg-primary/10 text-primary' : ''
                      }`}
                      data-testid={`option-league-${league.id}`}
                    >
                      <div className="flex items-center gap-2">
                        <Trophy className="w-4 h-4" />
                        <span className="font-medium text-sm">{league.name}</span>
                        {isCaptainInLeague(league.id) && (
                          <span className="ml-auto w-4 h-4 bg-warning text-black font-bold text-xs flex items-center justify-center rounded">
                            C
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
      {/* 4-Card Section */}
      <div className="px-6 mb-6">
        <div className="grid grid-cols-4 gap-3">
          {/* Announcements Card */}
          <Link href="/announcements">
            <div className="rounded-xl border border-border p-5 min-h-[72px] relative cursor-pointer hover:bg-muted/50 transition-colors bg-[#212121]" data-testid="card-announcements">
              <div className="h-full flex flex-col items-center justify-center">
                <Megaphone className="w-8 h-8 text-orange-500 mb-3" />
                <p className="text-xs font-medium">News</p>
              </div>
              <AnnouncementBadge leagueId={selectedLeagueId} />
            </div>
          </Link>

          {/* Stats Card */}
          <div 
            className="rounded-xl border border-border p-5 min-h-[72px] cursor-pointer hover:bg-muted/50 transition-colors bg-[#212121]" 
            data-testid="card-stats"
            onClick={() => navigate(selectedLeagueId ? `/stats?league=${selectedLeagueId}` : '/stats')}
          >
            <div className="h-full flex flex-col items-center justify-center">
              <BarChart3 className="w-8 h-8 text-purple-500 mb-3" />
              <p className="text-xs font-medium">Stats</p>
            </div>
          </div>

          {/* Standings Card */}
          <div 
            className="rounded-xl border border-border p-5 min-h-[72px] cursor-pointer hover:bg-muted/50 transition-colors bg-[#212121]" 
            data-testid="card-standings"
            onClick={() => selectedLeagueId && setShowStandingsModal(true)}
          >
            <div className="h-full flex flex-col items-center justify-center">
              <Award className="w-8 h-8 text-blue-500 mb-3" />
              <p className="text-xs font-medium">Standings</p>
            </div>
          </div>

          {/* Payments Card */}
          <div 
            className="rounded-xl border border-border p-5 min-h-[72px] relative cursor-pointer hover:bg-muted/50 transition-colors bg-[#212121]" 
            data-testid="card-payments"
            onClick={() => navigate('/payment-requests')}
          >
            <div className="h-full flex flex-col items-center justify-center">
              <DollarSign className="w-8 h-8 text-green-500 mb-3" />
              <p className="text-xs font-medium">Payments</p>
            </div>
            <PaymentRequestBadge />
          </div>
        </div>
      </div>
      {/* Quick Stats */}
      {primaryTeam && (
        <div className="px-6 mb-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-xl border border-border p-4 pt-[2px] pb-[2px] pl-[10px] pr-[10px] bg-[#212121]" data-testid="card-games-stat">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
                  {primaryTeam?.logoUrl ? (
                    <img 
                      src={primaryTeam.logoUrl} 
                      alt={`${primaryTeam.name} logo`}
                      className="w-full h-full rounded-lg object-cover"
                      data-testid="img-team-logo"
                    />
                  ) : (
                    <Trophy className="w-5 h-5 text-primary-foreground" />
                  )}
                </div>
                <div>
                  <p className="text-2xl font-bold" data-testid="text-games-remaining">
                    {(teamRecord as any)?.gamesRemaining ?? 0}
                  </p>
                  <p className="text-muted-foreground text-[16px]">Games Left</p>
                </div>
              </div>
            </div>
            
            {selectedLeagueId && needsAttentionData && (
              <div className="rounded-xl border border-border bg-[#212121]">
                <button
                  onClick={() => setShowNeedsAttentionModal(true)}
                  className="w-full h-full flex items-center justify-between hover:bg-gray-800 transition-colors rounded-xl px-3 py-2"
                  data-testid="button-needs-attention-permanent"
                >
                  <div className="flex items-center gap-3">
                    <Settings className="w-4 h-4 text-white" />
                    <span className="text-white font-medium text-sm">To-Do</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 bg-red-500 rounded-full flex items-center justify-center">
                      <span className="text-white text-xs font-bold">{needsAttentionData.total}</span>
                    </div>
                    <ChevronDown className="w-4 h-4 text-white" />
                  </div>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      {/* Needs Attention Section */}
      {selectedLeagueId && (
        <NeedsAttentionTasks 
          leagueId={selectedLeagueId} 
          onNavigate={navigate}
        />
      )}
      {/* Upcoming Games */}
      <div className="px-6 mt-[8px] mb-[8px]">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold" data-testid="text-schedule-title">Schedule</h2>
          <button 
            onClick={() => navigate('/calendar')}
            className="text-primary text-sm"
            data-testid="button-view-all-games"
          >
            View All
          </button>
        </div>
        
        {gamesLoading || invitesLoading ? (
          <div className="bg-card rounded-xl border border-border p-4 animate-pulse" data-testid="loading-upcoming-games">
            <div className="h-16 bg-muted rounded"></div>
          </div>
        ) : (Array.isArray(upcomingGames) && upcomingGames.length > 0) || (Array.isArray(scrimmageInvites) && scrimmageInvites.length > 0) ? (
          <div className="space-y-3">
            {/* First show scrimmage invites */}
            {Array.isArray(scrimmageInvites) && scrimmageInvites.map((invite: any) => (
              <div 
                key={`invite-${invite.id}`}
                className="rounded-xl border border-yellow-500/50 p-4 relative pt-[5px] pb-[5px] pl-[20px] pr-[20px] bg-[#212121]"
                data-testid={`card-scrimmage-invite-${invite.id}`}
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-yellow-500 rounded-lg flex items-center justify-center">
                    <Trophy className="w-6 h-6 text-black" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold" data-testid={`text-invite-title-${invite.id}`}>
                        {invite.title}
                      </h3>
                      <span className="text-xs bg-yellow-500 text-black px-2 py-0.5 rounded">Invite</span>
                    </div>
                    <p className="text-sm text-muted-foreground" data-testid={`text-invite-time-${invite.id}`}>
                      {format(new Date(invite.dateTime), 'MMM d • h:mm a')}
                    </p>
                    {invite.location && (
                      <p className="text-xs text-muted-foreground" data-testid={`text-invite-location-${invite.id}`}>
                        {invite.location}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      scrimmageCheckInMutation.mutate(invite.id);
                    }}
                    disabled={scrimmageCheckInMutation.isPending}
                    className="bg-yellow-500 text-black px-4 py-2 rounded-lg hover:bg-yellow-600 transition-colors font-medium text-sm disabled:opacity-50"
                    data-testid={`button-check-in-${invite.id}`}
                  >
                    Check In
                  </button>
                </div>
              </div>
            ))}
            
            {/* Then show regular games and approved scrimmages */}
            {(upcomingGames as any[])
              .filter((game: any) => {
                // Always show scrimmages (user is already approved)
                if (game.isScrimmage) {
                  return true;
                }
                // For regular games, ensure we only show games for teams the user is currently on
                const userTeamIds = Array.isArray(userTeams) ? userTeams.map((team: any) => team.id) : [];
                return userTeamIds.includes(game.homeTeamId) || userTeamIds.includes(game.awayTeamId);
              })
              .slice(0, 4).map((game: any) => (
              <div 
                key={game.id} 
                className="rounded-xl border border-border p-4 relative cursor-pointer hover:bg-muted/50 transition-colors pt-[5px] pb-[5px] pl-[20px] pr-[20px] bg-[#212121]" 
                onClick={() => navigate(game.isScrimmage ? `/scrimmage/${game.id}` : `/game/${game.id}`)}
                data-testid={`card-game-${game.id}`}
              >
                <div className="flex items-center gap-4 bg-[212121]">
                  <div className="w-12 h-12 bg-primary rounded-lg flex items-center justify-center relative">
                    {(() => {
                      const opponentTeam = game.homeTeam?.id === primaryTeam?.id ? game.awayTeam : game.homeTeam;
                      return opponentTeam?.logoUrl ? (
                        <img 
                          src={opponentTeam.logoUrl} 
                          alt={`${opponentTeam.name} logo`}
                          className="w-full h-full rounded-lg object-cover"
                          data-testid={`img-opponent-logo-${game.id}`}
                        />
                      ) : (
                        <Trophy className="w-6 h-6 text-primary-foreground" />
                      );
                    })()}
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold" data-testid={`text-game-opponent-${game.id}`}>
                      {game.isScrimmage ? game.scrimmageTitle : `vs ${game.homeTeam?.id === primaryTeam?.id ? game.awayTeam?.name : game.homeTeam?.name}`}
                    </h3>
                    <p className="text-sm text-muted-foreground" data-testid={`text-game-time-${game.id}`}>
                      {format(new Date(game.scheduledAt), 'MMM d • h:mm a')}
                    </p>
                    {game.venue && (
                      <p className="text-xs text-muted-foreground" data-testid={`text-game-venue-${game.id}`}>
                        {game.venue}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Beverage Duty Icon - Left side */}
                    {(() => {
                      // Show beverage icon if user has beverage duty
                      const hasBeverageDuty = game.homeBeverageDutyUserId === (user as any)?.id || game.awayBeverageDutyUserId === (user as any)?.id;
                      
                      return hasBeverageDuty ? (
                        <div className="flex items-center">
                          <img 
                            src={beverageJarUrl}
                            alt="Beverage Duty"
                            className="h-8 w-auto"
                            style={{ aspectRatio: '9/16' }}
                            data-testid={`icon-beverage-duty-${game.id}`}
                          />
                        </div>
                      ) : null;
                    })()}
                    
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-card rounded-xl border border-border p-8 text-center" data-testid="empty-upcoming-games">
            <Clock className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">No upcoming games scheduled</p>
          </div>
        )}
      </div>
      {/* Find a League Section - Bottom */}
      <div className="px-6 flex gap-2">
        <button
          onClick={() => navigate('/league-search')}
          className="flex-1 bg-primary text-primary-foreground px-2 py-1 rounded-lg hover:bg-primary/90 font-medium text-sm"
          data-testid="button-find-league"
        >
          Find a League
        </button>
        <button
          onClick={() => setShowFeedbackModal(true)}
          className="flex-1 bg-primary text-primary-foreground px-2 py-1 rounded-lg hover:bg-primary/90 font-medium text-sm"
          data-testid="button-send-feedback"
        >
          Send Feedback
        </button>
      </div>
      {/* Score Submission Modal */}
      <Dialog open={showScoreModal} onOpenChange={setShowScoreModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Submit Game Score</DialogTitle>
          </DialogHeader>
          
          {selectedGameForScore && (
            <div className="space-y-4">
              <div className="text-center text-sm text-muted-foreground">
                {selectedGameForScore.homeTeam?.name} vs {selectedGameForScore.awayTeam?.name}
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="homeScore" className="text-sm font-medium">
                    {selectedGameForScore.homeTeam?.name || 'Home'} Score
                  </Label>
                  <Input
                    id="homeScore"
                    type="number"
                    min="0"
                    value={homeScore}
                    onChange={(e) => setHomeScore(e.target.value)}
                    placeholder="0"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="awayScore" className="text-sm font-medium">
                    {selectedGameForScore.awayTeam?.name || 'Away'} Score
                  </Label>
                  <Input
                    id="awayScore"
                    type="number"
                    min="0"
                    value={awayScore}
                    onChange={(e) => setAwayScore(e.target.value)}
                    placeholder="0"
                    className="mt-1"
                  />
                </div>
              </div>
              
              <div className="flex gap-3 justify-end">
                <Button
                  variant="outline"
                  onClick={() => setShowScoreModal(false)}
                  disabled={scoreSubmissionMutation.isPending}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleScoreSubmit}
                  disabled={
                    scoreSubmissionMutation.isPending || 
                    !homeScore.trim() || 
                    !awayScore.trim() ||
                    isNaN(parseInt(homeScore)) ||
                    isNaN(parseInt(awayScore))
                  }
                >
                  {scoreSubmissionMutation.isPending ? "Submitting..." : "Submit Score"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      {/* Standings Modal */}
      <StandingsModal
        isOpen={showStandingsModal}
        onClose={() => setShowStandingsModal(false)}
        leagueId={selectedLeagueId}
      />
      {/* Needs Attention Modal */}
      <NeedsAttentionModal 
        isOpen={showNeedsAttentionModal}
        onClose={() => setShowNeedsAttentionModal(false)}
        leagueId={selectedLeagueId}
        onNavigate={navigate}
      />
      {/* Feedback Modal */}
      <FeedbackModal 
        isOpen={showFeedbackModal}
        onClose={() => setShowFeedbackModal(false)}
      />
    </div>
  );
}
