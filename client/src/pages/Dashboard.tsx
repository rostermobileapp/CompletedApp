import { useQuery } from '@tanstack/react-query';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { useAuth } from '@/hooks/useAuth';
// 🚨 SUBSCRIPTION SYSTEM REMOVED - ALL FEATURES FREE! 🚨
// import { SubscriptionGate } from '@/components/SubscriptionGate'; // DELETED
// import { useSubscription } from '@/context/SubscriptionContext'; // REMOVED
import { usePermissions } from '@/context/SubscriptionContext';
import { notifyDashboardSelectionChange, DASHBOARD_SELECTION_CHANGE_EVENT } from '@/hooks/useDashboardSelection';
import { useLocation, Link } from 'wouter';
import { Trophy, Users, TrendingUp, Clock, Search, Coffee, Check, X, Beer, BrickWall, BarChart3, Award, ChevronDown, ChevronRight, AlertCircle, Settings, UserCheck, Shield, Crown, Star, Plus, Pizza, UtensilsCrossed, Cookie, IceCream, Wine, CupSoda, Milk, Wrench, Clipboard, Package, ShoppingBag, Camera, Heart, Smile, ThumbsUp, Flag, Music, Menu, Calendar, LucideIcon, UserPlus, Target, ArrowRight, Bell, XCircle, CheckCircle2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetClose } from '@/components/ui/sheet';
import { useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient, getImageUrl, getAuthHeaders } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { format } from 'date-fns';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import beverageJarUrl from '@assets/Luminari Report (1)_1757085824172.png';
import lightModeLogo from '@assets/Light_Mode_Logo_1768322748282.png';
import darkModeLogo from '@assets/Dark_Mode_Logo_1770738054930.png';
import FeedbackModal from '@/components/FeedbackModal';
import PastSeasonsModal from '@/components/PastSeasonsModal';
import { useTheme } from '@/context/ThemeContext';
import { FeatureLockOverlay } from '@/components/FeatureLockOverlay';
import { setPageTransitionDirection } from '@/components/PageTransition';
import { SlideOutMenu } from '@/components/SlideOutMenu';
import { ScheduleCalendarMobile } from '@/components/dashboard/ScheduleCalendarMobile';
import { useLeagueUnreadMessages } from '@/hooks/useLeagueUnreadMessages';
import { useIsDesktopWeb } from '@/hooks/useIsDesktopWeb';
import { useSlideUpOverlay } from '@/components/SlideUpOverlay';
import Announcements from '@/pages/Announcements';
import MediaGalleryPage from '@/pages/MediaGallery';
import StatsPage from '@/pages/Stats';
import { HomeDesktop } from '@/components/home-desktop/HomeDesktop';
import { AddEventDialog } from '@/components/dashboard/AddEventDialog';
import { TournamentCountdown } from '@/components/TournamentCountdown';

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

const generalEventSchema = z.object({
  teamId: z.string().min(1, "Team is required"),
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  scheduledAt: z.string().min(1, "Date and time are required"),
  endTime: z.string().optional(),
  location: z.string().optional(),
});

async function cropImageTo16x9(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const targetRatio = 16 / 9; // width / height
      const srcRatio = img.width / img.height;
      let sx = 0, sy = 0, sw = img.width, sh = img.height;
      if (srcRatio > targetRatio) {
        sw = img.height * targetRatio;
        sx = (img.width - sw) / 2;
      } else {
        sh = img.width / targetRatio;
        sy = (img.height - sh) / 2;
      }
      const canvas = document.createElement('canvas');
      canvas.width = sw;
      canvas.height = sh;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('Canvas not available'));
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
      canvas.toBlob(blob => {
        if (blob) resolve(blob);
        else reject(new Error('Canvas toBlob failed'));
      }, file.type || 'image/jpeg', 0.92);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image load failed')); };
    img.src = url;
  });
}

async function uploadEventPhoto(file: File): Promise<string> {
  const formData = new FormData();
  formData.append('photo', file, file.name);
  const authHeaders = await getAuthHeaders();
  const res = await fetch('/api/event-photos/upload', {
    method: 'POST',
    body: formData,
    headers: authHeaders,
  });
  if (!res.ok) throw new Error(`Photo upload failed: ${res.status}`);
  const { path } = await res.json();
  return path as string;
}

const scrimmageEventSchema = z.object({
  teamId: z.string().min(1, "Team is required"),
  title: z.string().min(1, "Title is required"),
  scheduledAt: z.string().min(1, "Date and time are required"),
  endTime: z.string().optional(),
  location: z.string().optional(),
  isInternalScrimmage: z.boolean().default(true),
  opponentName: z.string().optional(),
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
    staleTime: 5 * 60 * 1000, // 5 minutes - use cached data
    refetchInterval: 90000, // Check every 90 seconds (reduced from 30s to lower egress)
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
  
  // Fetch pending league member approvals - use stale-while-revalidate for instant modal
  const { data: pendingMembers = [], isFetching: pendingMembersFetching } = useQuery({
    queryKey: ['/api/leagues', leagueId, 'pending-members'],
    queryFn: async () => {
      if (!leagueId) return [];
      const response = await apiRequest('GET', `/api/leagues/${leagueId}/pending-members`);
      return response.json();
    },
    staleTime: 5 * 60 * 1000, // 5 minutes - show cached data instantly
    enabled: !!leagueId, // Always enabled when leagueId exists (prefetch)
    refetchOnMount: true, // Refetch in background when modal opens
  });

  // Fetch pending substitute approvals
  const { data: pendingSubstituteApprovals, isFetching: substituteApprovalsFetching } = useQuery({
    queryKey: ['/api/substitute-requests/pending-approvals', leagueId],
    queryFn: async () => {
      if (!leagueId) return { captain: [], commissioner: [], total: 0 };
      const response = await apiRequest('GET', `/api/substitute-requests/pending-approvals?leagueId=${leagueId}`);
      return response.json();
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!leagueId,
    refetchOnMount: true,
  });

  // Fetch games that need score verification - using dedicated endpoint
  const { data: gamesNeedingVerification = [], isFetching: gamesFetching } = useQuery({
    queryKey: ['/api/leagues', leagueId, 'games-needing-verification'],
    queryFn: async () => {
      if (!leagueId) return [];
      const response = await apiRequest('GET', `/api/leagues/${leagueId}/games-needing-verification`);
      if (!response.ok) return [];
      return response.json();
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!leagueId,
    refetchOnMount: true,
  });

  // Fetch tournament matches that need score verification
  const { data: tournamentMatchesNeedingVerification = [], isFetching: tournamentMatchesFetching } = useQuery({
    queryKey: ['/api/leagues', leagueId, 'tournament-matches-needing-verification'],
    queryFn: async () => {
      if (!leagueId) return [];
      const response = await apiRequest('GET', `/api/leagues/${leagueId}/tournament-matches-needing-verification`);
      if (!response.ok) return [];
      return response.json();
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!leagueId,
    refetchOnMount: true,
  });

  // Combine games and tournament matches for verification
  const allItemsNeedingVerification = [
    ...gamesNeedingVerification,
    ...tournamentMatchesNeedingVerification.map((match: any) => ({
      ...match,
      isTournamentMatch: true,
    })),
  ];

  // Fetch games needing star awards
  const { data: gamesNeedingStars = [], isFetching: starsFetching } = useQuery({
    queryKey: ['/api/user/games-needing-stars', leagueId],
    queryFn: async () => {
      if (!leagueId) return [];
      const response = await apiRequest('GET', `/api/user/games-needing-stars?leagueId=${leagueId}`);
      return response.json();
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!leagueId,
    refetchOnMount: true,
  });

  // Fetch notifications (previously in header NotificationCenter)
  const { data: notifications = [], isFetching: notificationsFetching } = useQuery<Notification[]>({
    queryKey: ['/api/notifications'],
    staleTime: 5 * 60 * 1000,
    refetchOnMount: true,
  });

  const { data: unreadNotifications = [] } = useQuery<Notification[]>({
    queryKey: ['/api/notifications/unread'],
    staleTime: 5 * 60 * 1000,
    refetchOnMount: true,
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
                     allItemsNeedingVerification.length +
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 pb-24 z-50 animate-modal-backdrop">
      <div className="bg-card rounded-lg hairline elev-lift w-full max-w-md h-[90vh] flex flex-col animate-modal-pop">
        {/* Header */}
        <div className="p-6 border-b border-border pt-[4px] pb-[4px]">
          <h2 className="text-2xl font-semibold text-center">Needs Attention</h2>
        </div>

        {/* Content - Show cached data immediately, refresh in background */}
        <div className="flex-1 overflow-auto p-6 pl-[4px] pr-[4px]">
          {totalTasks === 0 ? (
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
                              <p className="font-medium text-foreground">
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

              {/* Games and Tournament Matches Needing Score Verification Section */}
              {allItemsNeedingVerification.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <BarChart3 className="w-5 h-5 text-[#3c83f6]" />
                    <h3 className="text-lg font-semibold text-[#3c83f6]">
                      Score Verifications ({allItemsNeedingVerification.length})
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
function StandingsModal({ isOpen, onClose, leagueId, tournamentId, seasonId }: { 
  isOpen: boolean; 
  onClose: () => void; 
  leagueId?: string | null; 
  tournamentId?: string | null;
  seasonId?: string | null;
}) {
  const { canAccessPremiumFeatures } = usePermissions();

  // Local season selection — defaults to the season passed in by the parent
  // but lets the user browse prior seasons without leaving the modal.
  const [localSeasonId, setLocalSeasonId] = React.useState<string | null>(
    seasonId ?? null,
  );
  React.useEffect(() => {
    setLocalSeasonId(seasonId ?? null);
  }, [seasonId, leagueId]);

  // Fetch all seasons for the league so the user can pick a prior one.
  const { data: leagueSeasons = [] } = useQuery({
    queryKey: ['/api/leagues', leagueId, 'seasons'],
    queryFn: async () => {
      if (!leagueId) return [];
      const response = await apiRequest('GET', `/api/leagues/${leagueId}/seasons`);
      return response.json();
    },
    enabled: !!leagueId && isOpen && !tournamentId,
    staleTime: 5 * 60 * 1000,
  });

  // Fetch league standings — scoped to the locally selected season.
  const { data: leagueStandings = [], isLoading: isLoadingLeague } = useQuery({
    queryKey: ['/api/leagues', leagueId, 'standings', { seasonId: localSeasonId ?? null }],
    queryFn: async () => {
      if (!leagueId) return [];
      const url = localSeasonId
        ? `/api/leagues/${leagueId}/standings?seasonId=${localSeasonId}`
        : `/api/leagues/${leagueId}/standings`;
      const response = await apiRequest('GET', url);
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-1 sm:p-4 z-50 animate-modal-backdrop">
      <div className="bg-card rounded-lg hairline elev-lift w-[calc(100vw-0.5rem)] sm:w-[calc(100vw-2rem)] md:max-w-lg h-[90vh] flex flex-col animate-modal-pop">
        {/* Header */}
        <div className="p-3 sm:p-6 border-b border-border relative">
          <h2 className="text-xl sm:text-2xl font-semibold text-center pr-10">
            {tournamentId ? 'Tournament Standings' : 'League Standings'}
          </h2>
          <button
            onClick={onClose}
            className="absolute top-3 right-3 sm:top-6 sm:right-6 w-8 h-8 sm:w-10 sm:h-10 bg-red-600 hover:bg-red-700 rounded flex items-center justify-center transition-colors"
            data-testid="button-close-standings"
          >
            <X className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
          </button>
          {/* Season picker — only shown for league standings with multiple seasons */}
          {!tournamentId && Array.isArray(leagueSeasons) && leagueSeasons.length > 1 && (
            <div className="mt-2 flex justify-center">
              <select
                value={localSeasonId ?? ''}
                onChange={(e) => setLocalSeasonId(e.target.value || null)}
                className="bg-muted text-foreground border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                data-testid="standings-modal-season-select"
                aria-label="Select season"
              >
                {(leagueSeasons as any[]).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Content */}
        <FeatureLockOverlay isLocked={false} className="flex-1 flex flex-col">
        <div className="flex-1 overflow-auto p-2 sm:p-6">
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
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left px-1 py-2 font-semibold">Team</th>
                    <th className="text-center px-1 py-2 font-semibold">GP</th>
                    <th className="text-center px-1 py-2 font-semibold">W</th>
                    <th className="text-center px-1 py-2 font-semibold">L</th>
                    <th className="text-center px-1 py-2 font-semibold">T</th>
                    <th className="text-center px-1 py-2 font-semibold">OTL</th>
                    <th className="text-center px-1 py-2 font-semibold">PTS</th>
                  </tr>
                </thead>
                <tbody>
                  {standings.map((team: any, index: number) => (
                    <tr 
                      key={team.teamId} 
                      className={`border-b border-border/50 hover:bg-muted/30 ${index === 0 ? 'bg-primary/5' : ''}`}
                      data-testid={`standings-row-${team.teamId}`}
                    >
                      <td className="px-1 py-2">
                        {/* FREE TIER RESTRICTION: Disable team navigation for free tier users */}
                        {canAccessPremiumFeatures() ? (
                          <Link 
                            href={`/team/${team.teamId}`}
                            onClick={onClose}
                            className="block w-full px-2 py-1 bg-primary text-white font-medium rounded hover:bg-primary/80 transition-colors cursor-pointer text-center"
                            data-testid={`team-link-${team.teamId}`}
                          >
                            {team.teamName}
                          </Link>
                        ) : (
                          <span 
                            className="block w-full px-2 py-1 bg-muted text-muted-foreground font-medium rounded text-center"
                            data-testid={`team-name-${team.teamId}`}
                          >
                            {team.teamName}
                          </span>
                        )}
                      </td>
                      <td className="text-center px-1 py-2" data-testid={`games-played-${team.teamId}`}>
                        {team.gamesPlayed}
                      </td>
                      <td className="text-center px-1 py-2 text-green-600 font-medium" data-testid={`wins-${team.teamId}`}>
                        {team.wins}
                      </td>
                      <td className="text-center px-1 py-2 text-red-600 font-medium" data-testid={`losses-${team.teamId}`}>
                        {team.losses}
                      </td>
                      <td className="text-center px-1 py-2 text-yellow-600 font-medium" data-testid={`ties-${team.teamId}`}>
                        {team.ties}
                      </td>
                      <td className="text-center px-1 py-2 text-orange-600 font-medium" data-testid={`shootout-losses-${team.teamId}`}>
                        {team.shootoutLosses}
                      </td>
                      <td className="text-center px-1 py-2 font-bold text-primary" data-testid={`points-${team.teamId}`}>
                        {team.points}
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
  // Fetch games that need score verification - using dedicated endpoint
  const { data: gamesNeedingVerification = [] } = useQuery({
    queryKey: ['/api/leagues', leagueId, 'games-needing-verification'],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/leagues/${leagueId}/games-needing-verification`);
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!leagueId,
  });

  // This component no longer renders UI since the permanent "Needs Attention" bar
  // in the main component handles all needs attention tasks
  return null;
}

/**
 * Thin wrapper around the legacy mobile dashboard. On desktop web (>=1024px,
 * non-Capacitor) we skip mounting `DashboardMobile` entirely so its many
 * legacy data fetches (incl. the per-game duty N+1) never run on the new
 * desktop home. The shared add-event dialog flow is rendered at this level so
 * the desktop schedule's "+ Add" button keeps working.
 */
export default function Dashboard() {
  const isDesktopWeb = useIsDesktopWeb();
  const [showAddEventDialog, setShowAddEventDialog] = useState(false);

  if (isDesktopWeb) {
    return (
      <>
        <HomeDesktop onAddEvent={() => setShowAddEventDialog(true)} />
        <AddEventDialog
          open={showAddEventDialog}
          onOpenChange={setShowAddEventDialog}
        />
      </>
    );
  }

  return <DashboardMobile />;
}

function DashboardMobile() {
  const { user: supabaseUser } = useAuth();
  const tier = (supabaseUser as any)?.role || 'free_tier';
  const { canAccessPremiumFeatures, hasStatManagerAccess } = usePermissions();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { theme } = useTheme();
  const { openOverlay } = useSlideUpOverlay();

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
  const [showPastSeasonsModal, setShowPastSeasonsModal] = useState(false);
  const isDesktopWeb = useIsDesktopWeb();
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

  // Listen for selection changes made by other components (e.g. Teams page tab)
  React.useEffect(() => {
    const syncFromStorage = () => {
      const type = localStorage.getItem('dashboardSelectedType');
      const id = localStorage.getItem('dashboardSelectedId');
      if (type === 'team' || type === 'league' || type === 'tournament') {
        setSelectedType(type);
        setSelectedId(id);
      }
    };
    window.addEventListener(DASHBOARD_SELECTION_CHANGE_EVENT, syncFromStorage);
    return () => window.removeEventListener(DASHBOARD_SELECTION_CHANGE_EVENT, syncFromStorage);
  }, []);
  
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
  const [eventType, setEventType] = useState<'reminder' | 'game' | 'generalEvent' | 'scrimmage' | null>(null);

  // Schedule view toggle (List default, Calendar alt) — persisted per-device via localStorage
  const [scheduleView, setScheduleView] = useState<'list' | 'calendar'>(() => {
    if (typeof window === 'undefined') return 'list';
    try {
      const stored = window.localStorage.getItem('scheduleView');
      return stored === 'calendar' ? 'calendar' : 'list';
    } catch {
      return 'list';
    }
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem('scheduleView', scheduleView);
    } catch {
      // ignore storage errors (private mode, quota, etc.)
    }
  }, [scheduleView]);

  const [scheduleScope, setScheduleScope] = useState<'team' | 'league'>('team');

  
  // Edit team event state
  const [editingTeamEvent, setEditingTeamEvent] = useState<any>(null);
  
  // Dismissing reminders animation state
  const [dismissingReminders, setDismissingReminders] = useState<Set<string>>(new Set());

  // Photo upload state — personal reminder
  const [reminderPhotoFile, setReminderPhotoFile] = useState<File | null>(null);
  const [reminderPhotoPreview, setReminderPhotoPreview] = useState<string | null>(null);
  const reminderPhotoRef = useRef<HTMLInputElement>(null);

  // Photo upload state — general event
  const [eventPhotoFile, setEventPhotoFile] = useState<File | null>(null);
  const [eventPhotoPreview, setEventPhotoPreview] = useState<string | null>(null);
  const eventPhotoRef = useRef<HTMLInputElement>(null);

  const handleReminderPhotoChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const cropped = await cropImageTo16x9(file);
    const croppedFile = new File([cropped], file.name, { type: cropped.type });
    setReminderPhotoFile(croppedFile);
    setReminderPhotoPreview(URL.createObjectURL(cropped));
  }, []);

  const handleEventPhotoChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const cropped = await cropImageTo16x9(file);
    const croppedFile = new File([cropped], file.name, { type: cropped.type });
    setEventPhotoFile(croppedFile);
    setEventPhotoPreview(URL.createObjectURL(cropped));
  }, []);

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

  // General Event form
  const generalEventForm = useForm<z.infer<typeof generalEventSchema>>({
    resolver: zodResolver(generalEventSchema),
    defaultValues: {
      teamId: "",
      title: "",
      description: "",
      scheduledAt: "",
      endTime: "",
      location: "",
    },
  });

  // Scrimmage Event form
  const scrimmageEventForm = useForm<z.infer<typeof scrimmageEventSchema>>({
    resolver: zodResolver(scrimmageEventSchema),
    defaultValues: {
      teamId: "",
      title: "",
      scheduledAt: "",
      endTime: "",
      location: "",
      isInternalScrimmage: true,
      opponentName: "",
      notes: "",
    },
  });

  // Create personal reminder mutation
  const createReminderMutation = useMutation({
    mutationFn: async (data: z.infer<typeof personalReminderSchema>) => {
      let photoUrl: string | null = null;
      if (reminderPhotoFile) {
        photoUrl = await uploadEventPhoto(reminderPhotoFile);
      }
      await apiRequest("POST", "/api/personal-reminders", {
        ...data,
        scheduledAt: data.scheduledAt,
        photoUrl,
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
      setReminderPhotoFile(null);
      setReminderPhotoPreview(null);
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
    onError: (_error, reminderId) => {
      setDismissingReminders(prev => {
        const next = new Set(prev);
        next.delete(reminderId);
        return next;
      });
      toast({
        title: "Error",
        description: "Failed to dismiss reminder. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Animated dismiss handler for personal reminders
  const handleDismissReminder = (reminderId: string) => {
    setDismissingReminders(prev => new Set(prev).add(reminderId));
    setTimeout(() => {
      deleteReminderMutation.mutate(reminderId);
    }, 350);
  };

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

  // Create general event mutation
  const createGeneralEventMutation = useMutation({
    mutationFn: async (data: z.infer<typeof generalEventSchema>) => {
      let photoUrl: string | null = null;
      if (eventPhotoFile) {
        photoUrl = await uploadEventPhoto(eventPhotoFile);
      }
      await apiRequest("POST", "/api/team-events", {
        teamId: data.teamId,
        eventType: "general",
        title: data.title,
        description: data.description || null,
        scheduledAt: data.scheduledAt,
        endTime: data.endTime || null,
        location: data.location || null,
        photoUrl,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/team-events"] });
      toast({
        title: "Event Created",
        description: "Your team event has been added to the calendar.",
      });
      setEventType(null);
      generalEventForm.reset();
      setEventPhotoFile(null);
      setEventPhotoPreview(null);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create event. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Create scrimmage event mutation
  const createScrimmageEventMutation = useMutation({
    mutationFn: async (data: z.infer<typeof scrimmageEventSchema>) => {
      console.log("[Scrimmage] Creating scrimmage with data:", data);
      const response = await apiRequest("POST", "/api/team-events", {
        teamId: data.teamId,
        eventType: "scrimmage",
        title: data.title,
        scheduledAt: data.scheduledAt,
        endTime: data.endTime || null,
        location: data.location || null,
        isInternalScrimmage: data.isInternalScrimmage,
        opponentName: data.isInternalScrimmage ? null : data.opponentName,
        notes: data.notes || null,
      });
      console.log("[Scrimmage] Response:", response);
      return response;
    },
    onSuccess: () => {
      console.log("[Scrimmage] Success!");
      queryClient.invalidateQueries({ queryKey: ["/api/user/team-events"] });
      toast({
        title: "Scrimmage Created",
        description: "Your scrimmage has been added to the calendar.",
      });
      setEventType(null);
      scrimmageEventForm.reset();
    },
    onError: (error) => {
      console.error("[Scrimmage] Error:", error);
      toast({
        title: "Error",
        description: "Failed to create scrimmage. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Update team event mutation
  const updateTeamEventMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      await apiRequest("PATCH", `/api/team-events/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/team-events"] });
      toast({
        title: "Event Updated",
        description: "Your team event has been updated.",
      });
      setEditingTeamEvent(null);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update event. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Delete team event mutation
  const deleteTeamEventMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/team-events/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/team-events"] });
      toast({
        title: "Event Deleted",
        description: "Your team event has been deleted.",
      });
      setEditingTeamEvent(null);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete event. Please try again.",
        variant: "destructive",
      });
    },
  });
  
  const { data: rawUpcomingGames, isLoading: gamesLoading } = useQuery({
    queryKey: ['/api/user/games/upcoming'],
    staleTime: 30000,
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

  // Fetch user's team events (general events and scrimmages)
  const { data: teamEvents = [], isLoading: teamEventsLoading } = useQuery({
    queryKey: ['/api/user/team-events'],
    staleTime: 30000,
    select: (events) => {
      if (!Array.isArray(events)) return [];
      
      // Tournaments don't have team events, return empty
      if (selectedType === 'tournament') {
        return [];
      }
      
      // Filter by team if team is selected
      if (selectedType === 'team' && selectedId) {
        return events.filter((event: any) => event.teamId === selectedId);
      }
      
      return events;
    }
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
  
  // User's approved tournament participations — drives "always include
  // matches from this tournament" so a tournament-only player still sees
  // their tournament games regardless of the selected team/league context.
  const { data: tournamentParticipations = [] } = useQuery<any[]>({
    queryKey: ['/api/user/tournament-participations'],
    enabled: !!supabaseUser,
  });
  const participantTournamentIds = React.useMemo(
    () => new Set(tournamentParticipations.map((p: any) => p.tournamentId)),
    [tournamentParticipations],
  );

  // Filter upcoming games based on selection and handle tournament matches with null team IDs
  const upcomingGames = React.useMemo(() => {
    if (!Array.isArray(rawUpcomingGames)) return rawUpcomingGames;
    
    const games = rawUpcomingGames as any[];

    // Filter by team if team is selected — strict: only games for that
    // team. Tournament matches are intentionally excluded; the user can
    // pick the tournament in the dropdown to see those.
    if (selectedType === 'team' && selectedId) {
      // Find the selected team name to match tournament-style matches that
      // sometimes carry null homeTeamId/awayTeamId but DO belong to this
      // team's league.
      const selectedTeam = (userTeamsAll as any[] | undefined)?.find((t: any) => t.id === selectedId);
      const selectedTeamLeagueId = selectedTeam?.leagueId;
      const selectedTeamName = selectedTeam?.name?.toLowerCase();

      return games.filter(game =>
        game.homeTeamId === selectedId ||
        game.awayTeamId === selectedId ||
        game.isSubstitute === true || // Always show substitute games regardless of selected team
        // For tournament matches with null team IDs, match by team name —
        // but only if that match belongs to the selected team's league.
        (game.isTournamentMatch && selectedTeamName && selectedTeamLeagueId &&
          game.homeTeam?.leagueId === selectedTeamLeagueId && (
            game.homeTeam?.name?.toLowerCase() === selectedTeamName ||
            game.awayTeam?.name?.toLowerCase() === selectedTeamName
          ))
      );
    }

    // Filter by league if league is selected — strict: only games for
    // teams in that league. Tournament matches that belong to a different
    // league (or to a standalone tournament) are intentionally excluded.
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
  }, [rawUpcomingGames, selectedType, selectedId, selectedLeagueId, userTeamsAll]);

  // When the scope toggle is set to "League" and a team is currently selected,
  // bypass the team filter and show all games for that team's league instead.
  const leagueScopeGames = React.useMemo(() => {
    if (!Array.isArray(rawUpcomingGames)) return upcomingGames;
    if (selectedType !== 'team' || !selectedId) return upcomingGames;
    const selectedTeam = (userTeamsAll as any[] | undefined)?.find((t: any) => t.id === selectedId);
    const teamLeagueId = selectedTeam?.leagueId;
    if (!teamLeagueId) return upcomingGames;
    return (rawUpcomingGames as any[]).filter((game: any) =>
      game.homeTeam?.leagueId === teamLeagueId ||
      game.awayTeam?.leagueId === teamLeagueId
    );
  }, [rawUpcomingGames, upcomingGames, selectedType, selectedId, userTeamsAll]);

  // The games list used in the schedule section — respects the scope toggle
  const scheduleGames = scheduleScope === 'league' ? leagueScopeGames : upcomingGames;

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

  const { data: userLeagueMemberships } = useQuery({
    queryKey: ['/api/user/league-memberships'],
  });
  
  const { data: userLeagues } = useQuery({
    queryKey: ['/api/user/leagues'],
  });
  
  // Fetch visible tournaments for all user leagues
  const { data: visibleTournaments = [], isLoading: visibleTournamentsLoading } = useQuery<any[]>({
    queryKey: ['/api/user/visible-tournaments', userLeagues],
    queryFn: async () => {
      if (!Array.isArray(userLeagues) || userLeagues.length === 0) return [];
      
      // Fetch visible tournaments for each league
      const tournamentPromises = userLeagues.map(async (league: any) => {
        try {
          const response = await apiRequest('GET', `/api/leagues/${league.id}/visible-tournaments`);
          const tournaments = await response.json();
          return tournaments.map((t: any) => ({ ...t, leagueName: league.name }));
        } catch (error) {
          console.error(`Failed to fetch visible tournaments for league ${league.id}:`, error);
          return [];
        }
      });
      
      const results = await Promise.all(tournamentPromises);
      return results.flat();
    },
    enabled: Array.isArray(userLeagues) && userLeagues.length > 0,
  });
  
  // Fetch user's paid tournaments
  const { data: userPaidTournaments } = useQuery({
    queryKey: ['/api/user/paid-tournaments'],
  });
  
  // Fetch notification counts for all leagues and tournaments
  const { data: notificationCounts } = useQuery<{
    leagues: Record<string, number>;
    leagueTasks?: Record<string, number>;
    teams?: Record<string, number>;
    tournaments: Record<string, number>;
  }>({
    queryKey: ['/api/user/notification-counts'],
    enabled: !!supabaseUser, // Only fetch when user is authenticated
    staleTime: 5 * 60 * 1000, // 5 minutes - use cached data
    refetchInterval: 90000, // Refetch every 90 seconds (reduced from 30s to lower egress)
  });

  // Unread message counts per league (for cross-league notification indicators)
  const leagueUnreadMessages = useLeagueUnreadMessages();
  
  // Split user's teams into active vs past based on the season's isActive flag.
  // Teams with no season association are treated as active so legacy / standalone
  // teams keep showing in the main dropdown.
  const activeTeams = React.useMemo(() => {
    if (!Array.isArray(userTeamsAll)) return [] as any[];
    return (userTeamsAll as any[]).filter(
      (team: any) => team.seasonIsActive !== false,
    );
  }, [userTeamsAll]);

  const pastSeasonTeams = React.useMemo(() => {
    if (!Array.isArray(userTeamsAll)) return [] as any[];
    return (userTeamsAll as any[]).filter(
      (team: any) => team.seasonIsActive === false,
    );
  }, [userTeamsAll]);

  // Active leagues: leagues that still have an active season (or no seasons
  // at all, for legacy leagues). Leagues whose seasons are all closed are
  // surfaced via the Past Seasons modal instead.
  const activeLeagues = React.useMemo(() => {
    if (!Array.isArray(userLeagues)) return [] as any[];
    return (userLeagues as any[]).filter(
      (lg: any) => lg?.hasActiveSeason !== false,
    );
  }, [userLeagues]);

  // Past-only leagues: leagues the user is in where every season is closed.
  const pastOnlyLeagues = React.useMemo(() => {
    if (!Array.isArray(userLeagues)) return [] as any[];
    return (userLeagues as any[]).filter(
      (lg: any) => lg?.hasActiveSeason === false,
    );
  }, [userLeagues]);

  // Filter leagues to only show those where user has no ACTIVE team and the
  // league still has an active season. League memberships aren't
  // season-scoped today, so we infer "active" from the league's seasons.
  const leaguesWithoutTeams = React.useMemo(() => {
    if (!Array.isArray(userTeamsAll)) {
      return [];
    }

    return activeLeagues.filter((league: any) => {
      const hasActiveTeamInLeague = activeTeams.some(
        (team: any) => team.leagueId === league.id,
      );
      return !hasActiveTeamInLeague;
    });
  }, [activeLeagues, userTeamsAll, activeTeams]);

  const hasPastSeasons = pastSeasonTeams.length > 0 || pastOnlyLeagues.length > 0;

  // Mobile selector glow: pulse when ANY non-selected context (team, league,
  // or tournament) has unreviewed alerts. Mirrors the desktop logic in
  // DesktopAppShell.tsx and uses the typed `notificationCounts` query data.
  const mobileSelectorHasOtherAlerts = React.useMemo(() => {
    const leagueCounts = notificationCounts?.leagues || {};
    const tournamentCounts = notificationCounts?.tournaments || {};
    const teamCounts = notificationCounts?.teams || {};
    // Past-season items must never make the selector pulse, so we only look
    // at teams whose season is still active (or has no season at all).
    const teams: Array<{ id: string; leagueId?: string | null }> =
      activeTeams as any[];
    const leaguesOnly: Array<{ id: string }> =
      Array.isArray(leaguesWithoutTeams) ? (leaguesWithoutTeams as any[]) : [];
    const tournaments: Array<{ id: string }> =
      Array.isArray(userPaidTournaments) ? (userPaidTournaments as any[]) : [];

    let currentLeagueId: string | null = null;
    if (selectedType === 'league') currentLeagueId = selectedId;
    else if (selectedType === 'team') {
      const sel = teams.find((t) => t.id === selectedId);
      currentLeagueId = sel?.leagueId ?? null;
    }

    // (a) Per-team check.
    for (const team of teams) {
      if (selectedType === 'team' && selectedId === team.id) continue;
      if ((teamCounts[team.id] || 0) > 0) return true;
    }
    // (b) Per-league check excluding the currently selected league.
    const seenLeagues = new Set<string>();
    for (const team of teams) {
      const lid = team.leagueId;
      if (!lid || seenLeagues.has(lid)) continue;
      seenLeagues.add(lid);
      if (lid === currentLeagueId) continue;
      if ((leagueCounts[lid] || 0) > 0) return true;
    }
    for (const lg of leaguesOnly) {
      if (!lg.id || seenLeagues.has(lg.id)) continue;
      seenLeagues.add(lg.id);
      if (lg.id === currentLeagueId) continue;
      if ((leagueCounts[lg.id] || 0) > 0) return true;
    }
    // (c) Per-tournament check.
    for (const t of tournaments) {
      if (selectedType === 'tournament' && selectedId === t.id) continue;
      if ((tournamentCounts[t.id] || 0) > 0) return true;
    }
    return false;
  }, [
    notificationCounts,
    activeTeams,
    leaguesWithoutTeams,
    userPaidTournaments,
    selectedType,
    selectedId,
  ]);
  
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
    
    // Set default selection if none exists. Prefer active-season items so a
    // first-time view never lands on a closed season.
    if (!selectedId) {
      // First try to select an active team
      if (activeTeams.length > 0) {
        setSelectedType('team');
        setSelectedId(activeTeams[0].id);
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
      // Last resort: a past-season team if the user has nothing else.
      else if (Array.isArray(userTeamsAll) && userTeamsAll.length > 0) {
        setSelectedType('team');
        setSelectedId(userTeamsAll[0].id);
      }
    }
  }, [userTeamsAll, activeTeams, leaguesWithoutTeams, userPaidTournaments, selectedId, selectedType]);
  
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
    if (!team.leagueId && !team.membershipLeagueId) {
      return team.name;
    }
    
    // Prefer the league ID from the membership record (source of truth for which
    // league the user actually belongs to) over the team's raw leagueId, which can
    // differ if a team was migrated or mis-assigned.
    const effectiveLeagueId = team.membershipLeagueId ?? team.leagueId;
    
    // If team is in a league, show "LeagueName: TeamName" with season if available
    const league = Array.isArray(userLeagues) 
      ? userLeagues.find(l => l.id === effectiveLeagueId) 
      : null;
    
    if (league) {
      const leagueIdSuffix = league.uniqueLeagueId ? ` - ${league.uniqueLeagueId}` : '';
      return `${league.name}: ${team.name}${leagueIdSuffix}`;
    }
    
    // Fallback if league not found (shouldn't happen)
    return team.name;
  }, [userLeagues]);
  
  // Helper function to get league display name
  const getLeagueDisplayName = React.useCallback((league: any) => {
    if (!league) return 'Select League';
    const idSuffix = league.uniqueLeagueId ? ` - ${league.uniqueLeagueId}` : '';
    return `${league.name}${idSuffix}`;
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

  // Fetch the selected tournament's full record so we can detect a 'pending'
  // access state (approved participant whose access window has not yet opened)
  // and render a countdown until the window flips open. The query polls every
  // 30s so the dashboard auto-swaps from countdown to bracket once the window
  // opens, without requiring a manual refresh.
  const { data: selectedTournamentDetail } = useQuery<any>({
    queryKey: ['/api/tournaments', selectedId],
    enabled: selectedType === 'tournament' && !!selectedId,
    refetchInterval: 30_000,
  });

  // True only when the home screen should be showing the pre-window
  // tournament countdown. Mirrors the exact condition that renders
  // <TournamentCountdown /> below so we can suppress every other
  // home-screen section (Wall/Photos/Stats/Standings cards, schedule)
  // until the access window opens. Re-evaluates on each refetch, so the
  // moment accessState flips off 'pending' the hidden sections reappear.
  const isTournamentCountdownActive =
    selectedType === 'tournament' &&
    !!selectedTournament &&
    !primaryTeam &&
    selectedTournamentDetail?.accessState === 'pending';

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

  useQuery({
    queryKey: selectedType === 'tournament' && selectedId
      ? ['/api/tournaments', selectedId, 'announcements']
      : ['/api/leagues', effectiveLeagueId, 'announcements'],
    enabled: !!(selectedType === 'tournament' ? selectedId : effectiveLeagueId),
    staleTime: 30000,
  });

  // Prefetch Stats page data so it loads instantly on Toaster Up
  const { data: prefetchedSeasons } = useQuery({
    queryKey: [`/api/leagues/${effectiveLeagueId}/seasons`],
    enabled: !!effectiveLeagueId && selectedType !== 'tournament',
    staleTime: 5 * 60 * 1000,
  });

  const prefetchSeasonId = React.useMemo(() => {
    if (!Array.isArray(prefetchedSeasons) || prefetchedSeasons.length === 0) return null;
    const active = prefetchedSeasons.find((s: any) => s.isActive);
    return active?.id || prefetchedSeasons[0].id;
  }, [prefetchedSeasons]);

  useQuery({
    queryKey: ['/api/leagues', effectiveLeagueId, 'stats', { seasonId: prefetchSeasonId, playerType: 'non-goalies' }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (prefetchSeasonId) params.append('seasonId', prefetchSeasonId);
      params.append('playerType', 'non-goalies');
      const res = await apiRequest('GET', `/api/leagues/${effectiveLeagueId}/stats?${params.toString()}`);
      return res.json();
    },
    enabled: !!effectiveLeagueId && !!prefetchSeasonId && selectedType !== 'tournament',
    staleTime: 5 * 60 * 1000,
  });

  useQuery({
    queryKey: ['/api/leagues', effectiveLeagueId, 'stats', { seasonId: prefetchSeasonId, playerType: 'goalies' }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (prefetchSeasonId) params.append('seasonId', prefetchSeasonId);
      params.append('playerType', 'goalies');
      const res = await apiRequest('GET', `/api/leagues/${effectiveLeagueId}/stats?${params.toString()}`);
      return res.json();
    },
    enabled: !!effectiveLeagueId && !!prefetchSeasonId && selectedType !== 'tournament',
    staleTime: 5 * 60 * 1000,
  });

  useQuery({
    queryKey: [`/api/leagues/${effectiveLeagueId}/star-leaderboard`],
    enabled: !!effectiveLeagueId && selectedType !== 'tournament',
    staleTime: 5 * 60 * 1000,
  });

  useQuery({
    queryKey: [`/api/leagues/${effectiveLeagueId}/members`],
    enabled: !!effectiveLeagueId && selectedType !== 'tournament',
    staleTime: 5 * 60 * 1000,
  });

  useQuery({
    queryKey: [`/api/leagues/${effectiveLeagueId}/teams`],
    enabled: !!effectiveLeagueId && selectedType !== 'tournament',
    staleTime: 5 * 60 * 1000,
  });

  // Prefetch tournament stats data
  useQuery({
    queryKey: ['/api/tournaments', selectedId, 'stats'],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/tournaments/${selectedId}/stats`);
      return res.json();
    },
    enabled: selectedType === 'tournament' && !!selectedId,
    staleTime: 5 * 60 * 1000,
  });

  useQuery({
    queryKey: ['/api/tournaments', selectedId, 'teams'],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/tournaments/${selectedId}/teams`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: selectedType === 'tournament' && !!selectedId,
    staleTime: 5 * 60 * 1000,
  });

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

  // Scrimmage check-in mutation (RSVP "In")
  const scrimmageCheckInMutation = useMutation({
    mutationFn: async (scrimmageId: string) => {
      return await apiRequest("POST", `/api/scrimmages/${scrimmageId}/requests`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/users/scrimmage-invites'] });
      queryClient.invalidateQueries({ queryKey: ['/api/users/scrimmage-requests'] });
      queryClient.invalidateQueries({ queryKey: ['/api/user/games/upcoming'] });
      toast({
        title: "You're In!",
        description: "Your join request has been submitted and is pending approval.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed",
        description: error.message || "Failed to send request. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Scrimmage decline mutation (RSVP "Out")
  const scrimmageDeclineMutation = useMutation({
    mutationFn: async (scrimmageId: string) => {
      return await apiRequest("POST", `/api/scrimmages/${scrimmageId}/decline-invite`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/users/scrimmage-invites'] });
      queryClient.invalidateQueries({ queryKey: ['/api/users/scrimmage-requests'] });
      queryClient.invalidateQueries({ queryKey: ['/api/user/games/upcoming'] });
      toast({
        title: "Invite Declined",
        description: "You've declined this scrimmage invite.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed",
        description: error.message || "Failed to decline invite. Please try again.",
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

  // Fetch needs attention data for the permanent bar - using dedicated endpoints
  const { data: needsAttentionData, isLoading: isLoadingNeedsAttention } = useQuery({
    queryKey: ['/api/needs-attention-summary', effectiveLeagueId],
    queryFn: async () => {
      if (!effectiveLeagueId) return { pendingMembers: 0, gamesNeedingVerification: 0, notifications: 0, total: 0 };
      
      try {
        // Fetch all top-level data in parallel (including notifications and games needing verification)
        const [pendingMembersResponse, gamesVerificationResponse, tournamentMatchesVerificationResponse, substituteApprovalsResponse, starsResponse, notificationsResponse] = await Promise.all([
          apiRequest('GET', `/api/leagues/${effectiveLeagueId}/pending-members`),
          apiRequest('GET', `/api/leagues/${effectiveLeagueId}/games-needing-verification`),
          apiRequest('GET', `/api/leagues/${effectiveLeagueId}/tournament-matches-needing-verification`),
          apiRequest('GET', `/api/substitute-requests/pending-approvals?leagueId=${effectiveLeagueId}`).catch(() => null),
          apiRequest('GET', `/api/user/games-needing-stars?leagueId=${effectiveLeagueId}`).catch(() => null),
          apiRequest('GET', `/api/notifications`).catch(() => null)
        ]);
        
        const pendingMembers = await pendingMembersResponse.json();
        const gamesNeedingVerificationData = gamesVerificationResponse.ok ? await gamesVerificationResponse.json() : [];
        const tournamentMatchesNeedingVerificationData = tournamentMatchesVerificationResponse.ok ? await tournamentMatchesVerificationResponse.json() : [];
        const substituteData = substituteApprovalsResponse ? await substituteApprovalsResponse.json().catch(() => ({ total: 0 })) : { total: 0 };
        const starsData = starsResponse ? await starsResponse.json().catch(() => []) : [];
        const notificationsData = notificationsResponse ? await notificationsResponse.json().catch(() => []) : [];
        
        const pendingMembersCount = Array.isArray(pendingMembers) ? pendingMembers.length : 0;
        const gamesNeedingVerification = Array.isArray(gamesNeedingVerificationData) ? gamesNeedingVerificationData.length : 0;
        const tournamentMatchesNeedingVerification = Array.isArray(tournamentMatchesNeedingVerificationData) ? tournamentMatchesNeedingVerificationData.length : 0;
        const allItemsNeedingVerification = gamesNeedingVerification + tournamentMatchesNeedingVerification;
        const pendingSubstituteApprovals = substituteData.total || 0;
        const gamesNeedingStars = Array.isArray(starsData) ? starsData.length : 0;
        const notificationsCount = Array.isArray(notificationsData) ? notificationsData.length : 0;
        const total = pendingMembersCount + allItemsNeedingVerification + pendingSubstituteApprovals + gamesNeedingStars + notificationsCount;
        
        return {
          pendingMembers: pendingMembersCount,
          gamesNeedingVerification: allItemsNeedingVerification,
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
    staleTime: 5 * 60 * 1000, // 5 minutes - use cached data
    refetchInterval: 90000, // Refresh every 90 seconds (reduced from 30s to lower egress)
  });

  // DashboardMobile is only mounted by the parent <Dashboard> when
  // !isDesktopWeb, so all of the legacy mobile data hooks above this point
  // are skipped on the new desktop home (Task #59). The desktop layout and
  // its add-event flow live in the parent component.
  return (
    <>
      <div className="min-h-screen flex flex-col" data-testid="dashboard-page">
        {/* Header */}
        <div className="sticky top-0 z-50 bg-background p-3 flex items-center pr-[16px] mb-[0px] pt-[0px] pb-[0px] mt-[4px] pl-[4px]">
            <div className="flex items-center justify-between w-full mt-[4px] mb-[4px] pt-[8px] pb-[8px]">
              <div className="flex items-center gap-2">
                <img 
                  src={theme === 'dark' ? darkModeLogo : lightModeLogo}
                  alt="Roster"
                  className="h-[50px] pl-[12px] pr-[12px]"
                  data-testid="img-roster-logo"
                />
              </div>
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => navigate('/profile')}
                  className={`w-[48px] h-[48px] rounded-full flex items-center justify-center overflow-hidden ${(userProfile as any)?.profileImageUrl ? 'bg-transparent' : 'bg-primary'}`}
                  data-testid="button-profile"
                >
                  {(userProfile as any)?.profileImageUrl ? (
                    <img 
                      src={getImageUrl((userProfile as any).profileImageUrl) || ''} 
                      alt="Profile"
                      className="w-full h-full object-cover bg-transparent"
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
        {((Array.isArray(userTeamsAll) && userTeamsAll.length > 0) || (Array.isArray(leaguesWithoutTeams) && leaguesWithoutTeams.length > 0) || (Array.isArray(userPaidTournaments) && userPaidTournaments.length > 0) || hasPastSeasons) && (
          <div className="px-6 mt-[4px] mb-[8px]">
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setShowDropdown(!showDropdown)}
                className={`w-full hairline elev-rest rounded-lg p-3 flex items-center justify-between hover:bg-muted/50 transition-colors bg-[#e2e2e2] dark:bg-[#212121] pt-[8px] pb-[8px] pl-[4px] pr-[4px] ${mobileSelectorHasOtherAlerts ? 'alerts-glow' : ''}`}
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
                  <span className="text-xs mr-1 text-[#3c83f6] font-bold">Select</span>
                  {/* Total notification count for ALL other teams/leagues/tournaments */}
                  {(() => {
                    let totalNotifications = 0;

                    // Determine the league currently visible on the home screen
                    // (messages for this league show on the bottom nav, not here)
                    let currentlySelectedLeagueId: string | null = null;
                    if (selectedType === 'league') {
                      currentlySelectedLeagueId = selectedId;
                    } else if (selectedType === 'team' && Array.isArray(userTeamsAll)) {
                      const sel = (userTeamsAll as any[]).find((t: any) => t.id === selectedId);
                      currentlySelectedLeagueId = sel?.leagueId ?? null;
                    }

                    // Track which league message counts we've already added (avoid double-counting
                    // when a user has multiple teams in the same league)
                    const countedMessageLeagues = new Set<string>();

                    // Count notifications from other teams (via their league).
                    // Past-season teams are intentionally excluded so a closed
                    // season can never inflate the badge total.
                    activeTeams.forEach((team: any) => {
                      if (selectedType === 'team' && selectedId === team.id) return;
                      const leagueId = team.leagueId;
                      if (leagueId && notificationCounts?.leagues[leagueId]) {
                        totalNotifications += notificationCounts.leagues[leagueId];
                      }
                      // Add unread message count for other leagues only
                      if (leagueId && leagueId !== currentlySelectedLeagueId && !countedMessageLeagues.has(leagueId) && leagueUnreadMessages[leagueId]) {
                        totalNotifications += leagueUnreadMessages[leagueId];
                        countedMessageLeagues.add(leagueId);
                      }
                    });
                    
                    // Count notifications from leagues (without teams)
                    if (Array.isArray(leaguesWithoutTeams)) {
                      leaguesWithoutTeams.forEach((league: any) => {
                        if (selectedType === 'league' && selectedId === league.id) return;
                        if (notificationCounts?.leagues[league.id]) {
                          totalNotifications += notificationCounts.leagues[league.id];
                        }
                        // Add unread message count for other leagues only
                        if (league.id !== currentlySelectedLeagueId && !countedMessageLeagues.has(league.id) && leagueUnreadMessages[league.id]) {
                          totalNotifications += leagueUnreadMessages[league.id];
                          countedMessageLeagues.add(league.id);
                        }
                      });
                    }
                    
                    // Count notifications from tournaments
                    if (Array.isArray(userPaidTournaments)) {
                      userPaidTournaments.forEach((tournament: any) => {
                        if (selectedType === 'tournament' && selectedId === tournament.id) return;
                        if (notificationCounts?.tournaments[tournament.id]) {
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
                <div className="absolute top-full left-0 right-0 mt-1 bg-card hairline elev-lift rounded-lg z-50 max-h-[400px] overflow-y-auto">
                  {/* Teams Section — only active-season teams; closed seasons
                      live behind the "Past Seasons" entry below. */}
                  {activeTeams.length > 0 && (
                    <>
                      <div className="px-3 py-2 text-xs font-semibold text-muted-foreground bg-muted/30">
                        MY TEAMS
                      </div>
                      {activeTeams.map((team: any) => {
                        // Get notification count for this team's league (announcements + unread messages)
                        const teamNotificationCount =
                          (team.leagueId && notificationCounts?.leagues[team.leagueId] || 0) +
                          (team.leagueId && leagueUnreadMessages[team.leagueId] || 0);
                        
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
                        const leagueNotificationCount =
                          (notificationCounts?.leagues[league.id] || 0) +
                          (leagueUnreadMessages[league.id] || 0);
                        
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

                  {/* Past Seasons — single entry that opens a modal listing
                      every team the user had in a closed season. Hidden when
                      the user has no past-season items. */}
                  {hasPastSeasons && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowDropdown(false);
                        setShowPastSeasonsModal(true);
                      }}
                      className="w-full p-3 text-left hover:bg-muted/50 transition-colors border-t border-border last:rounded-b-lg"
                      data-testid="option-past-seasons"
                    >
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-muted-foreground" />
                        <span className="font-medium text-sm">Past Seasons</span>
                      </div>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
        <PastSeasonsModal
          open={showPastSeasonsModal}
          onOpenChange={setShowPastSeasonsModal}
          teams={pastSeasonTeams}
          leagues={
            Array.isArray(userLeagues)
              ? (userLeagues as any[]).map((lg: any) => ({
                  id: lg.id,
                  name: lg.name,
                  isPastOnly: lg.hasActiveSeason === false,
                  pastSeasons: Array.isArray(lg.pastSeasons) ? lg.pastSeasons : [],
                }))
              : []
          }
          onSelect={(s) => {
            setSelectedType(s.type);
            setSelectedId(s.id);
          }}
        />
        {/* 4-Card Section — hidden while a pre-window tournament countdown
            is active so the player only sees the timer below. */}
        {!isTournamentCountdownActive && (
        <div className="px-6 mb-[8px]">
          <div className="grid grid-cols-4 gap-3">
            {/* Announcements Card */}
            <div 
              className="rounded-xl hairline elev-rest p-[17px] min-h-[61px] relative cursor-pointer hover:bg-muted/50 transition-colors bg-[#e2e2e2] dark:bg-[#212121]"
              data-testid="card-announcements"
              onClick={() => openOverlay('/announcements', <Announcements />)}
            >
              <div className="h-full flex flex-col items-center justify-center">
                <BrickWall className="w-8 h-8 text-blue-500 mb-[10px]" />
                <p className="text-xs font-medium text-center">Wall</p>
              </div>
              {selectedType === 'tournament' && selectedId ? (
                <AnnouncementBadge tournamentId={selectedId} />
              ) : (
                effectiveLeagueId && <AnnouncementBadge leagueId={effectiveLeagueId} />
              )}
            </div>

            {/* Photos Card - Always clickable, paywall shown on MediaGalleryPage if needed */}
            <div 
              className="rounded-xl hairline elev-rest p-[17px] min-h-[61px] cursor-pointer hover:bg-muted/50 transition-colors bg-[#e2e2e2] dark:bg-[#212121]" 
              data-testid="card-photos"
              onClick={() => {
                let entityType: 'tournament' | 'league' | 'team' | null = null;
                let entityId: string | null = null;
                let route: string | null = null;
                
                if (selectedType === 'tournament' && selectedId) {
                  entityType = 'tournament';
                  entityId = selectedId;
                  route = `/media/tournament/${selectedId}`;
                } else if (effectiveLeagueId) {
                  entityType = 'league';
                  entityId = effectiveLeagueId;
                  route = `/media/league/${effectiveLeagueId}`;
                } else if (selectedType === 'team' && selectedId) {
                  entityType = 'team';
                  entityId = selectedId;
                  route = `/media/team/${selectedId}`;
                }
                
                if (route && entityType && entityId) {
                  openOverlay(route, <MediaGalleryPage overlayEntityType={entityType} overlayEntityId={entityId} />);
                }
              }}
            >
              <div className="h-full flex flex-col items-center justify-center">
                <Camera className="w-8 h-8 text-blue-500 mb-[10px]" />
                <p className="text-xs font-medium">Photos</p>
              </div>
            </div>

            {/* Stats Card */}
            <div 
              className="rounded-xl hairline elev-rest p-[17px] min-h-[61px] cursor-pointer hover:bg-muted/50 transition-colors bg-[#e2e2e2] dark:bg-[#212121]"
              data-testid="card-stats"
              onClick={() => openOverlay('/stats', <StatsPage />)}
            >
              <div className="h-full flex flex-col items-center justify-center">
                <BarChart3 className="w-8 h-8 text-blue-500 mb-[10px]" />
                <p className="text-xs font-medium">Stats</p>
              </div>
            </div>

            {/* Standings Card */}
            <div 
              className="rounded-xl hairline elev-rest p-[17px] min-h-[61px] cursor-pointer hover:bg-muted/50 transition-colors bg-[#e2e2e2] dark:bg-[#212121]"
              data-testid="card-standings"
              onClick={() => {
                setShowStandingsModal(true);
              }}
            >
              <div className="h-full flex flex-col items-center justify-center">
                <Award className="w-8 h-8 text-blue-500 mb-[10px]" />
                <p className="text-xs font-medium">Standings</p>
              </div>
            </div>
          </div>
        </div>
        )}
        {/* Tournament-focused section when tournament is selected */}
        {selectedType === 'tournament' && selectedTournament && !primaryTeam && (
          <div className="px-6 mb-6">
            {selectedTournamentDetail?.accessState === 'pending' ? (
              // Approved participant whose access window has not yet opened —
              // show a live countdown that polls every 30s and auto-swaps to
              // the View Bracket card the moment the window flips open. We
              // override the component's default min-h-screen so it fits
              // naturally inside the mobile dashboard layout instead of
              // taking over the viewport.
              (<div className="[&>div]:min-h-0 [&>div]:py-0">
                <TournamentCountdown
                  tournamentId={selectedTournament.id}
                  name={selectedTournamentDetail.name || selectedTournament.name}
                  logoUrl={selectedTournamentDetail.logoUrl}
                  accessStartDate={selectedTournamentDetail.accessStartDate}
                />
              </div>)
            ) : (
              <div className="rounded-xl hairline elev-rest p-4 bg-[#e2e2e2] dark:bg-[#212121]">
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
            )}
          </div>
        )}
        {/* Quick Stats — left: Games Left (team) or Scorekeeper (stat manager); right: Alerts */}
        {(primaryTeam || hasStatManagerAccess()) && (
          <div className="px-6 mb-2">
            <div className="grid grid-cols-2 gap-4">
              {/* Left column */}
              {primaryTeam ? (
                <div className="rounded-xl hairline elev-rest p-4 pt-[2px] pb-[2px] pl-[10px] pr-[10px] bg-[#e2e2e2] dark:bg-[#212121]" data-testid="card-games-stat">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${primaryTeam?.logoUrl ? 'bg-transparent' : 'bg-primary'}`}>
                      {primaryTeam?.logoUrl ? (
                        <img 
                          src={getImageUrl(primaryTeam.logoUrl) || ''} 
                          alt={`${primaryTeam.name} logo`}
                          className="w-full h-full rounded-lg object-cover bg-transparent"
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
              ) : (
                <div className="rounded-xl hairline elev-rest pt-[2px] pb-[2px] pl-[10px] pr-[10px] bg-[#e2e2e2] dark:bg-[#212121]" data-testid="card-scorekeeper-stat">
                  <button
                    onClick={() => navigate('/scorekeeper')}
                    className="w-full h-full flex items-center gap-3 rounded-xl"
                    data-testid="button-scorekeeper-link"
                  >
                    <div className="w-10 h-10 bg-red-500 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Clipboard className="w-5 h-5 text-white" />
                    </div>
                    <div className="text-left">
                      <p className="text-[16px] text-[#212121]">Scorekeeper</p>
                    </div>
                  </button>
                </div>
              )}

              {/* Right column — Alerts, always visible */}
              {effectiveLeagueId && (
                <div className="rounded-xl hairline elev-rest bg-[#e2e2e2] dark:bg-[#212121]">
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
        {/* Needs Attention Section - Show for leagues and league teams */}
        {effectiveLeagueId && (
          <NeedsAttentionTasks 
            leagueId={effectiveLeagueId} 
            onNavigate={navigate}
          />
        )}
        {/* Upcoming Games — hidden while a pre-window tournament countdown
            is active so the player only sees the timer above. */}
        {!isTournamentCountdownActive && (
        <div className="px-6 mt-0 mb-[8px]">
          {/* Row 1: title + add button */}
          <div className="flex gap-2 items-center mb-2">
            <h2 className="text-sm font-semibold" data-testid="text-schedule-title">Schedule</h2>
            <Button
              onClick={() => setShowAddEventDialog(true)}
              className="w-[25.6px] h-[25.6px] p-0 bg-blue-500 hover:bg-blue-600 text-white rounded-full"
              data-testid="button-add-event"
            >
              <Plus className="w-[12.8px] h-[12.8px]" />
            </Button>
          </div>
          {/* Row 2: scope toggle | list/calendar toggle + view all */}
          <div className="flex items-center justify-between gap-2 mb-[4px]">
            {/* My Team / League scope toggle */}
            <div
              className="grid grid-cols-2 items-center rounded-md p-0.5 bg-muted text-xs w-[140px]"
              role="tablist"
              aria-label="Schedule scope"
            >
              <button
                type="button"
                onClick={() => setScheduleScope('team')}
                className={`px-2 py-0.5 rounded transition-colors text-center whitespace-nowrap ${
                  scheduleScope === 'team'
                    ? 'bg-blue-500 text-white shadow-sm'
                    : 'text-muted-foreground'
                }`}
                aria-pressed={scheduleScope === 'team'}
                data-testid="schedule-scope-team"
              >
                My Team
              </button>
              <button
                type="button"
                onClick={() => setScheduleScope('league')}
                className={`px-2 py-0.5 rounded transition-colors text-center whitespace-nowrap ${
                  scheduleScope === 'league'
                    ? 'bg-blue-500 text-white shadow-sm'
                    : 'text-muted-foreground'
                }`}
                aria-pressed={scheduleScope === 'league'}
                data-testid="schedule-scope-league"
              >
                League
              </button>
            </div>
            <div className="flex items-center gap-2">
              <div
                className="grid grid-cols-2 items-center rounded-md p-0.5 bg-muted text-xs w-[140px]"
                role="tablist"
                aria-label="Schedule view"
              >
                <button
                  type="button"
                  onClick={() => setScheduleView('list')}
                  className={`px-2 py-0.5 rounded transition-colors text-center ${
                    scheduleView === 'list'
                      ? 'bg-blue-500 text-white shadow-sm'
                      : 'text-muted-foreground'
                  }`}
                  aria-pressed={scheduleView === 'list'}
                  data-testid="mobile-schedule-toggle-list"
                >
                  List
                </button>
                <button
                  type="button"
                  onClick={() => setScheduleView('calendar')}
                  className={`px-2 py-0.5 rounded transition-colors text-center ${
                    scheduleView === 'calendar'
                      ? 'bg-blue-500 text-white shadow-sm'
                      : 'text-muted-foreground'
                  }`}
                  aria-pressed={scheduleView === 'calendar'}
                  data-testid="mobile-schedule-toggle-calendar"
                >
                  Calendar
                </button>
              </div>
              <button
                onClick={() => navigate('/calendar')}
                className="text-primary text-sm"
                data-testid="button-view-all-games"
              >
                View All
              </button>
            </div>
          </div>
          
          {gamesLoading || invitesLoading || requestsLoading || remindersLoading || visibleTournamentsLoading ? (
            <div className="bg-card rounded-xl hairline elev-rest p-4 animate-pulse" data-testid="loading-upcoming-games">
              <div className="h-16 bg-muted rounded"></div>
            </div>
          ) : scheduleView === 'calendar' ? (() => {
            // In league scope, pass the full league game set; in team scope apply
            // the usual eligibility filter (scrimmages, user-team games, subs, tournaments).
            let calendarGames: any[];
            if (scheduleScope === 'league') {
              calendarGames = Array.isArray(scheduleGames) ? (scheduleGames as any[]) : [];
            } else {
              const userTeamIds = Array.isArray(userTeams) ? userTeams.map((t: any) => t.id) : [];
              calendarGames = Array.isArray(scheduleGames)
                ? (scheduleGames as any[]).filter((game: any) => {
                    if (game.isScrimmage) return true;
                    const isOnTeam =
                      userTeamIds.includes(game.homeTeamId) ||
                      userTeamIds.includes(game.awayTeamId);
                    const isTournamentMatchForUser = game.isTournamentMatch === true;
                    const isSubstitute = game.isSubstitute === true;
                    return isOnTeam || isSubstitute || isTournamentMatchForUser;
                  })
                : [];
            }
            // Mirror the tournament scope filter the list-cards apply
            const filteredTournaments = Array.isArray(visibleTournaments)
              ? (visibleTournaments as any[]).filter((tournament: any) => {
                  if (selectedType === 'team' && selectedId) {
                    const teamsArray = Array.isArray(userTeamsAll) ? userTeamsAll : [];
                    const team = teamsArray.find((t: any) => t.id === selectedId);
                    if (!team?.leagueId) return false;
                    return tournament.leagueId === team.leagueId;
                  }
                  if (selectedType === 'league' && selectedId) {
                    return tournament.leagueId === selectedId;
                  }
                  if (selectedType === 'tournament') {
                    return tournament.id === selectedId;
                  }
                  return true;
                })
              : [];
            return (
              <ScheduleCalendarMobile
                scrimmageInvites={scheduleScope === 'league' ? [] : (Array.isArray(scrimmageInvites) ? scrimmageInvites : [])}
                scrimmageRequests={scheduleScope === 'league' ? [] : (Array.isArray(scrimmageRequests) ? scrimmageRequests : [])}
                personalReminders={scheduleScope === 'league' ? [] : (Array.isArray(personalReminders) ? personalReminders : [])}
                teamEvents={Array.isArray(teamEvents) ? teamEvents : []}
                upcomingGames={calendarGames}
                visibleTournaments={filteredTournaments}
                primaryTeam={primaryTeam}
              />
            );
          })() : (() => {
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
            const hasGames = Array.isArray(scheduleGames) && (scheduleGames as any[]).filter((g: any) => isYesterdayOrLater(g.scheduledAt)).length > 0;
            const hasInvites = scheduleScope === 'team' && Array.isArray(scrimmageInvites) && scrimmageInvites.filter((i: any) => isYesterdayOrLater(i.dateTime)).length > 0;
            const hasRequests = scheduleScope === 'team' && Array.isArray(scrimmageRequests) && scrimmageRequests.filter((r: any) => r.status === 'approved' && r.scrimmage && isYesterdayOrLater(r.scrimmage.dateTime)).length > 0;
            const hasReminders = scheduleScope === 'team' && Array.isArray(personalReminders) && personalReminders.filter((r: any) => !r.isCompleted && isYesterdayOrLater(r.scheduledAt)).length > 0;
            return hasGames || hasInvites || hasRequests || hasReminders || (Array.isArray(visibleTournaments) && visibleTournaments.length > 0);
          })() ? (
            <div className="space-y-3">
              {/* First show scrimmage invites (yesterday and future - visible until day after) */}
              {scheduleScope === 'team' && Array.isArray(scrimmageInvites) && scrimmageInvites.filter((invite: any) => {
                const eventDate = new Date(invite.dateTime);
                const yesterday = new Date();
                yesterday.setDate(yesterday.getDate() - 1);
                yesterday.setHours(0, 0, 0, 0);
                const eventDateOnly = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate());
                return eventDateOnly >= yesterday;
              }).map((invite: any) => (
                <div 
                  key={`invite-${invite.id}`}
                  className="rounded-xl border border-yellow-500/50 elev-rest relative pt-[5px] pb-[5px] pl-[20px] pr-[20px] bg-[#e2e2e2] dark:bg-[#212121] cursor-pointer hover:border-yellow-500 transition-colors"
                  data-testid={`card-scrimmage-invite-${invite.id}`}
                  onClick={() => {
                    setPageTransitionDirection('up');
                    navigate(`/scrimmage/${invite.id}`);
                  }}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-yellow-500 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Trophy className="w-6 h-6 text-black" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold truncate" data-testid={`text-invite-title-${invite.id}`}>
                          {invite.title}
                        </h3>
                        <span className="text-xs bg-yellow-500 text-black px-2 py-0.5 rounded flex-shrink-0">Invite</span>
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
                    <div className="flex gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => scrimmageCheckInMutation.mutate(invite.id)}
                        disabled={scrimmageCheckInMutation.isPending || scrimmageDeclineMutation.isPending}
                        className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors font-semibold text-sm disabled:opacity-50"
                        data-testid={`button-rsvp-in-${invite.id}`}
                      >
                        In
                      </button>
                      <button
                        onClick={() => scrimmageDeclineMutation.mutate(invite.id)}
                        disabled={scrimmageCheckInMutation.isPending || scrimmageDeclineMutation.isPending}
                        className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors font-semibold text-sm disabled:opacity-50"
                        data-testid={`button-rsvp-out-${invite.id}`}
                      >
                        Out
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              
              {/* Show approved scrimmages (yesterday and future - visible until day after) */}
              {scheduleScope === 'team' && Array.isArray(scrimmageRequests) && scrimmageRequests
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
                      className="rounded-xl hairline elev-rest p-4 relative cursor-pointer hover:bg-muted/50 transition-colors pt-[5px] pb-[5px] pl-[20px] pr-[20px] bg-[#e2e2e2] dark:bg-[#212121]" 
                      onClick={() => navigate(`/scrimmage/${scrimmage.id}`)}
                      data-testid={`card-scrimmage-${scrimmage.id}`}
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-primary rounded-lg flex items-center justify-center">
                          <Trophy className="w-6 h-6 text-primary-foreground" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold" data-testid={`text-scrimmage-title-${scrimmage.id}`}>
                              {scrimmage.title}
                            </h3>
                            <span className="text-xs bg-orange-500 text-white px-2 py-0.5 rounded flex-shrink-0">Scrimmage</span>
                          </div>
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
              {scheduleScope === 'team' && Array.isArray(personalReminders) && personalReminders
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
                .map((reminder: any) => {
                  const isDismissing = dismissingReminders.has(reminder.id);
                  return (
                    <div 
                      key={`reminder-${reminder.id}`}
                      className={`transition-all duration-300 ease-out ${isDismissing ? 'opacity-0 scale-95' : 'opacity-100 scale-100'}`}
                      style={{ 
                        maxHeight: isDismissing ? '0px' : '200px', 
                        marginTop: isDismissing ? '0px' : undefined,
                        marginBottom: isDismissing ? '-12px' : undefined,
                        padding: isDismissing ? '0px' : undefined,
                        overflow: 'hidden',
                        transform: isDismissing ? 'translateX(-100%)' : 'translateX(0)',
                      }}
                    >
                      <div 
                        className="rounded-xl border border-green-200 dark:border-green-800 elev-rest p-4 relative pt-[5px] pb-[5px] pl-[20px] pr-[20px] bg-[#e2e2e2] dark:bg-[#212121]"
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
                            handleDismissReminder(reminder.id);
                          }}
                          className="px-3 py-1 text-sm hover:bg-muted rounded-lg transition-colors text-muted-foreground hover:text-foreground"
                          data-testid={`button-dismiss-reminder-${reminder.id}`}
                          disabled={isDismissing || deleteReminderMutation.isPending}
                        >
                          Dismiss
                        </button>
                      </div>
                      </div>
                    </div>
                  );
                })}
              
              {/* Show team events (general events only — scrimmages handled above) */}
              {Array.isArray(teamEvents) && teamEvents
                .filter((event: any) => {
                  if (event.eventType === 'scrimmage') return false;
                  const eventDate = new Date(event.scheduledAt);
                  const yesterday = new Date();
                  yesterday.setDate(yesterday.getDate() - 1);
                  yesterday.setHours(0, 0, 0, 0);
                  const eventDateOnly = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate());
                  return eventDateOnly >= yesterday;
                })
                .sort((a: any, b: any) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())
                .slice(0, 5)
                .map((event: any) => (
                  <div 
                    key={`team-event-${event.id}`}
                    className={`rounded-xl border elev-rest p-4 relative cursor-pointer hover:bg-muted/50 transition-colors pt-[5px] pb-[5px] pl-[20px] pr-[20px] bg-[#e2e2e2] dark:bg-[#212121] ${
                      event.eventType === 'scrimmage' 
                        ? 'border-orange-200 dark:border-orange-800' 
                        : 'border-blue-200 dark:border-blue-800'
                    }`}
                    onClick={() => navigate(`/team-event/${event.id}`)}
                    data-testid={`card-team-event-${event.id}`}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                        event.eventType === 'scrimmage' ? 'bg-orange-500' : 'bg-blue-500'
                      }`}>
                        {event.eventType === 'scrimmage' ? (
                          <Trophy className="w-6 h-6 text-white" />
                        ) : (
                          <Calendar className="w-6 h-6 text-white" />
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold" data-testid={`text-team-event-title-${event.id}`}>
                            {event.title}
                          </h3>
                          <span className={`text-xs text-white px-2 py-0.5 rounded ${
                            event.eventType === 'scrimmage' ? 'bg-orange-500' : 'bg-blue-500'
                          }`}>
                            {event.eventType === 'scrimmage' ? 'Scrimmage' : 'Event'}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground" data-testid={`text-team-event-time-${event.id}`}>
                          {format(new Date(event.scheduledAt), 'MMM d • h:mm a')}
                        </p>
                        {event.teamName && (
                          <p className="text-xs text-muted-foreground" data-testid={`text-team-event-team-${event.id}`}>
                            {event.teamName}
                          </p>
                        )}
                        {event.location && (
                          <p className="text-xs text-muted-foreground" data-testid={`text-team-event-location-${event.id}`}>
                            {event.location}
                          </p>
                        )}
                      </div>
                      {event.canEdit && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingTeamEvent(event);
                          }}
                          className="px-3 py-1 text-sm hover:bg-muted rounded-lg transition-colors text-muted-foreground hover:text-foreground"
                          data-testid={`button-edit-team-event-${event.id}`}
                        >
                          Edit
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              
              {/* Show visible tournament brackets - only for the selected team's league or selected league */}
              {Array.isArray(visibleTournaments) && visibleTournaments
                .filter((tournament: any) => {
                  // If a team is selected, only show brackets from that team's league
                  if (selectedType === 'team' && selectedId) {
                    // Ensure userTeamsAll is an array before using find
                    const teamsArray = Array.isArray(userTeamsAll) ? userTeamsAll : [];
                    const team = teamsArray.find((t: any) => t.id === selectedId);
                    // If team has no league (independent), don't show any brackets
                    if (!team?.leagueId) return false;
                    // Only show brackets from the team's league
                    return tournament.leagueId === team.leagueId;
                  }
                  // If a league is selected, only show brackets from that league
                  if (selectedType === 'league' && selectedId) {
                    return tournament.leagueId === selectedId;
                  }
                  // If a tournament is selected, show its bracket
                  if (selectedType === 'tournament') {
                    return tournament.id === selectedId;
                  }
                  return true;
                })
                .map((tournament: any) => (
                <div 
                  key={`bracket-${tournament.id}`}
                  className="rounded-xl hairline p-4 relative cursor-pointer hover:bg-muted/50 transition-colors pt-[5px] pb-[5px] pl-[20px] pr-[20px] bg-[#e2e2e2] dark:bg-[#212121] bracket-glow"
                  onClick={() => navigate(`/tournaments/${tournament.id}?tab=bracket&readonly=true`)}
                  data-testid={`card-bracket-${tournament.id}`}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-lg flex items-center justify-center bg-[#FFD700]">
                      <Trophy className="w-6 h-6 text-black" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold" data-testid={`text-bracket-name-${tournament.id}`}>
                          {tournament.name}
                        </h3>
                        <span className="text-xs px-2 py-0.5 rounded text-[#000000] bg-[#ffd700]">Bracket</span>
                      </div>
                      <p className="text-sm text-muted-foreground" data-testid={`text-bracket-league-${tournament.id}`}>
                        {tournament.leagueName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        View Bracket
                      </p>
                    </div>
                  </div>
                </div>
              ))}
              
              {/* Then show regular games (yesterday and future - visible until day after) */}
              {(scheduleGames as any[])
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
                  // In league scope show all games in the league without team filtering
                  if (scheduleScope === 'league') {
                    return true;
                  }
                  // Always show scrimmages (user is already approved)
                  if (game.isScrimmage) {
                    return true;
                  }
                  // For regular games, ensure we only show games for teams the user is currently on
                  const userTeamIds = Array.isArray(userTeams) ? userTeams.map((team: any) => team.id) : [];
                  const isOnTeam = userTeamIds.includes(game.homeTeamId) || userTeamIds.includes(game.awayTeamId);
                  // Tournament matches: trust the backend filter (admin/creator OR
                  // approved participant whose team plays in the match). The
                  // server already restricts the upcoming-games response to
                  // matches the user should see, so we don't re-filter by team
                  // name here — that previously hid admin-only matches when the
                  // tournament creator wasn't rostered on either team.
                  const isTournamentMatchForUser = game.isTournamentMatch === true;
                  // Also show games where user is an approved substitute (marked by backend)
                  const isSubstitute = game.isSubstitute === true;
                  return isOnTeam || isSubstitute || isTournamentMatchForUser;
                })
                .slice(0, 5).map((game: any) => (
                <div 
                  key={game.id} 
                  className="rounded-xl hairline elev-rest p-4 relative cursor-pointer hover:bg-muted/50 transition-colors pt-[5px] pb-[5px] pl-[20px] pr-[20px] bg-[#e2e2e2] dark:bg-[#212121]" 
                  onClick={() => navigate(`/game/${game.id}`)}
                  data-testid={`card-game-${game.id}`}
                >
                  <div className="flex items-center gap-4 bg-[212121]">
                    <div className={`w-12 h-12 rounded-lg flex items-center justify-center relative ${(() => {
                        const isHomeTeamUser = game.isTournamentMatch 
                          ? game.homeTeam?.name?.toLowerCase() === primaryTeam?.name?.toLowerCase()
                          : game.homeTeam?.id === primaryTeam?.id;
                        const opponentTeam = isHomeTeamUser ? game.awayTeam : game.homeTeam;
                        return opponentTeam?.logoUrl ? 'bg-transparent' : 'bg-primary';
                      })()}`}>
                      {(() => {
                        // For tournament matches, compare by name since IDs may be null
                        const isHomeTeamUser = game.isTournamentMatch 
                          ? game.homeTeam?.name?.toLowerCase() === primaryTeam?.name?.toLowerCase()
                          : game.homeTeam?.id === primaryTeam?.id;
                        const opponentTeam = isHomeTeamUser ? game.awayTeam : game.homeTeam;
                        return opponentTeam?.logoUrl ? (
                          <img 
                            src={getImageUrl(opponentTeam.logoUrl) || ''} 
                            alt={`${opponentTeam.name} logo`}
                            className="w-full h-full rounded-lg object-cover bg-transparent"
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
                          {game.isScrimmage ? game.scrimmageTitle : game.isTournamentMatch ? (
                            `vs ${game.homeTeam?.name?.toLowerCase() === primaryTeam?.name?.toLowerCase() ? game.awayTeam?.name : game.homeTeam?.name}`
                          ) : (
                            `vs ${game.homeTeam?.id === primaryTeam?.id ? game.awayTeam?.name : game.homeTeam?.name}`
                          )}
                        </h3>
                        {game.isScrimmage && (
                          <span className="text-xs bg-orange-500 text-white px-2 py-0.5 rounded font-medium" data-testid={`badge-scrimmage-${game.id}`}>
                            Scrimmage
                          </span>
                        )}
                        {!game.isScrimmage && !game.isTournamentMatch && (
                          <span className="text-xs bg-primary text-white px-2 py-0.5 rounded font-medium" data-testid={`badge-game-${game.id}`}>
                            Game
                          </span>
                        )}
                        {game.isSubstitute === true && (
                          <span className="text-xs bg-yellow-500 text-white px-2 py-0.5 rounded font-medium" data-testid={`badge-sub-${game.id}`}>
                            SUB
                          </span>
                        )}
                        {game.isTournamentMatch && (
                          <span className="text-xs bg-[#ffd700] text-black px-2 py-0.5 rounded font-medium" data-testid={`badge-tournament-${game.id}`}>
                            Playoff
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
                      <ChevronRight 
                        className="w-8 h-8 text-primary ml-auto"
                        data-testid={`icon-view-details-${game.id}`}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-card rounded-xl hairline elev-rest p-8 text-center" data-testid="empty-upcoming-games">
              <Clock className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No upcoming games scheduled</p>
            </div>
          )}
        </div>
        )}
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
        {/* Mobile-only spacer so the HPIB banner + bottom nav don't cover the
            search buttons above. Banner sits ~80px above the bottom nav and is
            up to 128px tall; with the new lifted active-tab pill that floats
            above the nav we add a touch more cushion so nothing scrolls
            underneath the lifted icon. */}
        <div className="h-72 md:hidden" aria-hidden="true" />
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
        seasonId={
          selectedType === 'team'
            ? (selectedTeam?.seasonId ?? null)
            : selectedType === 'league'
              ? prefetchSeasonId
              : null
        }
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
        <DialogContent className="w-[calc(100vw-2rem)] max-w-[425px] bg-[#212121] text-white" data-testid="dialog-add-event">
          <DialogHeader>
            <DialogTitle className="text-white" data-testid="text-add-event-title">Add Event</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-4">
            <Button
              onClick={() => {
                setEventType('reminder');
                setShowAddEventDialog(false);
              }}
              className="h-20 flex items-center justify-center text-lg font-semibold text-white hover:bg-blue-600 bg-blue-500 rounded-xl text-center px-3"
              data-testid="button-select-reminder"
            >
              Personal<br />Reminder
            </Button>
            {canScheduleGames && (
              <Button
                onClick={() => {
                  setEventType('game');
                  setShowAddEventDialog(false);
                }}
                className="h-20 flex items-center justify-center text-lg font-semibold text-white hover:bg-blue-600 bg-blue-500 rounded-xl"
                data-testid="button-select-game"
              >
                Team Game
              </Button>
            )}
            {canScheduleGames && (
              <Button
                onClick={() => {
                  setEventType('generalEvent');
                  setShowAddEventDialog(false);
                }}
                className="h-20 flex items-center justify-center text-lg font-semibold text-white hover:bg-blue-600 bg-blue-500 rounded-xl"
                data-testid="button-select-general-event"
              >
                General Event
              </Button>
            )}
            {canScheduleGames && (
              <Button
                onClick={() => {
                  setEventType('scrimmage');
                  setShowAddEventDialog(false);
                }}
                className="h-20 flex items-center justify-center text-lg font-semibold text-white hover:bg-blue-600 bg-blue-500 rounded-xl"
                data-testid="button-select-scrimmage"
              >
                Scrimmage
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
      {/* Personal Reminder Form Dialog */}
      <Dialog open={eventType === 'reminder'} onOpenChange={(open) => { if (!open) { setEventType(null); setReminderPhotoFile(null); setReminderPhotoPreview(null); } }}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-[500px] max-h-[90vh] overflow-y-auto" data-testid="dialog-create-reminder">
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
              <div className="space-y-2">
                <label className="text-sm font-medium leading-none">Cover Photo (Optional)</label>
                <input
                  ref={reminderPhotoRef}
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  className="hidden"
                  onChange={handleReminderPhotoChange}
                />
                {reminderPhotoPreview ? (
                  <div className="relative w-full overflow-hidden rounded-lg border border-border" style={{ aspectRatio: '16/9' }}>
                    <img src={reminderPhotoPreview} alt="Cover preview" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => { setReminderPhotoFile(null); setReminderPhotoPreview(null); if (reminderPhotoRef.current) reminderPhotoRef.current.value = ''; }}
                      className="absolute top-2 right-2 bg-black/60 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-black/80"
                    >✕</button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => reminderPhotoRef.current?.click()}
                    className="w-full border-2 border-dashed border-border rounded-lg py-6 text-sm text-muted-foreground hover:border-primary hover:text-primary transition-colors flex flex-col items-center gap-1"
                  >
                    <Camera className="w-5 h-5" />
                    <span>Tap to add a cover photo</span>
                  </button>
                )}
              </div>
              <div className="flex gap-2 justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => { setEventType(null); setReminderPhotoFile(null); setReminderPhotoPreview(null); }}
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
        <DialogContent className="w-[calc(100vw-2rem)] max-w-[500px] max-h-[90vh] overflow-y-auto" data-testid="dialog-create-game">
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
                    <FormLabel>Rink (Optional)</FormLabel>
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
      {/* General Event Form Dialog */}
      <Dialog open={eventType === 'generalEvent'} onOpenChange={(open) => { if (!open) { setEventType(null); setEventPhotoFile(null); setEventPhotoPreview(null); } }}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-[500px] max-h-[90vh] overflow-y-auto" data-testid="dialog-create-general-event">
          <DialogHeader>
            <DialogTitle data-testid="text-create-general-event-title">Create Team Event</DialogTitle>
          </DialogHeader>
          <Form {...generalEventForm}>
            <form onSubmit={generalEventForm.handleSubmit((data) => createGeneralEventMutation.mutate(data))} className="space-y-4">
              <FormField
                control={generalEventForm.control}
                name="teamId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Team</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-general-event-team">
                          <SelectValue placeholder="Select your team" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {Array.isArray(userTeams) && userTeams.map((team: any) => (
                          <SelectItem key={team.id} value={team.id} data-testid={`option-general-event-team-${team.id}`}>
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
                control={generalEventForm.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Event Title</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Team Pizza Party, Team Meeting" {...field} data-testid="input-general-event-title" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={generalEventForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description (Optional)</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Add event details..." {...field} data-testid="input-general-event-description" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={generalEventForm.control}
                name="scheduledAt"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start Date & Time</FormLabel>
                    <FormControl>
                      <Input type="datetime-local" {...field} data-testid="input-general-event-datetime" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={generalEventForm.control}
                name="endTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>End Time (Optional)</FormLabel>
                    <FormControl>
                      <Input type="datetime-local" {...field} data-testid="input-general-event-endtime" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={generalEventForm.control}
                name="location"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Location (Optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="Event location" {...field} data-testid="input-general-event-location" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="space-y-2">
                <label className="text-sm font-medium leading-none">Cover Photo (Optional)</label>
                <input
                  ref={eventPhotoRef}
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  className="hidden"
                  onChange={handleEventPhotoChange}
                />
                {eventPhotoPreview ? (
                  <div className="relative w-full overflow-hidden rounded-lg border border-border" style={{ aspectRatio: '16/9' }}>
                    <img src={eventPhotoPreview} alt="Cover preview" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => { setEventPhotoFile(null); setEventPhotoPreview(null); if (eventPhotoRef.current) eventPhotoRef.current.value = ''; }}
                      className="absolute top-2 right-2 bg-black/60 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-black/80"
                    >✕</button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => eventPhotoRef.current?.click()}
                    className="w-full border-2 border-dashed border-border rounded-lg py-6 text-sm text-muted-foreground hover:border-primary hover:text-primary transition-colors flex flex-col items-center gap-1"
                  >
                    <Camera className="w-5 h-5" />
                    <span>Tap to add a cover photo</span>
                  </button>
                )}
              </div>
              <div className="flex gap-2 justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => { setEventType(null); setEventPhotoFile(null); setEventPhotoPreview(null); }}
                  data-testid="button-cancel-general-event"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createGeneralEventMutation.isPending}
                  data-testid="button-submit-general-event"
                >
                  {createGeneralEventMutation.isPending ? "Creating..." : "Create Event"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
      {/* Scrimmage Form Dialog */}
      <Dialog open={eventType === 'scrimmage'} onOpenChange={(open) => !open && setEventType(null)}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-[500px] max-h-[90vh] overflow-y-auto" data-testid="dialog-create-scrimmage">
          <DialogHeader>
            <DialogTitle data-testid="text-create-scrimmage-title">Create Scrimmage</DialogTitle>
          </DialogHeader>
          <Form {...scrimmageEventForm}>
            <form onSubmit={scrimmageEventForm.handleSubmit((data) => createScrimmageEventMutation.mutate(data))} className="space-y-4">
              <FormField
                control={scrimmageEventForm.control}
                name="teamId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Team</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-scrimmage-team">
                          <SelectValue placeholder="Select your team" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {Array.isArray(userTeamsAll) && userTeamsAll.map((team: any) => (
                          <SelectItem key={team.id} value={team.id} data-testid={`option-scrimmage-team-${team.id}`}>
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
                control={scrimmageEventForm.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Scrimmage Title</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Practice Game, Friendly Match" {...field} data-testid="input-scrimmage-title" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={scrimmageEventForm.control}
                name="isInternalScrimmage"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                    <FormControl>
                      <input
                        type="checkbox"
                        checked={field.value}
                        onChange={field.onChange}
                        className="h-5 w-5 rounded border-gray-300 accent-primary mt-0.5"
                        data-testid="checkbox-scrimmage-internal"
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel className="font-medium">Just my team</FormLabel>
                      <p className="text-sm text-muted-foreground">
                        {field.value ? "This is a team practice or internal scrimmage" : "Uncheck to add an opponent team"}
                      </p>
                    </div>
                  </FormItem>
                )}
              />
              {!scrimmageEventForm.watch('isInternalScrimmage') && (
                <FormField
                  control={scrimmageEventForm.control}
                  name="opponentName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Opponent Team</FormLabel>
                      <FormControl>
                        <Input placeholder="Opponent team name" {...field} data-testid="input-scrimmage-opponent" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              <FormField
                control={scrimmageEventForm.control}
                name="scheduledAt"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start Date & Time</FormLabel>
                    <FormControl>
                      <Input type="datetime-local" {...field} data-testid="input-scrimmage-datetime" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={scrimmageEventForm.control}
                name="endTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>End Time (Optional)</FormLabel>
                    <FormControl>
                      <Input type="datetime-local" {...field} data-testid="input-scrimmage-endtime" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={scrimmageEventForm.control}
                name="location"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Location (Optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="Scrimmage location" {...field} data-testid="input-scrimmage-location" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={scrimmageEventForm.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes (Optional)</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Additional information..." {...field} data-testid="input-scrimmage-notes" />
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
                  data-testid="button-cancel-scrimmage"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createScrimmageEventMutation.isPending}
                  data-testid="button-submit-scrimmage"
                >
                  {createScrimmageEventMutation.isPending ? "Creating..." : "Create Scrimmage"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
      {/* Edit Team Event Dialog */}
      <Dialog open={!!editingTeamEvent} onOpenChange={(open) => !open && setEditingTeamEvent(null)}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-[500px] max-h-[90vh] overflow-y-auto" data-testid="dialog-edit-team-event">
          <DialogHeader>
            <DialogTitle data-testid="text-edit-team-event-title">
              Edit {editingTeamEvent?.eventType === 'scrimmage' ? 'Scrimmage' : 'Team Event'}
            </DialogTitle>
          </DialogHeader>
          {editingTeamEvent && (
            <form 
              onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.target as HTMLFormElement);
                const title = formData.get('title') as string;
                const scheduledAt = formData.get('scheduledAt') as string;
                const endTimeVal = formData.get('endTime') as string;
                const locationVal = formData.get('location') as string;
                
                const data: any = {
                  eventType: editingTeamEvent.eventType,
                  title: title,
                  scheduledAt: scheduledAt,
                };
                
                // Only include optional fields if they have values
                if (editingTeamEvent.eventType !== 'scrimmage') {
                  const descriptionVal = formData.get('description') as string;
                  if (descriptionVal) data.description = descriptionVal;
                }
                if (endTimeVal) data.endTime = endTimeVal;
                if (locationVal) data.location = locationVal;
                
                if (editingTeamEvent.eventType === 'scrimmage') {
                  const opponentVal = formData.get('opponentName') as string;
                  const notesVal = formData.get('notes') as string;
                  if (opponentVal) data.opponentName = opponentVal;
                  if (notesVal) data.notes = notesVal;
                  data.isInternalScrimmage = editingTeamEvent.isInternalScrimmage;
                }
                updateTeamEventMutation.mutate({ id: editingTeamEvent.id, data });
              }} 
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label htmlFor="edit-title">Title</Label>
                <Input 
                  id="edit-title" 
                  name="title" 
                  defaultValue={editingTeamEvent.title}
                  placeholder="Event title"
                  required
                  data-testid="input-edit-team-event-title"
                />
              </div>
              {editingTeamEvent.eventType !== 'scrimmage' && (
                <div className="space-y-2">
                  <Label htmlFor="edit-description">Description (Optional)</Label>
                  <Textarea 
                    id="edit-description" 
                    name="description" 
                    defaultValue={editingTeamEvent.description || ''}
                    placeholder="Add event details..."
                    data-testid="input-edit-team-event-description"
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="edit-scheduledAt">Start Date & Time</Label>
                <Input 
                  id="edit-scheduledAt" 
                  name="scheduledAt" 
                  type="datetime-local"
                  defaultValue={editingTeamEvent.scheduledAt?.slice(0, 16)}
                  required
                  data-testid="input-edit-team-event-datetime"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-endTime">End Time (Optional)</Label>
                <Input 
                  id="edit-endTime" 
                  name="endTime" 
                  type="datetime-local"
                  defaultValue={editingTeamEvent.endTime?.slice(0, 16) || ''}
                  data-testid="input-edit-team-event-endtime"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-location">Location (Optional)</Label>
                <Input 
                  id="edit-location" 
                  name="location" 
                  defaultValue={editingTeamEvent.location || ''}
                  placeholder="Event location"
                  data-testid="input-edit-team-event-location"
                />
              </div>
              {editingTeamEvent.eventType === 'scrimmage' && !editingTeamEvent.isInternalScrimmage && (
                <div className="space-y-2">
                  <Label htmlFor="edit-opponentName">Opponent Team</Label>
                  <Input 
                    id="edit-opponentName" 
                    name="opponentName" 
                    defaultValue={editingTeamEvent.opponentName || ''}
                    placeholder="Opponent team name"
                    data-testid="input-edit-scrimmage-opponent"
                  />
                </div>
              )}
              {editingTeamEvent.eventType === 'scrimmage' && (
                <div className="space-y-2">
                  <Label htmlFor="edit-notes">Notes (Optional)</Label>
                  <Textarea 
                    id="edit-notes" 
                    name="notes" 
                    defaultValue={editingTeamEvent.notes || ''}
                    placeholder="Additional information..."
                    data-testid="input-edit-scrimmage-notes"
                  />
                </div>
              )}
              <div className="flex gap-2 justify-between">
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => {
                    if (confirm('Are you sure you want to delete this event?')) {
                      deleteTeamEventMutation.mutate(editingTeamEvent.id);
                    }
                  }}
                  disabled={deleteTeamEventMutation.isPending}
                  data-testid="button-delete-team-event"
                >
                  {deleteTeamEventMutation.isPending ? "Deleting..." : "Delete"}
                </Button>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setEditingTeamEvent(null)}
                    data-testid="button-cancel-edit-team-event"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={updateTeamEventMutation.isPending}
                    data-testid="button-submit-edit-team-event"
                  >
                    {updateTeamEventMutation.isPending ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
