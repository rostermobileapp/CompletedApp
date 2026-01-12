import { useQuery } from '@tanstack/react-query';
import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import { useAuth } from '@/hooks/useAuth';
// 🚨 SUBSCRIPTION SYSTEM REMOVED - ALL FEATURES FREE! 🚨
// import { SubscriptionGate } from '@/components/SubscriptionGate'; // DELETED
// import { useSubscription } from '@/context/SubscriptionContext'; // REMOVED
import { usePermissions } from '@/context/SubscriptionContext';
import { notifyDashboardSelectionChange } from '@/hooks/useDashboardSelection';
import { useLocation, Link } from 'wouter';
import { Trophy, Users, TrendingUp, Clock, Search, Coffee, Check, X, Beer, Megaphone, BarChart3, Award, ChevronDown, AlertCircle, Settings, UserCheck, Shield, Crown, Star, Plus, Pizza, UtensilsCrossed, Cookie, IceCream, Wine, CupSoda, Milk, Wrench, Clipboard, Package, ShoppingBag, Camera, Heart, Smile, ThumbsUp, Flag, Music, Menu, Calendar, LucideIcon, UserPlus, Target, ArrowRight, Bell, XCircle, CheckCircle2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetClose } from '@/components/ui/sheet';
import { useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient, getImageUrl } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { format } from 'date-fns';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import logoUrl from '@assets/Roster Logo White_1757083079896.png';
import beverageJarUrl from '@assets/Luminari Report (1)_1757085824172.png';
import rostersLogoUrl from '@assets/Roster R White_1757096715093.png';
import FeedbackModal from '@/components/FeedbackModal';
import { FeatureLockOverlay } from '@/components/FeatureLockOverlay';
import { SlideOutMenu } from '@/components/SlideOutMenu';

// Icon mapper for duty icons
const ICON_MAP: Record<string, LucideIcon> = {
  Pizza,
  Coffee,
  UtensilsCrossed,
  Cookie,
  IceCream,
  Beer,
  Wine,
  CupSoda,
  Milk,
  Wrench,
  Clipboard,
  Package,
  ShoppingBag,
  Camera,
  Heart,
  Star,
  Trophy,
  Smile,
  ThumbsUp,
  Flag,
  Music,
};

function getIconComponent(iconName: string): LucideIcon | null {
  return ICON_MAP[iconName] || null;
}

// Form schemas
const personalReminderSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  scheduledAt: z.string().min(1, "Date and time are required"),
});

const teamGameSchema = z.object({
  teamId: z.string().min(1, "Team is required"),
  opponentName: z.string().min(1, "Opponent name is required"),
  scheduledAt: z.string().min(1, "Date and time are required"),
  venue: z.string().optional(),
  notes: z.string().optional(),
});

// Notification Badge Component
function AnnouncementBadge({ leagueId, tournamentId }: { leagueId?: string | null; tournamentId?: string | null }) {
  const { data: unreadCount } = useQuery({
    queryKey: tournamentId 
      ? ['/api/tournaments', tournamentId, 'announcements', 'unread-count']
      : ['/api/leagues', leagueId, 'announcements', 'unread-count'],
    queryFn: async () => {
      if (tournamentId) {
        const response = await apiRequest('GET', `/api/tournaments/${tournamentId}/announcements/unread-count`);
        return response.json();
      } else if (leagueId) {
        const response = await apiRequest('GET', `/api/leagues/${leagueId}/announcements/unread-count`);
        return response.json();
      }
      return { count: 0 };
    },
    enabled: !!(leagueId || tournamentId),
    refetchInterval: 30000, // Check every 30 seconds
  });

  if (!unreadCount || unreadCount.count === 0) {
    return null;
  }

  return (
    <div className="absolute top-2 right-2 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center pointer-events-none">
      <span className="text-white text-xs font-bold">{unreadCount.count}</span>
    </div>
  );
}

// Inline Notification Badge for Dropdown Items
function NotificationBadge({ count }: { count: number }) {
  if (!count || count === 0) return null;
  
  return (
    <div className="w-5 h-5 bg-red-500 rounded-full flex items-center justify-center">
      <span className="text-white text-xs font-bold">{count}</span>
    </div>
  );
}


// Notification interface for the modal
interface Notification {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  actionUrl?: string;
  actionText?: string;
  isRead: boolean;
  isDismissed: boolean;
  scrimmageId?: string;
  createdAt: string;
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
    staleTime: 0,
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
    staleTime: 0,
    enabled: !!leagueId && isOpen,
  });

  // Fetch games that need score verification - parallelized for performance
  const { data: gamesNeedingVerification = [], isLoading: gamesLoading } = useQuery({
    queryKey: ['/api/leagues', leagueId, 'games-needing-verification-modal'],
    queryFn: async () => {
      if (!leagueId) return [];
      const response = await apiRequest('GET', `/api/leagues/${leagueId}/games`);
      const allGames = await response.json();
      
      if (!Array.isArray(allGames)) return [];
      
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      // Filter past games first
      const pastGames = allGames.filter((game: any) => {
        const gameDate = new Date(game.scheduledAt);
        gameDate.setHours(0, 0, 0, 0);
        return gameDate < today;
      });
      
      // Fetch all score submissions in parallel
      const submissionResults = await Promise.all(
        pastGames.map(async (game: any) => {
          try {
            const submissionsResponse = await apiRequest('GET', `/api/games/${game.id}/score-submissions`);
            if (!submissionsResponse.ok) return { game, submissions: null };
            const submissions = await submissionsResponse.json();
            return { game, submissions: Array.isArray(submissions) ? submissions : null };
          } catch {
            return { game, submissions: null };
          }
        })
      );
      
      // Process results
      const gamesNeedingVerification = [];
      for (const { game, submissions } of submissionResults) {
        if (!submissions) continue;
        
        const submissionCount = submissions.length;
        let needsVerification = false;
        let reason = '';
        
        const hasCommissionerSubmission = submissions.some((sub: any) => 
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
            reason = `Mismatched scores: ${sub1.homeScore}-${sub1.awayScore} vs ${sub2.homeScore}-${sub2.awayScore}`;
          }
        }
        
        if (needsVerification) {
          gamesNeedingVerification.push({ ...game, reason });
        }
      }
      
      return gamesNeedingVerification;
    },
    staleTime: 0,
    enabled: !!leagueId && isOpen,
  });

  // Fetch games needing star awards
  const { data: gamesNeedingStars = [], isLoading: starsLoading } = useQuery({
    queryKey: ['/api/user/games-needing-stars', leagueId],
    queryFn: async () => {
      if (!leagueId) return [];
      const response = await apiRequest('GET', `/api/user/games-needing-stars?leagueId=${leagueId}`);
      return response.json();
    },
    staleTime: 0,
    enabled: !!leagueId && isOpen,
  });

  // Fetch notifications (previously in header NotificationCenter)
  const { data: notifications = [], isLoading: notificationsLoading } = useQuery<Notification[]>({
    queryKey: ['/api/notifications'],
    staleTime: 0,
    enabled: isOpen,
  });

  const { data: unreadNotifications = [] } = useQuery<Notification[]>({
    queryKey: ['/api/notifications/unread'],
    staleTime: 0,
    enabled: isOpen,
  });

  // Mark notification as read mutation
  const markAsReadMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest('PATCH', `/api/notifications/${id}/read`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/notifications'] });
      queryClient.invalidateQueries({ queryKey: ['/api/notifications/unread'] });
    },
  });

  // Dismiss notification mutation
  const dismissNotificationMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest('PATCH', `/api/notifications/${id}/dismiss`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/notifications'] });
      queryClient.invalidateQueries({ queryKey: ['/api/notifications/unread'] });
    },
  });

  // Helper function to get notification icon based on type
  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'scrimmage_invite':
        return <Calendar className="w-4 h-4 text-blue-500" />;
      case 'scrimmage_reminder':
        return <AlertCircle className="w-4 h-4 text-amber-500" />;
      case 'scrimmage_approved':
        return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case 'scrimmage_canceled':
        return <XCircle className="w-4 h-4 text-red-500" />;
      default:
        return <Bell className="w-4 h-4 text-muted-foreground" />;
    }
  };

  // Handle notification click
  const handleNotificationClick = (notification: Notification) => {
    if (!notification.isRead) {
      markAsReadMutation.mutate(notification.id);
    }
    if (notification.actionUrl) {
      onNavigate(notification.actionUrl);
      onClose();
    }
  };

  // Mark all notifications as read
  const handleMarkAllRead = () => {
    unreadNotifications.forEach((notification) => {
      markAsReadMutation.mutate(notification.id);
    });
  };

  const unreadNotificationCount = unreadNotifications.length;

  const totalTasks = (Array.isArray(pendingMembers) ? pendingMembers.length : 0) + 
                     (Array.isArray(gamesNeedingVerification) ? gamesNeedingVerification.length : 0) +
                     (pendingSubstituteApprovals?.total || 0) +
                     (Array.isArray(gamesNeedingStars) ? gamesNeedingStars.length : 0) +
                     (Array.isArray(notifications) ? notifications.length : 0);

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

  return ReactDOM.createPortal(
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 pb-24 z-50">
      <div className="bg-card rounded-lg border border-border w-full max-w-md h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-border pt-[4px] pb-[4px]">
          <h2 className="text-2xl font-semibold text-center">Needs Attention</h2>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6 pl-[4px] pr-[4px]">
          {(pendingMembersLoading || gamesLoading || substituteApprovalsLoading || starsLoading || notificationsLoading) ? (
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
                    <h3 className="text-lg font-semibold text-[#3c83f6]">
                      Pending Player Approvals ({pendingMembers.length})
                    </h3>
                  </div>
                  <div className="dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4 bg-[#212121]">
                    <div className="space-y-3">
                      {pendingMembers.map((member: any) => (
                        <div 
                          key={member.id}
                          className="bg-white dark:bg-card border border-blue-200 dark:border-blue-800 rounded-lg p-3 flex items-center justify-between"
                          data-testid={`pending-member-${member.id}`}
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 dark:bg-blue-900 rounded-full flex items-center justify-center bg-[#ffffff]">
                              <span className="text-sm font-medium text-[#000000]">
                                {member.user?.firstName?.charAt(0) || '?'}
                              </span>
                            </div>
                            <div className="flex-1">
                              <p className="font-medium text-[#ffffff]">
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
                              {member.message && (
                                <p className="text-sm text-muted-foreground italic mt-1" data-testid={`pending-member-message-${member.id}`}>
                                  "{member.message}"
                                </p>
                              )}
                            </div>
                          </div>
                          <Button 
                            size="sm" 
                            className="hover:bg-blue-700 text-white bg-[#3c83f6]"
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
              {pendingSubstituteApprovals && (pendingSubstituteApprovals.captain.length > 0 || pendingSubstituteApprovals.commissioner.length > 0 || (pendingSubstituteApprovals.substitutePlayer?.length || 0) > 0) && (
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <h3 className="text-lg font-black text-[#3c83f6]">
                      Substitute Approvals
                    </h3>
                  </div>
                  <div className="dark:bg-purple-950 rounded-lg p-4 bg-[#e2e2e2] dark:bg-[#212121] pt-[0px] pb-[0px] pl-[0px] pr-[0px]">
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
                                  {format(new Date(request.game.scheduledAt), 'MMM d, yyyy')}
                                </p>
                                <p className="text-sm text-purple-600">
                                  Substitute request from opposing captain
                                </p>
                                {request.originalPlayer && (
                                  <p className="text-sm text-muted-foreground">
                                    Player: {request.originalPlayer.firstName} {request.originalPlayer.lastName}
                                  </p>
                                )}
                                {request.substitutePlayer && (
                                  <p className="text-sm text-muted-foreground">
                                    Substitute: {request.substitutePlayer.firstName} {request.substitutePlayer.lastName}
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
                            className="dark:bg-card rounded-lg p-3 text-[#212121] dark:text-[#ffffff] bg-[#e2e2e2] dark:bg-[#212121]"
                            data-testid={`pending-substitute-commissioner-${request.id}`}
                          >
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-3">
                                
                                <div>
                                  <p className="font-medium text-[#212121] dark:text-[#ffffff]">
                                    {request.game.homeTeam.name} vs {request.game.awayTeam.name}
                                  </p>
                                  <p className="text-[#212121] dark:text-[#ffffff] text-[16px]">
                                    {format(new Date(request.game.scheduledAt), 'MMM d, yyyy')}
                                  </p>
                                  <p className="ml-[1px] mr-[1px] mt-[1px] mb-[1px] pt-[5px] pb-[5px] bg-[#ffffff00] font-extrabold text-left pl-[0px] pr-[0px] text-[#3c83f6] text-[20px]">Substitution Proposal</p>
                                  {request.originalPlayer && (
                                    <p className="font-bold text-[#212121] dark:text-[#ffffff] text-[16px]">
                                      Player: {request.originalPlayer.firstName} {request.originalPlayer.lastName}
                                    </p>
                                  )}
                                  {request.substitutePlayer && (
                                    <p className="text-[#212121] dark:text-[#ffffff] font-bold text-[16px]">
                                      Substitute: {request.substitutePlayer.firstName} {request.substitutePlayer.lastName}
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
                      
                      {/* Substitute Player Confirmations */}
                      {pendingSubstituteApprovals.substitutePlayer?.map((request: any) => {
                        return (
                          <div 
                            key={request.id}
                            className="dark:bg-card rounded-lg p-3 text-[#212121] dark:text-[#ffffff] bg-[#e2e2e2] dark:bg-[#212121]"
                            data-testid={`pending-substitute-player-${request.id}`}
                          >
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-3">
                                <div>
                                  <p className="font-medium text-[#212121] dark:text-[#ffffff]">
                                    {request.game.homeTeam.name} vs {request.game.awayTeam.name}
                                  </p>
                                  <p className="text-[#212121] dark:text-[#ffffff] text-[16px]">
                                    {format(new Date(request.game.scheduledAt), 'MMM d, yyyy')}
                                  </p>
                                  <p className="ml-[1px] mr-[1px] mt-[1px] mb-[1px] pt-[5px] pb-[5px] bg-[#ffffff00] font-extrabold text-left pl-[0px] pr-[0px] text-[#22c55e] text-[20px]">Confirm Your Availability</p>
                                  <p className="text-[#212121] dark:text-[#ffffff] text-[14px]">
                                    You've been requested to substitute for {request.originalPlayer?.firstName} {request.originalPlayer?.lastName}
                                  </p>
                                </div>
                              </div>
                            </div>
                            {/* Action Buttons */}
                            <div className="flex gap-2">
                              <Button 
                                size="sm" 
                                onClick={() => handleApprove(request, 'substitute_player')}
                                disabled={processApprovalMutation.isPending}
                                className="bg-green-600 hover:bg-green-700 text-white"
                                data-testid={`button-confirm-substitute-${request.id}`}
                              >
                                I'm Available - Confirm
                              </Button>
                              <Button 
                                size="sm" 
                                onClick={() => handleDeny(request, 'substitute_player')}
                                disabled={processApprovalMutation.isPending}
                                className="bg-red-600 hover:bg-red-700 text-white"
                                data-testid={`button-decline-substitute-${request.id}`}
                              >
                                Can't Make It
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
                    <BarChart3 className="w-5 h-5 text-[#3c83f6]" />
                    <h3 className="text-lg font-semibold text-[#3c83f6]">
                      Score Verifications ({gamesNeedingVerification.length})
                    </h3>
                  </div>
                  <div className="bg-[#e2e2e2] dark:bg-[#212121] rounded-lg p-4">
                    <Button 
                      className="w-full bg-[#3c83f6] hover:bg-[#2563eb] text-white"
                      onClick={() => onNavigate(`/league-management?leagueId=${leagueId}`)}
                      data-testid="button-verify-scores"
                    >
                      <BarChart3 className="w-4 h-4 mr-2" />
                      Verify Scores
                    </Button>
                  </div>
                </div>
              )}

              {/* Games Needing Star Awards Section */}
              {Array.isArray(gamesNeedingStars) && gamesNeedingStars.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <Star className="w-5 h-5 text-yellow-600" />
                    <h3 className="text-lg font-semibold text-[#212121] dark:text-[#ffffff]">
                      Award 3 Stars
                    </h3>
                  </div>
                  <div className="dark:bg-yellow-950 rounded-lg p-4 bg-[#e2e2e2] dark:bg-[#212121]">
                    <div className="space-y-3">
                      {gamesNeedingStars.map((game: any) => (
                        <div 
                          key={game.id}
                          className="dark:bg-card rounded-lg p-3 flex items-center justify-between pt-[4px] pb-[4px] bg-[#e2e2e2] dark:bg-[#212121]"
                          data-testid={`stars-game-${game.id}`}
                        >
                          <div className="flex items-center gap-3">
                            <Star className="w-5 h-5 text-yellow-500 fill-yellow-500" />
                            <div>
                              <p className="font-medium text-[#212121] dark:text-[#ffffff]">
                                {game.homeTeam?.name} vs {game.awayTeam?.name}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                {format(new Date(game.scheduledAt), 'MMM d, yyyy')}
                              </p>
                              <p className="text-sm font-medium text-[#212121] dark:text-[#ffffff]">
                                Your team won {game.homeScore > game.awayScore ? `${game.homeScore}-${game.awayScore}` : `${game.awayScore}-${game.homeScore}`}
                              </p>
                            </div>
                          </div>
                          <Button 
                            size="sm" 
                            className="hover:bg-yellow-700 text-white bg-[#3c83f6]"
                            onClick={() => {
                              onClose();
                              onNavigate(`/game/${game.id}`);
                            }}
                            data-testid={`button-award-stars-${game.id}`}
                          >
                            Award Stars
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Notifications Section */}
              {Array.isArray(notifications) && notifications.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Bell className="w-5 h-5 text-primary" />
                      <h3 className="text-lg font-semibold text-[#212121] dark:text-[#ffffff]">
                        Notifications ({notifications.length})
                      </h3>
                    </div>
                    {unreadNotificationCount > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs text-muted-foreground hover:text-foreground"
                        onClick={handleMarkAllRead}
                        data-testid="button-mark-all-read"
                      >
                        <Check className="w-3 h-3 mr-1" />
                        Mark all read
                      </Button>
                    )}
                  </div>
                  <div className="bg-[#e2e2e2] dark:bg-[#212121] rounded-lg p-4">
                    <div className="space-y-3">
                      {notifications.map((notification) => (
                        <div 
                          key={notification.id}
                          className={`bg-white dark:bg-card rounded-lg p-3 flex items-start gap-3 cursor-pointer hover:bg-muted/50 transition-colors relative group ${!notification.isRead ? 'border-l-4 border-primary' : 'border border-border'}`}
                          onClick={() => handleNotificationClick(notification)}
                          data-testid={`notification-item-${notification.id}`}
                        >
                          <div className="flex-shrink-0 mt-0.5">
                            {getNotificationIcon(notification.type)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className={`text-sm truncate ${!notification.isRead ? 'font-semibold text-foreground' : 'text-foreground'}`}>
                                {notification.title}
                              </p>
                              {!notification.isRead && (
                                <span className="w-2 h-2 bg-primary rounded-full flex-shrink-0" />
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                              {notification.message}
                            </p>
                            <p className="text-xs text-muted-foreground/70 mt-1">
                              {format(new Date(notification.createdAt), 'MMM d, h:mm a')}
                            </p>
                          </div>
                          <button
                            className="p-1 rounded"
                            onClick={(e) => {
                              e.stopPropagation();
                              dismissNotificationMutation.mutate(notification.id);
                            }}
                            data-testid={`button-dismiss-notification-${notification.id}`}
                          >
                            <X className="w-4 h-4 text-blue-500" strokeWidth={3} />
                          </button>
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
        <div className="p-6 border-t border-border pt-[4px] pb-[4px] mt-[4px] mb-[4px]">
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
    </div>,
    document.body
  );
}

// Standings Modal Component
function StandingsModal({ isOpen, onClose, leagueId, tournamentId }: { 
  isOpen: boolean; 
  onClose: () => void; 
  leagueId?: string | null; 
  tournamentId?: string | null;
}) {
  const { canAccessPremiumFeatures } = usePermissions();
  
  // Fetch league standings
  const { data: leagueStandings = [], isLoading: isLoadingLeague } = useQuery({
    queryKey: ['/api/leagues', leagueId, 'standings'],
    queryFn: async () => {
      if (!leagueId) return [];
      const response = await apiRequest('GET', `/api/leagues/${leagueId}/standings`);
      return response.json();
    },
    enabled: !!leagueId && isOpen,
  });
  
  // Fetch tournament teams for standings
  const { data: tournamentTeams = [], isLoading: isLoadingTournament } = useQuery({
    queryKey: ['/api/tournaments', tournamentId, 'teams'],
    queryFn: async () => {
      if (!tournamentId) return [];
      const response = await apiRequest('GET', `/api/tournaments/${tournamentId}/teams`);
      return response.json();
    },
    enabled: !!tournamentId && isOpen,
  });
  
  // Fetch tournament matches for calculating standings
  const { data: tournamentMatches = [] } = useQuery({
    queryKey: ['/api/tournaments', tournamentId, 'matches'],
    queryFn: async () => {
      if (!tournamentId) return [];
      const response = await apiRequest('GET', `/api/tournaments/${tournamentId}/matches`);
      return response.json();
    },
    enabled: !!tournamentId && isOpen,
  });
  
  // Calculate tournament standings from teams and matches
  const tournamentStandings = React.useMemo(() => {
    if (!tournamentId || !Array.isArray(tournamentTeams)) return [];
    
    const standings = tournamentTeams.map((team: any) => {
      let gamesPlayed = 0;
      let wins = 0;
      let losses = 0;
      let ties = 0;
      let shootoutLosses = 0;
      let goalsFor = 0;
      let goalsAgainst = 0;
      
      // Calculate stats from matches
      if (Array.isArray(tournamentMatches)) {
        tournamentMatches.forEach((match: any) => {
          if (match.team1Id === team.id || match.team2Id === team.id) {
            // Only count completed matches
            if (match.status === 'completed' && match.team1Score !== null && match.team2Score !== null) {
              gamesPlayed++;
              
              const isTeam1 = match.team1Id === team.id;
              const teamScore = isTeam1 ? match.team1Score : match.team2Score;
              const opponentScore = isTeam1 ? match.team2Score : match.team1Score;
              
              goalsFor += teamScore;
              goalsAgainst += opponentScore;
              
              if (teamScore > opponentScore) {
                wins++;
              } else if (teamScore < opponentScore) {
                losses++;
              } else {
                ties++;
              }
            }
          }
        });
      }
      
      const points = (wins * 2) + (ties * 1);
      
      return {
        teamId: team.id,
        teamName: team.teamName,
        gamesPlayed,
        wins,
        losses,
        ties,
        shootoutLosses,
        points,
        goalsFor,
        goalsAgainst
      };
    });
    
    // Sort by points (descending), then by goal differential
    return standings.sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      return (b.goalsFor - b.goalsAgainst) - (a.goalsFor - a.goalsAgainst);
    });
  }, [tournamentId, tournamentTeams, tournamentMatches]);
  
  const standings = tournamentId ? tournamentStandings : leagueStandings;
  const isLoading = tournamentId ? isLoadingTournament : isLoadingLeague;

  if (!isOpen) return null;

  return ReactDOM.createPortal(
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-card rounded-lg border border-border w-full max-w-md h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-border relative">
          <h2 className="text-2xl font-semibold text-center">
            {tournamentId ? 'Tournament Standings' : 'League Standings'}
          </h2>
          <button
            onClick={onClose}
            className="absolute top-6 right-6 w-10 h-10 bg-red-600 hover:bg-red-700 rounded flex items-center justify-center transition-colors"
            data-testid="button-close-standings"
          >
            <X className="w-5 h-5 text-white" />
          </button>
        </div>

        {/* Content */}
        <FeatureLockOverlay isLocked={false} className="flex-1 flex flex-col">
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
                    <th className="text-center p-3 font-semibold">OTL</th>
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
    </div>,
    document.body
  );
}

// Needs Attention Component for Score Verification
function NeedsAttentionTasks({ leagueId, onNavigate }: { 
  leagueId: string; 
  onNavigate: (path: string) => void; 
}) {
  // Fetch games that need score verification - parallelized for performance
  const { data: gamesNeedingVerification = [] } = useQuery({
    queryKey: ['/api/leagues', leagueId, 'games-needing-verification'],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/leagues/${leagueId}/games`);
      const allGames = await response.json();
      
      if (!Array.isArray(allGames)) return [];
      
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      // Filter past games first
      const pastGames = allGames.filter((game: any) => {
        const gameDate = new Date(game.scheduledAt);
        gameDate.setHours(0, 0, 0, 0);
        return gameDate < today;
      });
      
      // Fetch all score submissions in parallel
      const submissionResults = await Promise.all(
        pastGames.map(async (game: any) => {
          try {
            const submissionsResponse = await apiRequest('GET', `/api/games/${game.id}/score-submissions`);
            if (!submissionsResponse.ok) return { game, submissions: null };
            const submissions = await submissionsResponse.json();
            return { game, submissions: Array.isArray(submissions) ? submissions : null };
          } catch {
            return { game, submissions: null };
          }
        })
      );
      
      // Process results
      const gamesNeedingVerification = [];
      for (const { game, submissions } of submissionResults) {
        if (!submissions) continue;
        
        const submissionCount = submissions.length;
        let needsVerification = false;
        
        if (submissionCount === 0) {
          needsVerification = true;
        } else if (submissionCount === 1) {
          needsVerification = true;
        } else if (submissionCount === 2) {
          const [sub1, sub2] = submissions;
          if (sub1.homeScore !== sub2.homeScore || sub1.awayScore !== sub2.awayScore) {
            needsVerification = true;
          }
        }
        
        if (needsVerification) {
          gamesNeedingVerification.push(game);
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
  const { user: supabaseUser } = useAuth();
  const tier = (supabaseUser as any)?.role || 'free_tier';
  const { canAccessPremiumFeatures, hasStatManagerAccess } = usePermissions();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  // Fetch full user profile (includes profileImageUrl, firstName, etc.)
  const { data: userProfile } = useQuery({
    queryKey: ['/api/user'],
    enabled: !!supabaseUser,
  });
  
  // Unified selection state - can be team, league, or tournament (with localStorage persistence)
  const [selectedType, setSelectedType] = useState<'team' | 'league' | 'tournament'>(() => {
    const saved = localStorage.getItem('dashboardSelectedType');
    return (saved === 'team' || saved === 'league' || saved === 'tournament') ? saved : 'league';
  });
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    return localStorage.getItem('dashboardSelectedId') || null;
  });
  const [showDropdown, setShowDropdown] = useState(false);
  const [showHamburgerMenu, setShowHamburgerMenu] = useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);
  
  // Save selection to localStorage whenever it changes
  React.useEffect(() => {
    if (selectedType) {
      localStorage.setItem('dashboardSelectedType', selectedType);
    }
    if (selectedId) {
      localStorage.setItem('dashboardSelectedId', selectedId);
    } else {
      localStorage.removeItem('dashboardSelectedId');
    }
    // Notify other components in the same tab about the selection change
    notifyDashboardSelectionChange();
  }, [selectedType, selectedId]);
  
  // Backward compatibility
  const selectedLeagueId = selectedType === 'league' ? selectedId : null;
  const setSelectedLeagueId = (id: string | null) => {
    setSelectedType('league');
    setSelectedId(id);
  };
  
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
  
  // Add event dialog state
  const [showAddEventDialog, setShowAddEventDialog] = useState(false);
  const [eventType, setEventType] = useState<'reminder' | 'game' | null>(null);
  
  // Reminder form
  const reminderForm = useForm<z.infer<typeof personalReminderSchema>>({
    resolver: zodResolver(personalReminderSchema),
    defaultValues: {
      title: "",
      description: "",
      scheduledAt: "",
    },
  });

  // Game form
  const gameForm = useForm<z.infer<typeof teamGameSchema>>({
    resolver: zodResolver(teamGameSchema),
    defaultValues: {
      teamId: "",
      opponentName: "",
      scheduledAt: "",
      venue: "",
      notes: "",
    },
  });

  // Create personal reminder mutation
  const createReminderMutation = useMutation({
    mutationFn: async (data: z.infer<typeof personalReminderSchema>) => {
      // Send datetime-local string directly without timezone conversion
      await apiRequest("POST", "/api/personal-reminders", {
        ...data,
        scheduledAt: data.scheduledAt,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/personal-reminders"] });
      toast({
        title: "Reminder Created",
        description: "Your personal reminder has been added to your calendar.",
      });
      setEventType(null);
      reminderForm.reset();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create reminder. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Delete personal reminder mutation
  const deleteReminderMutation = useMutation({
    mutationFn: async (reminderId: string) => {
      await apiRequest("DELETE", `/api/personal-reminders/${reminderId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/personal-reminders"] });
      toast({
        title: "Reminder Dismissed",
        description: "Your reminder has been removed from your calendar.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to dismiss reminder. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Create team game mutation
  const createGameMutation = useMutation({
    mutationFn: async (data: z.infer<typeof teamGameSchema>) => {
      // Send datetime-local string directly without timezone conversion
      await apiRequest("POST", "/api/games", {
        homeTeamId: data.teamId,
        awayTeamId: null,
        opponentName: data.opponentName,
        scheduledAt: data.scheduledAt,
        venue: data.venue || null,
        notes: data.notes || null,
        leagueId: null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/games/upcoming"] });
      toast({
        title: "Game Created",
        description: "Your game has been added to the schedule.",
      });
      setEventType(null);
      gameForm.reset();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create game. Please try again.",
        variant: "destructive",
      });
    },
  });
  
  const { data: upcomingGames, isLoading: gamesLoading } = useQuery({
    queryKey: ['/api/user/games/upcoming'],
    staleTime: 30000,
    select: (games) => {
      if (!Array.isArray(games)) return games;
      
      // Filter by team if team is selected
      if (selectedType === 'team' && selectedId) {
        return games.filter(game => 
          game.homeTeamId === selectedId || 
          game.awayTeamId === selectedId ||
          game.isSubstitute === true // Always show substitute games regardless of selected team
        );
      }
      
      // Filter by league if league is selected
      if (selectedType === 'league' && selectedLeagueId) {
        return games.filter(game => 
          game.homeTeam?.leagueId === selectedLeagueId || 
          game.awayTeam?.leagueId === selectedLeagueId ||
          game.isSubstitute === true // Always show substitute games regardless of selected league
        );
      }
      
      // Filter by tournament if tournament is selected
      if (selectedType === 'tournament' && selectedId) {
        return games.filter(game => 
          game.tournamentId === selectedId
        );
      }
      
      return games;
    }
  });

  // Fetch duty assignments for upcoming games
  const { data: dutyAssignments = [] } = useQuery({
    queryKey: ['/api/duty-assignments', upcomingGames],
    queryFn: async () => {
      if (!Array.isArray(upcomingGames) || upcomingGames.length === 0) return [];
      
      // Fetch duty assignments for each game
      const assignmentPromises = upcomingGames.map(async (game: any) => {
        try {
          const response = await apiRequest('GET', `/api/games/${game.id}/duties`);
          const assignments = await response.json();
          return { gameId: game.id, assignments: assignments || [] };
        } catch (error) {
          console.error(`Failed to fetch duties for game ${game.id}:`, error);
          return { gameId: game.id, assignments: [] };
        }
      });
      
      const results = await Promise.all(assignmentPromises);
      return results;
    },
    enabled: !!upcomingGames && Array.isArray(upcomingGames) && upcomingGames.length > 0,
  });

  const { data: scrimmageInvites, isLoading: invitesLoading } = useQuery({
    queryKey: ['/api/users/scrimmage-invites'],
    staleTime: 30000,
    select: (invites) => {
      if (!Array.isArray(invites)) return invites;
      
      // Tournaments don't have scrimmages, return empty
      if (selectedType === 'tournament') {
        return [];
      }
      
      // Filter by league if league is selected
      if (selectedType === 'league' && selectedLeagueId) {
        return invites.filter((invite: any) => invite.leagueId === selectedLeagueId);
      }
      
      // Scrimmages are league-level, so when a team is selected, show all scrimmages
      return invites;
    }
  });

  // Fetch user's scrimmage requests (to find approved ones they're participating in)
  const { data: scrimmageRequests = [], isLoading: requestsLoading } = useQuery({
    queryKey: ['/api/users/scrimmage-requests'],
    staleTime: 30000,
    select: (requests) => {
      if (!Array.isArray(requests)) return [];
      
      // Tournaments don't have scrimmages, return empty
      if (selectedType === 'tournament') {
        return [];
      }
      
      // Filter by league if league is selected
      if (selectedType === 'league' && selectedLeagueId) {
        return requests.filter((request: any) => request.scrimmage?.leagueId === selectedLeagueId);
      }
      
      // Scrimmages are league-level, so when a team is selected, show all scrimmages
      // (they don't have a teamId - they belong to the league)
      return requests;
    }
  });

  // Fetch user's personal reminders
  const { data: personalReminders = [], isLoading: remindersLoading } = useQuery({
    queryKey: ['/api/user/personal-reminders'],
    staleTime: 30000,
  });

  const { data: userTeams } = useQuery({
    queryKey: ['/api/user/teams'],
    select: (teams) => {
      if (!Array.isArray(teams)) return teams;
      
      // Tournaments don't use regular league teams, return empty
      if (selectedType === 'tournament') {
        return [];
      }
      
      // Filter by team if team is selected (show only selected team)
      if (selectedType === 'team' && selectedId) {
        return teams.filter(team => team.id === selectedId);
      }
      
      // Filter by league if league is selected
      if (selectedType === 'league' && selectedLeagueId) {
        return teams.filter(team => team.leagueId === selectedLeagueId);
      }
      
      return teams;
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
  
  // Fetch user's paid tournaments
  const { data: userPaidTournaments } = useQuery({
    queryKey: ['/api/user/paid-tournaments'],
  });
  
  // Fetch notification counts for all leagues and tournaments
  const { data: notificationCounts } = useQuery<{
    leagues: Record<string, number>;
    tournaments: Record<string, number>;
  }>({
    queryKey: ['/api/user/notification-counts'],
    enabled: !!supabaseUser, // Only fetch when user is authenticated
    refetchInterval: 30000, // Refetch every 30 seconds
  });
  
  // Filter leagues to only show those where user has no team
  const leaguesWithoutTeams = React.useMemo(() => {
    if (!Array.isArray(userLeagues) || !Array.isArray(userTeamsAll)) {
      return [];
    }
    
    return userLeagues.filter(league => {
      // Check if user has any team in this league
      const hasTeamInLeague = userTeamsAll.some(team => team.leagueId === league.id);
      return !hasTeamInLeague;
    });
  }, [userLeagues, userTeamsAll]);
  
  // Set default selection - prefer team first, then league, then tournament
  // Also validate that saved selection still exists
  React.useEffect(() => {
    // Wait for data to load before validating or setting defaults
    if (userTeamsAll === undefined || userLeagues === undefined || userPaidTournaments === undefined) {
      return;
    }
    
    // Validate saved selection
    if (selectedId && selectedType === 'team') {
      const teamExists = Array.isArray(userTeamsAll) && userTeamsAll.some(team => team.id === selectedId);
      if (!teamExists) {
        // Saved team no longer exists, reset
        setSelectedId(null);
        return;
      }
    }
    
    if (selectedId && selectedType === 'league') {
      // Check if league exists in ALL user leagues (not just leaguesWithoutTeams)
      const leagueExists = Array.isArray(userLeagues) && userLeagues.some(league => league.id === selectedId);
      if (!leagueExists) {
        // Saved league no longer exists, reset
        setSelectedId(null);
        return;
      }
    }
    
    if (selectedId && selectedType === 'tournament') {
      const tournamentExists = Array.isArray(userPaidTournaments) && userPaidTournaments.some(t => t.id === selectedId);
      if (!tournamentExists) {
        // Saved tournament no longer exists, reset
        setSelectedId(null);
        return;
      }
      // Valid tournament selection - respect user's choice and don't auto-switch
      return;
    }
    
    // Set default selection if none exists
    if (!selectedId) {
      // First try to select a team
      if (Array.isArray(userTeamsAll) && userTeamsAll.length > 0) {
        setSelectedType('team');
        setSelectedId(userTeamsAll[0].id);
      }
      // Otherwise select a league (only those without teams)
      else if (Array.isArray(leaguesWithoutTeams) && leaguesWithoutTeams.length > 0) {
        setSelectedType('league');
        setSelectedId(leaguesWithoutTeams[0].id);
      }
      // Otherwise select a paid tournament (as a last resort)
      else if (Array.isArray(userPaidTournaments) && userPaidTournaments.length > 0) {
        setSelectedType('tournament');
        setSelectedId(userPaidTournaments[0].id);
      }
    }
  }, [userTeamsAll, leaguesWithoutTeams, userPaidTournaments, selectedId, selectedType]);
  
  // Close dropdown when clicking outside
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };

    if (showDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showDropdown]);
  
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
  
  // Get the currently selected team (for checking its league association)
  const selectedTeam = React.useMemo(() => {
    if (selectedType === 'team' && selectedId && Array.isArray(userTeamsAll)) {
      return userTeamsAll.find(t => t.id === selectedId);
    }
    return null;
  }, [selectedType, selectedId, userTeamsAll]);
  
  // Helper function to get team display name
  const getTeamDisplayName = React.useCallback((team: any) => {
    if (!team) return 'Select Team';
    
    // If team is not in a league, just show team name
    if (!team.leagueId) {
      return team.name;
    }
    
    // If team is in a league, show "LeagueName: TeamName"
    const league = Array.isArray(userLeagues) 
      ? userLeagues.find(l => l.id === team.leagueId) 
      : null;
    
    if (league) {
      return `${league.name}: ${team.name}`;
    }
    
    // Fallback if league not found (shouldn't happen)
    return team.name;
  }, [userLeagues]);
  
  // Helper function to get league display name
  const getLeagueDisplayName = React.useCallback((league: any) => {
    if (!league) return 'Select League';
    return league.name;
  }, []);
  
  // Helper function to get tournament display name
  const getTournamentDisplayName = React.useCallback((tournament: any) => {
    if (!tournament) return 'Select Tournament';
    // Show team name if assigned
    if (tournament.teamName) {
      return `${tournament.name}: ${tournament.teamName}`;
    }
    return tournament.name;
  }, []);
  
  // Get the currently selected tournament
  const selectedTournament = React.useMemo(() => {
    if (selectedType === 'tournament' && selectedId && Array.isArray(userPaidTournaments)) {
      return userPaidTournaments.find(t => t.id === selectedId);
    }
    return null;
  }, [selectedType, selectedId, userPaidTournaments]);
  
  // Get the tournament team ID for the selected tournament
  const selectedTournamentTeamId = React.useMemo(() => {
    return selectedTournament?.tournamentTeamId || null;
  }, [selectedTournament]);
  
  // Determine the effective league ID for feature access
  // If a team is selected and it's part of a league, use that league ID
  // If a league is selected, use the selected league ID
  const effectiveLeagueId = React.useMemo(() => {
    if (selectedType === 'team' && selectedTeam?.leagueId) {
      return selectedTeam.leagueId;
    }
    if (selectedType === 'league' && selectedLeagueId) {
      return selectedLeagueId;
    }
    return null;
  }, [selectedType, selectedTeam, selectedLeagueId]);
  
  // Compute captain status for the selected league using team.captainId
  const isTeamCaptainInSelectedLeague = React.useMemo(() => {
    if (!selectedLeagueId || !Array.isArray(userTeams) || !(userProfile as any)?.id) return false;
    return userTeams.some(team => team.captainId === (userProfile as any).id);
  }, [selectedLeagueId, userTeams, (userProfile as any)?.id]);
  
  // Helper to compute captain status for any league (for dropdown badges)
  const isCaptainInLeague = React.useCallback((leagueId: string) => {
    if (!Array.isArray(userTeamsAll) || !(userProfile as any)?.id) return false;
    return userTeamsAll.some(team => team.leagueId === leagueId && team.captainId === (userProfile as any).id);
  }, [userTeamsAll, (userProfile as any)?.id]);

  // Check if user can schedule games (must be captain of any team OR commissioner of any league)
  const canScheduleGames = React.useMemo(() => {
    const userId = (userProfile as any)?.id;
    if (!userId) return false;
    
    // Check if user is captain of any team
    const isCaptain = Array.isArray(userTeamsAll) && userTeamsAll.some(team => team.captainId === userId);
    
    // Check if user is commissioner of any league
    const isCommissioner = Array.isArray(userLeagues) && userLeagues.some((league: any) => league.commissionerId === userId);
    
    return isCaptain || isCommissioner;
  }, [userTeamsAll, userLeagues, (userProfile as any)?.id]);

  // Fetch standings for the primary team's league to get accurate record
  const primaryTeamLeagueId = React.useMemo(() => {
    return primaryTeam?.leagueId || null;
  }, [primaryTeam?.leagueId]);

  const { data: standingsData } = useQuery({
    queryKey: ['/api/leagues', primaryTeamLeagueId, 'standings'],
    queryFn: async () => {
      if (!primaryTeamLeagueId) return [];
      const response = await apiRequest('GET', `/api/leagues/${primaryTeamLeagueId}/standings`);
      return response.json();
    },
    enabled: !!primaryTeamLeagueId,
  });

  // Calculate games remaining from upcomingGames
  const teamRecord = React.useMemo(() => {
    if (!primaryTeam?.id) {
      return null;
    }
    
    // Calculate games remaining by counting future games for this team
    const now = new Date();
    const futureGames = Array.isArray(upcomingGames) 
      ? upcomingGames.filter((game: any) => {
          // Check if this game involves the primary team
          const isPrimaryTeamGame = game.homeTeamId === primaryTeam.id || game.awayTeamId === primaryTeam.id;
          // Check if it's in the future
          const isFuture = new Date(game.scheduledAt) > now;
          return isPrimaryTeamGame && isFuture;
        })
      : [];
    const gamesRemaining = futureGames.length;
    
    // Try to get standings data if available
    const standingsRecord = Array.isArray(standingsData) 
      ? standingsData.find((team: any) => team.teamId === primaryTeam.id)
      : null;
    
    return {
      ...(standingsRecord || {}),
      gamesRemaining: gamesRemaining,
    };
  }, [primaryTeam?.id, standingsData, upcomingGames]);


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

  // Fetch needs attention data for the permanent bar - parallelized for performance
  const { data: needsAttentionData, isLoading: isLoadingNeedsAttention } = useQuery({
    queryKey: ['/api/needs-attention-summary', effectiveLeagueId],
    staleTime: 30000,
    queryFn: async () => {
      if (!effectiveLeagueId) return { pendingMembers: 0, gamesNeedingVerification: 0, notifications: 0, total: 0 };
      
      try {
        // Fetch all top-level data in parallel (including notifications)
        const [pendingMembersResponse, gamesResponse, substituteApprovalsResponse, starsResponse, notificationsResponse] = await Promise.all([
          apiRequest('GET', `/api/leagues/${effectiveLeagueId}/pending-members`),
          apiRequest('GET', `/api/leagues/${effectiveLeagueId}/games`),
          apiRequest('GET', `/api/substitute-requests/pending-approvals?leagueId=${effectiveLeagueId}`).catch(() => null),
          apiRequest('GET', `/api/user/games-needing-stars?leagueId=${effectiveLeagueId}`).catch(() => null),
          apiRequest('GET', `/api/notifications`).catch(() => null)
        ]);
        
        const pendingMembers = await pendingMembersResponse.json();
        const allGames = await gamesResponse.json();
        const substituteData = substituteApprovalsResponse ? await substituteApprovalsResponse.json().catch(() => ({ total: 0 })) : { total: 0 };
        const starsData = starsResponse ? await starsResponse.json().catch(() => []) : [];
        const notificationsData = notificationsResponse ? await notificationsResponse.json().catch(() => []) : [];
        
        let gamesNeedingVerification = 0;
        if (Array.isArray(allGames)) {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          
          // Filter past games first
          const pastGames = allGames.filter((game: any) => {
            const gameDate = new Date(game.scheduledAt);
            gameDate.setHours(0, 0, 0, 0);
            return gameDate < today;
          });
          
          // Fetch all score submissions in parallel
          const submissionResults = await Promise.all(
            pastGames.map(async (game: any) => {
              try {
                const submissionsResponse = await apiRequest('GET', `/api/games/${game.id}/score-submissions`);
                if (!submissionsResponse.ok) return null;
                const submissions = await submissionsResponse.json();
                return Array.isArray(submissions) ? submissions : null;
              } catch {
                return null;
              }
            })
          );
          
          // Count games needing verification
          for (const submissions of submissionResults) {
            if (!submissions) continue;
            
            const submissionCount = submissions.length;
            let needsVerification = false;
            
            const hasCommissionerSubmission = submissions.some((sub: any) => 
              sub.submitterRole === 'commissioner' || sub.isCommissionerOverride === true
            );
            
            if (hasCommissionerSubmission) {
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
          }
        }
        
        const pendingMembersCount = Array.isArray(pendingMembers) ? pendingMembers.length : 0;
        const pendingSubstituteApprovals = substituteData.total || 0;
        const gamesNeedingStars = Array.isArray(starsData) ? starsData.length : 0;
        const notificationsCount = Array.isArray(notificationsData) ? notificationsData.length : 0;
        const total = pendingMembersCount + gamesNeedingVerification + pendingSubstituteApprovals + gamesNeedingStars + notificationsCount;
        
        return {
          pendingMembers: pendingMembersCount,
          gamesNeedingVerification,
          pendingSubstituteApprovals,
          gamesNeedingStars,
          notifications: notificationsCount,
          total
        };
      } catch (error) {
        return { pendingMembers: 0, gamesNeedingVerification: 0, pendingSubstituteApprovals: 0, gamesNeedingStars: 0, notifications: 0, total: 0 };
      }
    },
    enabled: !!effectiveLeagueId,
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  return (
    <div className="min-h-screen flex flex-col" data-testid="dashboard-page">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-background p-3 flex items-center mb-[12px] pl-[16px] pr-[16px] pt-[4px] pb-[4px]">
        <div className="flex items-center justify-between w-full mt-[4px] mb-[4px] pt-[8px] pb-[8px]">
          <div className="flex items-center gap-2">
            <img 
              src={logoUrl}
              alt="Roster Logo" 
              className="h-[30px] w-auto pt-[0px] pb-[0px] pl-[12px] pr-[12px] invert dark:invert-0"
              data-testid="img-roster-logo"
            />
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={() => navigate('/profile')}
              className="w-[48px] h-[48px] rounded-full flex items-center justify-center overflow-hidden bg-primary"
              data-testid="button-profile"
            >
              {(userProfile as any)?.profileImageUrl ? (
                <img 
                  src={getImageUrl((userProfile as any).profileImageUrl) || ''} 
                  alt="Profile"
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-primary-foreground text-lg font-semibold">
                  {(userProfile as any)?.firstName?.[0] || 'U'}
                </span>
              )}
            </button>
            <button
              onClick={() => setShowHamburgerMenu(true)}
              className="w-8 h-8 flex items-center justify-center hover:bg-card/50 rounded-lg transition-colors"
              data-testid="button-hamburger-menu"
            >
              <Menu className="w-8 h-8 text-foreground" />
            </button>
            <SlideOutMenu open={showHamburgerMenu} onOpenChange={setShowHamburgerMenu} />
          </div>
        </div>
      </div>
      {/* Team/League/Tournament Selection Dropdown */}
      {((Array.isArray(userTeamsAll) && userTeamsAll.length > 0) || (Array.isArray(leaguesWithoutTeams) && leaguesWithoutTeams.length > 0) || (Array.isArray(userPaidTournaments) && userPaidTournaments.length > 0)) && (
        <div className="px-6 mb-4">
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setShowDropdown(!showDropdown)}
              className="w-full border border-border rounded-lg p-3 flex items-center justify-between hover:bg-muted/50 transition-colors bg-[#e2e2e2] dark:bg-[#212121] pt-[8px] pb-[8px] pl-[4px] pr-[4px]"
              data-testid="button-selector"
            >
              <div className="flex items-center gap-2">
                {selectedType === 'team' ? (
                  <Users className="w-4 h-4 text-primary" />
                ) : selectedType === 'tournament' ? (
                  <Trophy className="w-4 h-4 text-orange-500" />
                ) : (
                  <Trophy className="w-4 h-4 text-primary" />
                )}
                <span className="font-medium pl-[8px] pr-[8px] text-[12px]">
                  {selectedType === 'team' 
                    ? getTeamDisplayName((userTeamsAll as any[])?.find((t: any) => t.id === selectedId))
                    : selectedType === 'tournament'
                    ? getTournamentDisplayName(selectedTournament)
                    : getLeagueDisplayName(selectedLeague)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs mr-1 text-[#3c83f6] font-bold">Select Team</span>
                {/* Total notification count for ALL other teams/leagues/tournaments */}
                {(() => {
                  if (!notificationCounts) return null;
                  
                  let totalNotifications = 0;
                  
                  // Count notifications from other teams (via their league)
                  if (Array.isArray(userTeamsAll)) {
                    userTeamsAll.forEach((team: any) => {
                      // Skip the currently selected team
                      if (selectedType === 'team' && selectedId === team.id) return;
                      
                      // Get the league ID for this team and check notifications
                      const leagueId = team.leagueId;
                      if (leagueId && notificationCounts.leagues[leagueId]) {
                        totalNotifications += notificationCounts.leagues[leagueId];
                      }
                    });
                  }
                  
                  // Count notifications from leagues (without teams)
                  if (Array.isArray(leaguesWithoutTeams)) {
                    leaguesWithoutTeams.forEach((league: any) => {
                      // Skip the currently selected league
                      if (selectedType === 'league' && selectedId === league.id) return;
                      
                      if (notificationCounts.leagues[league.id]) {
                        totalNotifications += notificationCounts.leagues[league.id];
                      }
                    });
                  }
                  
                  // Count notifications from tournaments
                  if (Array.isArray(userPaidTournaments)) {
                    userPaidTournaments.forEach((tournament: any) => {
                      // Skip the currently selected tournament
                      if (selectedType === 'tournament' && selectedId === tournament.id) return;
                      
                      if (notificationCounts.tournaments[tournament.id]) {
                        totalNotifications += notificationCounts.tournaments[tournament.id];
                      }
                    });
                  }
                  
                  return totalNotifications > 0 ? <NotificationBadge count={totalNotifications} /> : null;
                })()}
                <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${showDropdown ? 'rotate-180' : ''}`} />
              </div>
            </button>
            
            {showDropdown && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg z-50 max-h-[400px] overflow-y-auto">
                {/* Teams Section */}
                {Array.isArray(userTeamsAll) && userTeamsAll.length > 0 && (
                  <>
                    <div className="px-3 py-2 text-xs font-semibold text-muted-foreground bg-muted/30">
                      MY TEAMS
                    </div>
                    {userTeamsAll.map((team: any) => {
                      // Get notification count for this team's league
                      const teamNotificationCount = team.leagueId && notificationCounts?.leagues[team.leagueId] || 0;
                      
                      return (
                        <button
                          key={`team-${team.id}`}
                          onClick={() => {
                            setSelectedType('team');
                            setSelectedId(team.id);
                            setShowDropdown(false);
                          }}
                          className={`w-full p-3 text-left hover:bg-muted/50 transition-colors ${
                            selectedType === 'team' && selectedId === team.id ? 'bg-primary/10 text-primary' : ''
                          }`}
                          data-testid={`option-team-${team.id}`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Users className="w-4 h-4" />
                              <span className="font-medium text-sm">{getTeamDisplayName(team)}</span>
                            </div>
                            {teamNotificationCount > 0 && (
                              <NotificationBadge count={teamNotificationCount} />
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </>
                )}
                
                {/* Leagues Section - Only show leagues where user has no team */}
                {Array.isArray(leaguesWithoutTeams) && leaguesWithoutTeams.length > 0 && (
                  <>
                    <div className="px-3 py-2 text-xs font-semibold text-muted-foreground bg-muted/30 border-t border-border">
                      MY LEAGUES
                    </div>
                    {leaguesWithoutTeams.map((league: any) => {
                      const leagueNotificationCount = notificationCounts?.leagues[league.id] || 0;
                      
                      return (
                        <button
                          key={`league-${league.id}`}
                          onClick={() => {
                            setSelectedType('league');
                            setSelectedId(league.id);
                            setShowDropdown(false);
                          }}
                          className={`w-full p-3 text-left hover:bg-muted/50 transition-colors ${
                            selectedType === 'league' && selectedId === league.id ? 'bg-primary/10 text-primary' : ''
                          }`}
                          data-testid={`option-league-${league.id}`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Trophy className="w-4 h-4" />
                              <span className="font-medium text-sm">{getLeagueDisplayName(league)}</span>
                            </div>
                            {leagueNotificationCount > 0 && (
                              <NotificationBadge count={leagueNotificationCount} />
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </>
                )}
                
                {/* Tournaments Section - Show paid tournaments */}
                {Array.isArray(userPaidTournaments) && userPaidTournaments.length > 0 && (
                  <>
                    <div className="px-3 py-2 text-xs font-semibold text-muted-foreground bg-muted/30 border-t border-border">
                      MY TOURNAMENTS
                    </div>
                    {userPaidTournaments.map((tournament: any) => {
                      const tournamentNotificationCount = notificationCounts?.tournaments[tournament.id] || 0;
                      
                      return (
                        <button
                          key={`tournament-${tournament.id}`}
                          onClick={() => {
                            setSelectedType('tournament');
                            setSelectedId(tournament.id);
                            setShowDropdown(false);
                          }}
                          className={`w-full p-3 text-left hover:bg-muted/50 transition-colors last:rounded-b-lg ${
                            selectedType === 'tournament' && selectedId === tournament.id ? 'bg-primary/10 text-primary' : ''
                          }`}
                          data-testid={`option-tournament-${tournament.id}`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Trophy className="w-4 h-4 text-orange-500" />
                              <span className="font-medium text-sm">{getTournamentDisplayName(tournament)}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              {tournamentNotificationCount > 0 && (
                                <NotificationBadge count={tournamentNotificationCount} />
                              )}
                              {tournament.uniqueTournamentId && (
                                <span className="text-xs text-muted-foreground">{tournament.uniqueTournamentId}</span>
                              )}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
      {/* 4-Card Section */}
      <div className="px-6 mb-6">
        <div className="grid grid-cols-4 gap-3">
          {/* Announcements Card */}
          <div 
            className="rounded-xl border border-border p-5 min-h-[72px] relative cursor-pointer hover:bg-muted/50 transition-colors bg-[#e2e2e2] dark:bg-[#212121]"
            data-testid="card-announcements"
            onClick={() => navigate('/announcements')}
          >
            <div className="h-full flex flex-col items-center justify-center">
              <Megaphone className="w-8 h-8 text-blue-500 mb-3" />
              <p className="text-xs font-medium">News</p>
            </div>
            {selectedType === 'tournament' && selectedId ? (
              <AnnouncementBadge tournamentId={selectedId} />
            ) : (
              effectiveLeagueId && <AnnouncementBadge leagueId={effectiveLeagueId} />
            )}
          </div>

          {/* Photos Card - Always clickable, paywall shown on MediaGalleryPage if needed */}
          <div 
            className="rounded-xl border border-border p-5 min-h-[72px] cursor-pointer hover:bg-muted/50 transition-colors bg-[#e2e2e2] dark:bg-[#212121]" 
            data-testid="card-photos"
            onClick={() => {
              if (selectedType === 'tournament' && selectedId) {
                navigate(`/media/tournament/${selectedId}`);
              } else if (effectiveLeagueId) {
                // Prioritize league photos when in a league context (even if a team is selected)
                navigate(`/media/league/${effectiveLeagueId}`);
              } else if (selectedType === 'team' && selectedId) {
                // Only go to team photos if there's no league context
                navigate(`/media/team/${selectedId}`);
              }
            }}
          >
            <div className="h-full flex flex-col items-center justify-center">
              <Camera className="w-8 h-8 text-blue-500 mb-3" />
              <p className="text-xs font-medium">Photos</p>
            </div>
          </div>

          {/* Stats Card */}
          <div 
            className="rounded-xl border border-border p-5 min-h-[72px] cursor-pointer hover:bg-muted/50 transition-colors bg-[#e2e2e2] dark:bg-[#212121]"
            data-testid="card-stats"
            onClick={() => {
              navigate('/stats');
            }}
          >
            <div className="h-full flex flex-col items-center justify-center">
              <BarChart3 className="w-8 h-8 text-blue-500 mb-3" />
              <p className="text-xs font-medium">Stats</p>
            </div>
          </div>

          {/* Standings Card */}
          <div 
            className="rounded-xl border border-border p-5 min-h-[72px] cursor-pointer hover:bg-muted/50 transition-colors bg-[#e2e2e2] dark:bg-[#212121]"
            data-testid="card-standings"
            onClick={() => {
              setShowStandingsModal(true);
            }}
          >
            <div className="h-full flex flex-col items-center justify-center">
              <Award className="w-8 h-8 text-blue-500 mb-3" />
              <p className="text-xs font-medium">Standings</p>
            </div>
          </div>
        </div>
      </div>
      {/* Tournament-focused section when tournament is selected */}
      {selectedType === 'tournament' && selectedTournament && !primaryTeam && (
        <div className="px-6 mb-6">
          <div className="rounded-xl border border-border p-4 bg-[#e2e2e2] dark:bg-[#212121]">
            <div className="flex items-center gap-3 mb-3">
              <Trophy className="w-8 h-8 text-orange-500" />
              <div>
                <h3 className="font-semibold">{selectedTournament.name}</h3>
                <p className="text-xs text-muted-foreground">Tournament ID: {selectedTournament.uniqueTournamentId}</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mb-3">
              View the tournament bracket, manage teams, and track scores on the tournament detail page.
            </p>
            <Button 
              onClick={() => navigate(`/tournaments/${selectedTournament.id}`)}
              className="w-full bg-orange-500 hover:bg-orange-600"
              data-testid="button-view-bracket"
            >
              View Bracket
            </Button>
          </div>
        </div>
      )}
      {/* Quick Stats */}
      {primaryTeam && (
        <div className="px-6 mb-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-xl border border-border p-4 pt-[2px] pb-[2px] pl-[10px] pr-[10px] bg-[#e2e2e2] dark:bg-[#212121]" data-testid="card-games-stat">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
                  {primaryTeam?.logoUrl ? (
                    <img 
                      src={getImageUrl(primaryTeam.logoUrl) || ''} 
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
            
            {effectiveLeagueId && (
              <div className="rounded-xl border border-border bg-[#e2e2e2] dark:bg-[#212121]">
                {isLoadingNeedsAttention ? (
                  <div className="w-full h-full flex items-center justify-between rounded-xl px-3 py-2">
                    <div className="flex items-center gap-3">
                      <Bell className="w-4 h-4 text-[#212121] dark:text-white" />
                      <span className="font-medium text-sm text-[#212121] dark:text-white">Alerts</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 bg-gray-400 dark:bg-gray-700 rounded-full animate-pulse"></div>
                      <ChevronDown className="w-4 h-4 text-[#212121] dark:text-white" />
                    </div>
                  </div>
                ) : needsAttentionData ? (
                  <button
                    onClick={() => setShowNeedsAttentionModal(true)}
                    className="w-full h-full flex items-center justify-between rounded-xl px-3 py-2"
                    data-testid="button-needs-attention-permanent"
                  >
                    <div className="flex items-center gap-3">
                      <Bell className="w-4 h-4 text-[#212121] dark:text-white" />
                      <span className="font-medium text-sm text-[#212121] dark:text-white">Alerts</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 bg-red-500 rounded-full flex items-center justify-center">
                        <span className="text-white text-xs font-bold">{needsAttentionData.total}</span>
                      </div>
                      <ChevronDown className="w-4 h-4 text-[#212121] dark:text-white" />
                    </div>
                  </button>
                ) : null}
              </div>
            )}
          </div>
        </div>
      )}
      {/* Scorekeeper Link Box - Show for users with scorekeeper access but no team */}
      {!primaryTeam && hasStatManagerAccess() && (
        <div className="px-6 mb-6">
          <div className="rounded-xl border border-border bg-[#e2e2e2] dark:bg-[#212121]">
            <button
              onClick={() => navigate('/scorekeeper')}
              className="w-full h-full flex items-center justify-between rounded-xl px-4 py-3"
              data-testid="button-scorekeeper-link"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-red-500 rounded-lg flex items-center justify-center">
                  <Clipboard className="w-5 h-5 text-white" />
                </div>
                <div className="text-left">
                  <span className="font-medium text-sm text-[#212121] dark:text-white block">Scorekeeper Dashboard</span>
                  <span className="text-xs text-muted-foreground">Manage game scores</span>
                </div>
              </div>
              <ChevronDown className="w-4 h-4 text-[#212121] dark:text-white rotate-[-90deg]" />
            </button>
          </div>
        </div>
      )}
      {/* Needs Attention Section - Show for leagues and league teams */}
      {effectiveLeagueId && (
        <NeedsAttentionTasks 
          leagueId={effectiveLeagueId} 
          onNavigate={navigate}
        />
      )}
      {/* Upcoming Games */}
      <div className="px-6 mt-[8px] mb-[8px]">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold" data-testid="text-schedule-title">Schedule</h2>
            <Button
              onClick={() => setShowAddEventDialog(true)}
              className="w-[25.6px] h-[25.6px] p-0 bg-blue-500 hover:bg-blue-600 text-white rounded-full"
              data-testid="button-add-event"
            >
              <Plus className="w-[12.8px] h-[12.8px]" />
            </Button>
          </div>
          <button 
            onClick={() => navigate('/calendar')}
            className="text-primary text-sm"
            data-testid="button-view-all-games"
          >
            View All
          </button>
        </div>
        
        {gamesLoading || invitesLoading || requestsLoading || remindersLoading ? (
          <div className="bg-card rounded-xl border border-border p-4 animate-pulse" data-testid="loading-upcoming-games">
            <div className="h-16 bg-muted rounded"></div>
          </div>
        ) : (() => {
          // Helper to check if a date is today or in the future (comparing local dates, not timestamps)
          // Games should remain visible until the day AFTER they are scheduled
          const isYesterdayOrLater = (dateStr: string) => {
            const eventDate = new Date(dateStr);
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            yesterday.setHours(0, 0, 0, 0);
            const eventDateOnly = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate());
            return eventDateOnly >= yesterday;
          };
          return (Array.isArray(upcomingGames) && upcomingGames.filter((g: any) => isYesterdayOrLater(g.scheduledAt)).length > 0) || (Array.isArray(scrimmageInvites) && scrimmageInvites.filter((i: any) => isYesterdayOrLater(i.dateTime)).length > 0) || (Array.isArray(scrimmageRequests) && scrimmageRequests.filter((r: any) => r.status === 'approved' && r.scrimmage && isYesterdayOrLater(r.scrimmage.dateTime)).length > 0) || (Array.isArray(personalReminders) && personalReminders.filter((r: any) => !r.isCompleted && isYesterdayOrLater(r.scheduledAt)).length > 0);
        })() ? (
          <div className="space-y-3">
            {/* First show scrimmage invites (yesterday and future - visible until day after) */}
            {Array.isArray(scrimmageInvites) && scrimmageInvites.filter((invite: any) => {
              const eventDate = new Date(invite.dateTime);
              const yesterday = new Date();
              yesterday.setDate(yesterday.getDate() - 1);
              yesterday.setHours(0, 0, 0, 0);
              const eventDateOnly = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate());
              return eventDateOnly >= yesterday;
            }).map((invite: any) => (
              <div 
                key={`invite-${invite.id}`}
                className="rounded-xl border border-yellow-500/50 p-4 relative pt-[5px] pb-[5px] pl-[20px] pr-[20px] bg-[#e2e2e2] dark:bg-[#212121]"
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
            
            {/* Show approved scrimmages (yesterday and future - visible until day after) */}
            {Array.isArray(scrimmageRequests) && scrimmageRequests
              .filter((request: any) => {
                if (request.status !== 'approved' || !request.scrimmage) return false;
                const eventDate = new Date(request.scrimmage.dateTime);
                const yesterday = new Date();
                yesterday.setDate(yesterday.getDate() - 1);
                yesterday.setHours(0, 0, 0, 0);
                const eventDateOnly = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate());
                return eventDateOnly >= yesterday;
              })
              .slice(0, 5)
              .map((request: any) => {
                const scrimmage = request.scrimmage;
                return (
                  <div 
                    key={`scrimmage-${scrimmage.id}`}
                    className="rounded-xl border border-border p-4 relative cursor-pointer hover:bg-muted/50 transition-colors pt-[5px] pb-[5px] pl-[20px] pr-[20px] bg-[#e2e2e2] dark:bg-[#212121]" 
                    onClick={() => navigate(`/scrimmage/${scrimmage.id}`)}
                    data-testid={`card-scrimmage-${scrimmage.id}`}
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-primary rounded-lg flex items-center justify-center">
                        <Trophy className="w-6 h-6 text-primary-foreground" />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold" data-testid={`text-scrimmage-title-${scrimmage.id}`}>
                          {scrimmage.title}
                        </h3>
                        <p className="text-sm text-muted-foreground" data-testid={`text-scrimmage-time-${scrimmage.id}`}>
                          {format(new Date(scrimmage.dateTime), 'MMM d • h:mm a')}
                        </p>
                        {scrimmage.location && (
                          <p className="text-xs text-muted-foreground" data-testid={`text-scrimmage-location-${scrimmage.id}`}>
                            {scrimmage.location}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            
            {/* Show personal reminders (yesterday and future - visible until day after) */}
            {Array.isArray(personalReminders) && personalReminders
              .filter((reminder: any) => {
                if (reminder.isCompleted) return false;
                const eventDate = new Date(reminder.scheduledAt);
                const yesterday = new Date();
                yesterday.setDate(yesterday.getDate() - 1);
                yesterday.setHours(0, 0, 0, 0);
                const eventDateOnly = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate());
                return eventDateOnly >= yesterday;
              })
              .sort((a: any, b: any) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())
              .slice(0, 5)
              .map((reminder: any) => (
                <div 
                  key={`reminder-${reminder.id}`}
                  className="rounded-xl border border-green-200 dark:border-green-800 p-4 relative pt-[5px] pb-[5px] pl-[20px] pr-[20px] bg-[#e2e2e2] dark:bg-[#212121]"
                  data-testid={`card-reminder-${reminder.id}`}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-green-500 rounded-lg flex items-center justify-center">
                      <Clock className="w-6 h-6 text-white" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold" data-testid={`text-reminder-title-${reminder.id}`}>
                          {reminder.title}
                        </h3>
                        <span className="text-xs bg-green-500 text-white px-2 py-0.5 rounded">Reminder</span>
                      </div>
                      <p className="text-sm text-muted-foreground" data-testid={`text-reminder-time-${reminder.id}`}>
                        {format(new Date(reminder.scheduledAt), 'MMM d • h:mm a')}
                      </p>
                      {reminder.description && (
                        <p className="text-xs text-muted-foreground" data-testid={`text-reminder-description-${reminder.id}`}>
                          {reminder.description}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteReminderMutation.mutate(reminder.id);
                      }}
                      className="px-3 py-1 text-sm hover:bg-muted rounded-lg transition-colors text-muted-foreground hover:text-foreground"
                      data-testid={`button-dismiss-reminder-${reminder.id}`}
                      disabled={deleteReminderMutation.isPending}
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              ))}
            
            {/* Then show regular games (yesterday and future - visible until day after) */}
            {(upcomingGames as any[])
              .filter((game: any) => {
                // Games remain visible until the day AFTER they are scheduled
                // Compare local dates only (not timestamps) to handle timezone differences correctly
                const eventDate = new Date(game.scheduledAt);
                const yesterday = new Date();
                yesterday.setDate(yesterday.getDate() - 1);
                yesterday.setHours(0, 0, 0, 0);
                const eventDateOnly = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate());
                if (eventDateOnly < yesterday) {
                  return false;
                }
                // Always show scrimmages (user is already approved)
                if (game.isScrimmage) {
                  return true;
                }
                // For regular games, ensure we only show games for teams the user is currently on
                const userTeamIds = Array.isArray(userTeams) ? userTeams.map((team: any) => team.id) : [];
                const isOnTeam = userTeamIds.includes(game.homeTeamId) || userTeamIds.includes(game.awayTeamId);
                // Also show games where user is an approved substitute (marked by backend)
                const isSubstitute = game.isSubstitute === true;
                return isOnTeam || isSubstitute;
              })
              .slice(0, 5).map((game: any) => (
              <div 
                key={game.id} 
                className="rounded-xl border border-border p-4 relative cursor-pointer hover:bg-muted/50 transition-colors pt-[5px] pb-[5px] pl-[20px] pr-[20px] bg-[#e2e2e2] dark:bg-[#212121]" 
                onClick={() => navigate(game.isScrimmage ? `/scrimmage/${game.id}` : `/game/${game.id}`)}
                data-testid={`card-game-${game.id}`}
              >
                <div className="flex items-center gap-4 bg-[212121]">
                  <div className="w-12 h-12 bg-primary rounded-lg flex items-center justify-center relative">
                    {(() => {
                      const opponentTeam = game.homeTeam?.id === primaryTeam?.id ? game.awayTeam : game.homeTeam;
                      return opponentTeam?.logoUrl ? (
                        <img 
                          src={getImageUrl(opponentTeam.logoUrl) || ''} 
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
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold" data-testid={`text-game-opponent-${game.id}`}>
                        {game.isScrimmage ? game.scrimmageTitle : `vs ${game.homeTeam?.id === primaryTeam?.id ? game.awayTeam?.name : game.homeTeam?.name}`}
                      </h3>
                      {game.isSubstitute === true && (
                        <span className="text-xs bg-orange-500 text-white px-2 py-0.5 rounded font-medium" data-testid={`badge-sub-${game.id}`}>
                          SUB
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground" data-testid={`text-game-time-${game.id}`}>
                      {format(new Date(game.scheduledAt), 'MMM d • h:mm a')}
                    </p>
                    {game.venue && (
                      <p className="text-xs text-muted-foreground" data-testid={`text-game-venue-${game.id}`}>
                        {game.venue}
                      </p>
                    )}
                    {/* Score display for completed games */}
                    {(game.isCompleted || (game.homeScore !== null && game.awayScore !== null)) && !game.isScrimmage && (
                      <div className="text-sm font-medium" data-testid={`text-game-score-${game.id}`}>
                        <span className={game.homeTeam?.id === primaryTeam?.id ? "text-primary" : "text-muted-foreground"}>
                          {game.homeTeam?.name}: {game.homeScore ?? 0}
                        </span>
                        <span className="text-muted-foreground mx-2">•</span>
                        <span className={game.awayTeam?.id === primaryTeam?.id ? "text-primary" : "text-muted-foreground"}>
                          {game.awayTeam?.name}: {game.awayScore ?? 0}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Duty Icons */}
                    {(() => {
                      // Find duty assignments for this game
                      const gameAssignments = dutyAssignments?.find((ga: any) => ga.gameId === game.id);
                      if (!gameAssignments || !Array.isArray(gameAssignments.assignments)) {
                        return null;
                      }
                      
                      // Filter assignments claimed by current user
                      const userDuties = gameAssignments.assignments.filter(
                        (assignment: any) => assignment.userId === (userProfile as any)?.id
                      );
                      
                      if (userDuties.length === 0) return null;
                      
                      return (
                        <div className="flex items-center gap-1">
                          {userDuties.map((assignment: any, index: number) => {
                            // First check if there's a Lucide icon available
                            const IconComponent = getIconComponent(assignment.dutyTemplate?.icon);
                            if (IconComponent) {
                              return (
                                <div 
                                  key={`${assignment.id}-${index}`}
                                  className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center"
                                  title={assignment.dutyTemplate?.name}
                                  data-testid={`icon-duty-${assignment.dutyTemplate.name}-${game.id}`}
                                >
                                  <IconComponent className="w-5 h-5 text-primary-foreground" />
                                </div>
                              );
                            }
                            
                            // Fallback to beverage jar for default duties that haven't been edited
                            if (assignment.dutyTemplate?.name === 'Beverages') {
                              return (
                                <div 
                                  key={`${assignment.id}-${index}`}
                                  className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center"
                                  title={assignment.dutyTemplate?.name}
                                  data-testid={`icon-duty-${assignment.dutyTemplate.name}-${game.id}`}
                                >
                                  <img 
                                    src={beverageJarUrl}
                                    alt="Beverage Duty"
                                    className="h-5 w-auto invert dark:invert-0"
                                    style={{ aspectRatio: '9/16' }}
                                  />
                                </div>
                              );
                            }
                            
                            return null;
                          })}
                        </div>
                      );
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
      {/* Find a League/Team Section - Bottom */}
      <div className="px-6 flex gap-2">
        <button
          onClick={() => navigate('/league-tournament-search')}
          className="flex-1 bg-primary text-primary-foreground px-2 py-1 rounded-lg hover:bg-primary font-medium text-sm"
          data-testid="button-find-league"
        >Find a League / Tournament</button>
        <button
          onClick={() => navigate('/team-search')}
          className="flex-1 bg-primary text-primary-foreground px-2 py-1 rounded-lg hover:bg-primary font-medium text-sm"
          data-testid="button-find-team"
        >
          Find a Team
        </button>
        <button
          onClick={() => setShowFeedbackModal(true)}
          className="flex-1 bg-primary text-primary-foreground px-2 py-1 rounded-lg hover:bg-primary font-medium text-sm"
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
        leagueId={selectedType === 'tournament' ? null : effectiveLeagueId}
        tournamentId={selectedType === 'tournament' ? selectedId : null}
      />
      {/* Needs Attention Modal */}
      <NeedsAttentionModal 
        isOpen={showNeedsAttentionModal}
        onClose={() => setShowNeedsAttentionModal(false)}
        leagueId={effectiveLeagueId}
        onNavigate={navigate}
      />
      {/* Feedback Modal */}
      <FeedbackModal 
        isOpen={showFeedbackModal}
        onClose={() => setShowFeedbackModal(false)}
      />
      {/* Add Event Dialog */}
      <Dialog open={showAddEventDialog} onOpenChange={setShowAddEventDialog}>
        <DialogContent className="sm:max-w-[425px]" data-testid="dialog-add-event">
          <DialogHeader>
            <DialogTitle data-testid="text-add-event-title">Add Event</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-4">
            <Button
              onClick={() => {
                setEventType('reminder');
                setShowAddEventDialog(false);
              }}
              variant="outline"
              className="w-full h-auto py-4 px-6 justify-start text-left"
              data-testid="button-select-reminder"
            >
              <div>
                <div className="font-semibold">Personal Reminder</div>
                <div className="text-sm text-muted-foreground">Add a personal note or reminder to your calendar</div>
              </div>
            </Button>
            {canScheduleGames && (
              <Button
                onClick={() => {
                  setEventType('game');
                  setShowAddEventDialog(false);
                }}
                variant="outline"
                className="w-full h-auto py-4 px-6 justify-start text-left"
                data-testid="button-select-game"
              >
                <div>
                  <div className="font-semibold">Team Game</div>
                  <div className="text-sm text-muted-foreground">Schedule a game for your team</div>
                </div>
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
      {/* Personal Reminder Form Dialog */}
      <Dialog open={eventType === 'reminder'} onOpenChange={(open) => !open && setEventType(null)}>
        <DialogContent className="sm:max-w-[500px]" data-testid="dialog-create-reminder">
          <DialogHeader>
            <DialogTitle data-testid="text-create-reminder-title">Create Personal Reminder</DialogTitle>
          </DialogHeader>
          <Form {...reminderForm}>
            <form onSubmit={reminderForm.handleSubmit((data) => createReminderMutation.mutate(data))} className="space-y-4">
              <FormField
                control={reminderForm.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Title</FormLabel>
                    <FormControl>
                      <Input placeholder="Reminder title" {...field} data-testid="input-reminder-title" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={reminderForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description (Optional)</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Add more details..." {...field} data-testid="input-reminder-description" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={reminderForm.control}
                name="scheduledAt"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date & Time</FormLabel>
                    <FormControl>
                      <Input type="datetime-local" {...field} data-testid="input-reminder-datetime" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex gap-2 justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEventType(null)}
                  data-testid="button-cancel-reminder"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createReminderMutation.isPending}
                  data-testid="button-submit-reminder"
                >
                  {createReminderMutation.isPending ? "Creating..." : "Create Reminder"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
      {/* Team Game Form Dialog */}
      <Dialog open={eventType === 'game'} onOpenChange={(open) => !open && setEventType(null)}>
        <DialogContent className="sm:max-w-[500px]" data-testid="dialog-create-game">
          <DialogHeader>
            <DialogTitle data-testid="text-create-game-title">Create Team Game</DialogTitle>
          </DialogHeader>
          <Form {...gameForm}>
            <form onSubmit={gameForm.handleSubmit((data) => createGameMutation.mutate(data))} className="space-y-4">
              <FormField
                control={gameForm.control}
                name="teamId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Your Team</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-game-team">
                          <SelectValue placeholder="Select your team" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {Array.isArray(userTeams) && userTeams.map((team: any) => (
                          <SelectItem key={team.id} value={team.id} data-testid={`option-team-${team.id}`}>
                            {team.leagueId && team.league ? `${team.league.name}: ${team.name}` : team.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={gameForm.control}
                name="opponentName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Opponent Team</FormLabel>
                    <FormControl>
                      <Input placeholder="Opponent team name" {...field} data-testid="input-game-opponent" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={gameForm.control}
                name="scheduledAt"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date & Time</FormLabel>
                    <FormControl>
                      <Input type="datetime-local" {...field} data-testid="input-game-datetime" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={gameForm.control}
                name="venue"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Venue (Optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="Game location" {...field} data-testid="input-game-venue" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={gameForm.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes (Optional)</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Additional information..." {...field} data-testid="input-game-notes" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex gap-2 justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEventType(null)}
                  data-testid="button-cancel-game"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createGameMutation.isPending}
                  data-testid="button-submit-game"
                >
                  {createGameMutation.isPending ? "Creating..." : "Create Game"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
