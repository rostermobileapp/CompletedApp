// 🚨 SUBSCRIPTION SYSTEM REMOVED - ALL FEATURES FREE! 🚨
// import { SubscriptionGate } from '@/components/SubscriptionGate'; // DELETED
// import { useSubscription } from '@/context/SubscriptionContext'; // REMOVED
import { useQuery, useMutation } from '@tanstack/react-query';
import { MessageCircle, Users, Edit, Send, ArrowLeft, MoreVertical, Phone, Video, Info, Paperclip, X, File, Image, Search, UserPlus, Trash2, Crown, Smile, LogOut, BarChart3, Plus, Minus, DollarSign, CheckCircle } from 'lucide-react';
import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useLocation } from 'wouter';
import { setPageTransitionDirection } from '@/components/PageTransition';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient, getImageUrl } from '@/lib/queryClient';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/context/SubscriptionContext';
import { useDashboardSelection } from '@/hooks/useDashboardSelection';
import { League, ChatPoll, ChatPollVote, Team } from '@shared/schema';

import { MediaGallery } from '@/components/MediaGallery';
import GifSearchModal from '@/components/GifSearchModal';
import { FeatureLockOverlay } from '@/components/FeatureLockOverlay';
import { ClickableAvatar } from '@/components/ClickableAvatar';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  messageType: 'text' | 'image' | 'gif' | 'file' | 'poll';
  sentAt: string;
  replyToId?: string;
  attachments: MessageAttachment[];
  readReceipts: ReadReceipt[];
}

interface MessageAttachment {
  id: string;
  messageId: string;
  fileName: string;
  fileUrl: string;
  fileType: string;
  fileSize: number;
}

interface ReadReceipt {
  id: string;
  messageId: string;
  userId: string;
  readAt: string;
}

interface Conversation {
  id: string;
  title?: string;
  type: 'direct' | 'team_group' | 'custom_group' | 'captain_only';
  leagueId?: string;
  tournamentId?: string;
  teamId?: string;
  createdBy: string;
  createdAt: string;
  participants: ConversationParticipant[];
  lastMessage?: Message;
}

interface ConversationParticipant {
  id: string;
  conversationId: string;
  userId: string;
  joinedAt: string;
  user?: {
    id: string;
    displayName: string;
    email: string;
    profileImageUrl?: string;
    firstName?: string;
    lastName?: string;
  };
}


interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  profileImageUrl?: string;
  displayFirstName?: string;
  displayLastName?: string;
  position?: string;
  jerseyNumber?: number;
  skillLevel?: string;
}

// Poll Card Component
function PollCard({ message, currentUserId }: { message: any; currentUserId: string }) {
  const [pollData, setPollData] = useState<any>(null);
  const [userVote, setUserVote] = useState<ChatPollVote | null>(null);
  const [pollResults, setPollResults] = useState<ChatPollVote[]>([]);
  const [showResults, setShowResults] = useState(false);
  const { toast } = useToast();

  // Fetch poll data for this message
  const { data: polls = [] } = useQuery<ChatPoll[]>({
    queryKey: ['/api/messages', message.id, 'polls'],
    enabled: !!message.id && message.messageType === 'poll'
  });

  const poll = polls[0]; // Assuming one poll per message

  // Fetch poll results
  const { data: pollVotesRaw } = useQuery<ChatPollVote[]>({
    queryKey: ['/api/chat-polls', poll?.id, 'results'],
    enabled: !!poll?.id
    // Real-time updates now handled via WebSocket events
  });

  // Memoize poll votes to prevent infinite re-renders and ensure it's always an array
  const pollVotes = useMemo(() => {
    return Array.isArray(pollVotesRaw) ? pollVotesRaw : [];
  }, [pollVotesRaw]);

  const voteOnPollMutation = useMutation({
    mutationFn: async ({ pollId, optionIndex }: { pollId: string; optionIndex: number }) => {
      const response = await apiRequest('POST', `/api/chat-polls/${pollId}/votes`, { optionIndex });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/chat-polls', poll?.id, 'results'] });
      toast({
        title: 'Vote recorded',
        description: 'Your vote has been recorded'
      });
    },
    onError: (error: any) => {
      console.error('Error voting on poll:', error);
      // Check if it's a duplicate vote error
      if (error?.message?.includes('already voted') || error?.status === 400) {
        toast({
          title: 'Already voted',
          description: 'You have already cast your vote on this poll',
          variant: 'destructive'
        });
        // Force refresh poll results to sync UI state
        queryClient.invalidateQueries({ queryKey: ['/api/chat-polls', poll?.id, 'results'] });
      } else {
        toast({
          title: 'Failed to vote',
          description: 'Please try again',
          variant: 'destructive'
        });
      }
    }
  });

  const closePollMutation = useMutation({
    mutationFn: async (pollId: string) => {
      const response = await apiRequest('POST', `/api/chat-polls/${pollId}/close`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/messages', message.id, 'polls'] });
      queryClient.invalidateQueries({ queryKey: ['/api/chat-polls', poll?.id, 'results'] });
      toast({
        title: 'Poll closed',
        description: 'The poll has been closed'
      });
    }
  });

  // Memoize poll status to prevent infinite re-renders
  const pollStatus = useMemo(() => poll?.status, [poll?.id, poll?.status]);
  
  useEffect(() => {
    // Only update state if we have a valid array of poll votes
    if (Array.isArray(pollVotes) && pollVotes.length >= 0) {
      setPollResults(pollVotes);
      const userVoteData = pollVotes.find((vote: ChatPollVote) => vote.userId === currentUserId);
      setUserVote(userVoteData || null);
      setShowResults(!!userVoteData || pollStatus === 'closed' || pollVotes.length > 0);
    }
  }, [pollVotes, currentUserId, pollStatus]);

  if (!poll) {
    return null;
  }

  const handleVote = (optionIndex: number) => {
    if (poll.status === 'closed' || userVote) {
      return;
    }
    voteOnPollMutation.mutate({ pollId: poll.id, optionIndex });
  };

  const handleClosePoll = () => {
    if (window.confirm('Are you sure you want to close this poll?')) {
      closePollMutation.mutate(poll.id);
    }
  };

  const getVoteCount = (optionIndex: number) => {
    return pollResults.filter(vote => vote.optionIndex === optionIndex).length;
  };

  const getTotalVotes = () => {
    return pollResults.length;
  };

  const getVotePercentage = (optionIndex: number) => {
    const total = getTotalVotes();
    if (total === 0) return 0;
    return Math.round((getVoteCount(optionIndex) / total) * 100);
  };

  const canVote = poll.status === 'active' && !userVote;
  const canClosePoll = message.senderId === currentUserId && poll.status === 'active';

  return (
    <div className="mt-3 p-5 border border-border rounded-xl bg-card shadow-sm" data-testid={`poll-card-${poll.id}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="bg-primary text-primary-foreground text-xs px-2.5 py-1 rounded-md font-medium">
            Poll
          </div>
          {poll.status === 'closed' && (
            <div className="bg-muted text-muted-foreground text-xs px-2.5 py-1 rounded-md">
              Closed
            </div>
          )}
        </div>
        {canClosePoll && (
          <button
            onClick={handleClosePoll}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            data-testid="button-close-poll"
          >
            Close Poll
          </button>
        )}
      </div>

      <h4 className="font-semibold text-base mb-4 text-foreground" data-testid="poll-question">
        {poll.question}
      </h4>

      <div className="space-y-2.5">
        {(poll.options as string[]).map((option: string, index: number) => {
          const voteCount = getVoteCount(index);
          const percentage = getVotePercentage(index);
          const isUserChoice = userVote?.optionIndex === index;

          return (
            <div key={index} className="relative">
              <button
                onClick={() => handleVote(index)}
                disabled={!canVote}
                className={`w-full py-3.5 px-4 rounded-xl border text-left transition-all duration-300 ${
                  canVote
                    ? 'hover:bg-accent/50 border-border bg-background'
                    : 'cursor-default border-border bg-background'
                } ${
                  isUserChoice
                    ? 'bg-primary text-primary-foreground hover:bg-primary border-primary'
                    : ''
                }`}
                data-testid={`poll-option-${index}`}
              >
                <div className="flex items-center justify-between relative z-10">
                  <span className="text-sm font-medium">{option}</span>
                  {showResults && (
                    <div className="flex items-center gap-2.5">
                      <span className="text-xs opacity-75">
                        {voteCount} {voteCount !== 1 ? 'votes' : 'vote'}
                      </span>
                      {isUserChoice && (
                        <div className="w-2 h-2 bg-white rounded-full" data-testid="user-vote-indicator" />
                      )}
                    </div>
                  )}
                </div>
                {showResults && percentage > 0 && (
                  <div
                    className="absolute inset-0 bg-primary/20 rounded-xl transition-all duration-500"
                    style={{ width: `${percentage}%` }}
                  />
                )}
              </button>
            </div>
          );
        })}
      </div>

      {showResults && (
        <div className="mt-3 pt-3 border-t border-border">
          <p className="text-xs text-muted-foreground" data-testid="poll-total-votes">
            {getTotalVotes()} total votes
          </p>
        </div>
      )}
    </div>
  );
}

// Payment Request Card Component - Message-scoped like PollCard
function PaymentRequestCard({ paymentRequestId, currentUserId }: { paymentRequestId: string; currentUserId: string }) {
  const { toast } = useToast();

  // Fetch specific payment request data
  const { data: paymentRequest, isLoading } = useQuery<any>({
    queryKey: ['/api/payment-requests', paymentRequestId],
    enabled: !!paymentRequestId
  });

  const markAsPaidMutation = useMutation({
    mutationFn: async ({ recipientId, paymentMethod }: { recipientId: string; paymentMethod: 'venmo' | 'cashapp' | 'cash' | 'other' }) => {
      const response = await apiRequest('PATCH', `/api/payment-request-recipients/${recipientId}`, {
        isPaid: true,
        paymentMethod
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/payment-requests', paymentRequestId] });
      queryClient.invalidateQueries({ queryKey: ['/api/payment-requests/unpaid-count'] });
      toast({
        title: 'Payment confirmed',
        description: 'Your payment has been marked as complete'
      });
    },
    onError: (error) => {
      console.error('Error marking payment as paid:', error);
      toast({
        title: 'Failed to update payment',
        description: 'Please try again',
        variant: 'destructive'
      });
    }
  });

  if (isLoading || !paymentRequest) {
    return null;
  }

  const currentUserRecipient = paymentRequest.recipients.find((r: any) => r.userId === currentUserId);
  const isCreator = paymentRequest.creatorId === currentUserId;
  const totalRecipients = paymentRequest.recipients.length;
  const paidCount = paymentRequest.recipients.filter((r: any) => r.isPaid).length;

  return (
    <div className="p-4 border border-green-500/20 rounded-lg dark:bg-green-950/20 bg-[#00000080] pt-[2px] pb-[2px] pl-[5px] pr-[5px] mt-[8px] mb-[8px]" data-testid={`payment-request-card-${paymentRequest.id}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="bg-green-600 text-white text-xs px-2 py-1 rounded font-medium">
            💰 PAYMENT REQUEST
          </div>
        </div>
        <div className="text-xs text-muted-foreground" data-testid="payment-progress">
          {paidCount}/{totalRecipients} paid
        </div>
      </div>
      <h4 className="font-semibold text-base mb-2" data-testid="payment-title">
        {paymentRequest.title}
      </h4>
      {paymentRequest.description && (
        <p className="text-sm text-muted-foreground mb-3" data-testid="payment-description">
          {paymentRequest.description}
        </p>
      )}
      <div className="mb-3">
        <p className="text-2xl font-bold text-green-600 dark:text-green-400" data-testid="payment-amount">
          ${parseFloat(paymentRequest.amountPerPerson).toFixed(2)}
          <span className="text-sm font-normal text-muted-foreground ml-1">per person</span>
        </p>
      </div>
      {isCreator && (
        <div className="space-y-2 mb-3">
          <p className="text-xs font-medium text-muted-foreground mb-2">Recipients:</p>
          {paymentRequest.recipients.map((recipient: any) => (
            <div
              key={recipient.id}
              className="flex items-center justify-between p-2 bg-background rounded border"
              data-testid={`recipient-${recipient.id}`}
            >
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 bg-muted rounded-full flex items-center justify-center">
                  <span className="text-xs font-semibold">
                    {recipient.user.firstName?.[0]}{recipient.user.lastName?.[0]}
                  </span>
                </div>
                <span className="text-sm">
                  {recipient.user.firstName} {recipient.user.lastName}
                </span>
              </div>
              {recipient.isPaid ? (
                <div className="flex items-center gap-1 text-green-600">
                  <CheckCircle className="w-4 h-4" />
                  <span className="text-xs font-medium">Paid</span>
                </div>
              ) : (
                <div className="text-xs text-muted-foreground">Pending</div>
              )}
            </div>
          ))}
        </div>
      )}
      {currentUserRecipient && !currentUserRecipient.isPaid && (
        <div className="pt-3 border-t border-border">
          <p className="text-xs text-muted-foreground mb-2">Mark as paid:</p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => markAsPaidMutation.mutate({ recipientId: currentUserRecipient.id, paymentMethod: 'venmo' })}
              disabled={markAsPaidMutation.isPending}
              data-testid="button-pay-venmo"
            >
              Venmo
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => markAsPaidMutation.mutate({ recipientId: currentUserRecipient.id, paymentMethod: 'cashapp' })}
              disabled={markAsPaidMutation.isPending}
              data-testid="button-pay-cashapp"
            >
              Cash App
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => markAsPaidMutation.mutate({ recipientId: currentUserRecipient.id, paymentMethod: 'cash' })}
              disabled={markAsPaidMutation.isPending}
              data-testid="button-pay-cash"
            >
              Cash
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => markAsPaidMutation.mutate({ recipientId: currentUserRecipient.id, paymentMethod: 'other' })}
              disabled={markAsPaidMutation.isPending}
              data-testid="button-pay-other"
            >
              Other
            </Button>
          </div>
        </div>
      )}
      {currentUserRecipient && currentUserRecipient.isPaid && (
        <div className="pt-3 border-t border-border flex items-center gap-2 text-green-600">
          <CheckCircle className="w-4 h-4" />
          <span className="text-sm font-medium" data-testid="payment-confirmed">
            You marked this as paid via {currentUserRecipient.paymentMethod}
          </span>
        </div>
      )}
      <div className="mt-3 pt-3 border-t border-border text-xs text-muted-foreground">
        <p>Requested by {paymentRequest.creator.firstName} {paymentRequest.creator.lastName}</p>
      </div>
    </div>
  );
}

export default function Messages() {
  const { user } = useAuth();
  const { canAccessPremiumFeatures, hasRole } = usePermissions();
  const currentUserId = (user as any)?.id;
  const params = useParams();
  const [, navigate] = useLocation();
  const { selectedTeamId, selectedLeagueId, selectedTournamentId } = useDashboardSelection();
  
  // Check if user is on free tier (no premium access)
  const isFreeTier = !canAccessPremiumFeatures();
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);

  // Handle conversation ID from URL parameter
  useEffect(() => {
    if (params.conversationId) {
      setSelectedConversation(params.conversationId);
    }
  }, [params.conversationId]);
  const [newMessage, setNewMessage] = useState('');
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isUploadingFiles, setIsUploadingFiles] = useState(false);
  const [showContactDiscovery, setShowContactDiscovery] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLeague, setSelectedLeague] = useState<string | null>(null);
  const [conversationType, setConversationType] = useState<'direct' | 'team_group' | 'custom_group' | 'captain_only'>('direct');
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const [groupTitle, setGroupTitle] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const firstUnreadMessageRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  
  // Media gallery state
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryItems, setGalleryItems] = useState<any[]>([]);
  const [galleryIndex, setGalleryIndex] = useState(0);
  
  // GIF search modal state
  const [gifModalOpen, setGifModalOpen] = useState(false);
  
  // Group members modal state
  const [showMembersModal, setShowMembersModal] = useState(false);
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [selectedUserToAdd, setSelectedUserToAdd] = useState<string | null>(null);

  // Poll state
  const [showPollCreator, setShowPollCreator] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState(['', '']);

  // Payment request state
  const [showPaymentRequestCreator, setShowPaymentRequestCreator] = useState(false);
  const [paymentRequestTitle, setPaymentRequestTitle] = useState('');
  const [paymentRequestDescription, setPaymentRequestDescription] = useState('');
  const [paymentRequestAmount, setPaymentRequestAmount] = useState('');
  const [selectedRecipients, setSelectedRecipients] = useState<string[]>([]);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const inputContainerRef = useRef<HTMLDivElement>(null);

  // Keyboard detection for mobile devices (including Android)
  useEffect(() => {
    const handleViewportResize = () => {
      if (window.visualViewport) {
        const viewportHeight = window.visualViewport.height;
        const windowHeight = window.innerHeight;
        const calculatedKeyboardHeight = windowHeight - viewportHeight;
        setKeyboardHeight(calculatedKeyboardHeight > 50 ? calculatedKeyboardHeight : 0);
      }
    };

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleViewportResize);
      window.visualViewport.addEventListener('scroll', handleViewportResize);
    }

    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleViewportResize);
        window.visualViewport.removeEventListener('scroll', handleViewportResize);
      }
    };
  }, []);

  // Auto-resize textarea as content changes
  const autoResizeTextarea = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const scrollHeight = textareaRef.current.scrollHeight;
      const maxHeight = 120; // Max 5-6 lines
      textareaRef.current.style.height = `${Math.min(scrollHeight, maxHeight)}px`;
    }
  };

  useEffect(() => {
    autoResizeTextarea();
  }, [newMessage]);

  // Fetch user's leagues for contact discovery
  const { data: userLeagues = [], isLoading: userLeaguesLoading } = useQuery<League[]>({
    queryKey: ['/api/user/leagues'],
    enabled: true // 🚨 FREE ACCESS - NO GATES! 🚨
  });

  // Fetch contacts for selected league
  const { data: contacts = [], isLoading: contactsLoading } = useQuery<Contact[]>({
    queryKey: ['/api/leagues', selectedLeague, 'contacts'],
    enabled: !!selectedLeague // 🚨 FREE ACCESS - NO GATES! 🚨
  });


  // Fetch user teams for team group chat option
  const { data: userTeams = [] } = useQuery<any[]>({
    queryKey: ['/api/user/teams'],
    enabled: true // 🚨 FREE ACCESS - NO GATES! 🚨
  });

  // Fetch ALL conversations once - stable query key for instant caching
  const { data: allConversations = [], isLoading: conversationsLoading } = useQuery<Conversation[]>({
    queryKey: ['/api/conversations'],
    enabled: true // 🚨 FREE ACCESS - NO GATES! 🚨
  });

  // Get user's own team IDs for free tier restrictions
  const userTeamIds = useMemo(() => {
    return userTeams.map((t: any) => t.id);
  }, [userTeams]);
  
  // Filter conversations by selected league, team, or tournament (client-side for instant filtering)
  const conversations = useMemo(() => {
    let filtered = allConversations;
    
    // FREE TIER RESTRICTION: Only show team group chats for the user's OWN teams
    // (no direct messages, no custom groups, no captain chats, no other teams' chats)
    if (isFreeTier) {
      filtered = filtered.filter(conv => 
        conv.type === 'team_group' && userTeamIds.includes(conv.teamId)
      );
    }
    
    // Filter by tournament if one is selected
    if (selectedTournamentId) {
      filtered = filtered.filter(conv => conv.tournamentId === selectedTournamentId);
    }
    // Filter by team if one is selected - get the team's league and filter by that
    else if (selectedTeamId) {
      // Find the selected team to get its league ID
      const selectedTeamData = userTeams.find((t: any) => t.id === selectedTeamId);
      const teamLeagueId = selectedTeamData?.leagueId;
      
      // Filter by the team's league first
      if (teamLeagueId) {
        filtered = filtered.filter(conv => conv.leagueId === teamLeagueId);
      }
      
      // Then filter to show team chat AND league-wide chats (direct, captain)
      // This includes conversations with matching teamId OR conversations with no teamId (direct/captain chats)
      // But for free tier, we already filtered to own team chats only above
      if (!isFreeTier) {
        filtered = filtered.filter(conv => 
          conv.teamId === selectedTeamId || conv.teamId === null
        );
      } else {
        // Free tier: only show their own team's chat (already restricted above)
        filtered = filtered.filter(conv => conv.teamId === selectedTeamId);
      }
    }
    // Filter by league if one is selected
    else if (selectedLeagueId) {
      filtered = filtered.filter(conv => conv.leagueId === selectedLeagueId);
      // For free tier with league context but no team selected, 
      // they still only see their own team chats (already filtered above)
    }
    
    return filtered;
  }, [allConversations, selectedLeagueId, selectedTeamId, selectedTournamentId, userTeams, isFreeTier, userTeamIds]);

  // Fetch unread message counts per conversation
  const { data: unreadCountsData } = useQuery<{ unreadCounts: Array<{ conversationId: string; unreadCount: number }> }>({
    queryKey: ['/api/messages/unread-count-per-conversation'],
    refetchInterval: 30000, // Reduced from 10s to 30s to lower egress (messages stay more responsive)
    staleTime: 15000, // Consider data stale after 15 seconds
    enabled: true // 🚨 FREE ACCESS - NO GATES! 🚨
  });

  const unreadCountsMap = (unreadCountsData?.unreadCounts || []).reduce((acc, item) => {
    acc[item.conversationId] = item.unreadCount;
    return acc;
  }, {} as Record<string, number>);

  // Fetch messages for selected conversation
  const { data: messages = [], isLoading: messagesLoading } = useQuery<Message[]>({
    queryKey: ['/api/conversations', selectedConversation, 'messages'],
    enabled: !!selectedConversation // 🚨 FREE ACCESS - NO GATES! 🚨
  });

  // Fetch payment requests for selected conversation
  const { data: conversationPaymentRequests = [] } = useQuery<any[]>({
    queryKey: ['/api/conversations', selectedConversation, 'payment-requests'],
    enabled: !!selectedConversation
  });

  // Merge messages and payment requests chronologically
  const timelineItems = useMemo(() => {
    const items: Array<{ type: 'message' | 'payment', data: any, createdAt: Date }> = [
      ...messages.map(msg => ({ type: 'message' as const, data: msg, createdAt: new Date(msg.sentAt) })),
      ...conversationPaymentRequests.map(pr => ({ type: 'payment' as const, data: pr, createdAt: new Date(pr.createdAt) }))
    ];
    return items.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }, [messages, conversationPaymentRequests]);

  // Reset dialog function
  const resetDialog = () => {
    setConversationType('direct');
    setSelectedTeam(null);
    setSelectedContacts([]);
    setGroupTitle('');
    setSearchQuery('');
  };

  // Create new conversation mutation
  const createConversationMutation = useMutation({
    mutationFn: async (data: { otherUserId: string; leagueId: string }) => {
      const response = await apiRequest('POST', '/api/conversations/direct', data);
      return response.json();
    },
    onSuccess: (conversation) => {
      queryClient.invalidateQueries({ queryKey: ['/api/conversations'] });
      setSelectedConversation(conversation.id);
      setShowContactDiscovery(false);
      resetDialog();
      toast({
        title: 'Conversation started',
        description: 'Conversation started successfully'
      });
    },
    onError: (error) => {
      toast({
        title: 'Failed to start conversation',
        description: 'Please try again',
        variant: 'destructive'
      });
    }
  });

  // Create team group conversation mutation
  const createTeamGroupMutation = useMutation({
    mutationFn: async (data: { teamId: string; leagueId: string }) => {
      const response = await apiRequest('POST', '/api/conversations/team-group', data);
      return response.json();
    },
    onSuccess: (conversation) => {
      queryClient.invalidateQueries({ queryKey: ['/api/conversations'] });
      setSelectedConversation(conversation.id);
      setShowContactDiscovery(false);
      resetDialog();
      toast({
        title: 'Team chat created',
        description: 'Team group chat created successfully'
      });
    },
    onError: (error) => {
      toast({
        title: 'Failed to create team chat',
        description: 'Please try again',
        variant: 'destructive'
      });
    }
  });

  // Create custom group conversation mutation
  const createCustomGroupMutation = useMutation({
    mutationFn: async (data: { title: string; leagueId: string; participantIds: string[] }) => {
      const response = await apiRequest('POST', '/api/conversations/custom-group', data);
      return response.json();
    },
    onSuccess: (conversation) => {
      queryClient.invalidateQueries({ queryKey: ['/api/conversations'] });
      setSelectedConversation(conversation.id);
      setShowContactDiscovery(false);
      resetDialog();
      toast({
        title: 'Group chat created',
        description: 'Custom group chat created successfully'
      });
    },
    onError: (error) => {
      toast({
        title: 'Failed to create group chat',
        description: 'Please try again',
        variant: 'destructive'
      });
    }
  });

  // Create captain-only conversation mutation
  const createCaptainChatMutation = useMutation({
    mutationFn: async (data: { leagueId: string }) => {
      const response = await apiRequest('POST', '/api/conversations/captain-only', data);
      return response.json();
    },
    onSuccess: (conversation) => {
      queryClient.invalidateQueries({ queryKey: ['/api/conversations'] });
      setSelectedConversation(conversation.id);
      setShowContactDiscovery(false);
      resetDialog();
      toast({
        title: 'Captain chat created',
        description: 'Captains-only chat created successfully'
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to create captain chat',
        description: error.message || 'Please try again',
        variant: 'destructive'
      });
    }
  });

  // Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: async (messageData: { content: string; messageType?: string; attachments?: any[] }) => {
      const response = await apiRequest('POST', `/api/conversations/${selectedConversation}/messages`, messageData);
      return response.json();
    },
    onSuccess: () => {
      setNewMessage('');
      queryClient.invalidateQueries({ queryKey: ['/api/conversations', selectedConversation, 'messages'] });
      queryClient.invalidateQueries({ queryKey: ['/api/conversations'] });
    },
    onError: (error) => {
      toast({
        title: 'Failed to send message',
        description: 'Please try again',
        variant: 'destructive'
      });
    }
  });

  // Delete conversation mutation
  const deleteConversationMutation = useMutation({
    mutationFn: async (conversationId: string) => {
      const response = await apiRequest('DELETE', `/api/conversations/${conversationId}`);
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/conversations'] });
      // If we deleted the currently selected conversation, go back to list
      if (selectedConversation) {
        setSelectedConversation(null);
      }
      toast({
        title: "Success",
        description: "Conversation deleted successfully.",
      });
    },
    onError: (error: any) => {
      console.error('Error deleting conversation:', error);
      toast({
        title: "Error",
        description: "Failed to delete conversation. Please try again.",
        variant: "destructive",
      });
    }
  });

  const leaveConversationMutation = useMutation({
    mutationFn: async (conversationId: string) => {
      const response = await apiRequest('POST', `/api/conversations/${conversationId}/leave`);
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/conversations'] });
      // If we left the currently selected conversation, go back to list
      if (selectedConversation) {
        setSelectedConversation(null);
      }
      toast({
        title: "Success",
        description: "Left conversation successfully.",
      });
    },
    onError: (error: any) => {
      console.error('Error leaving conversation:', error);
      toast({
        title: "Error",
        description: "Failed to leave conversation. Please try again.",
        variant: "destructive",
      });
    }
  });

  // Add user to conversation mutation
  const addUserToConversationMutation = useMutation({
    mutationFn: async ({ conversationId, userId }: { conversationId: string; userId: string }) => {
      const response = await apiRequest('POST', `/api/conversations/${conversationId}/participants`, { userId });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/conversations'] });
      if (selectedConversation) {
        queryClient.invalidateQueries({ queryKey: ['/api/conversations', selectedConversation, 'messages'] });
      }
      toast({
        title: "User added",
        description: "User has been added to the conversation."
      });
      setShowAddUserModal(false);
      setSelectedUserToAdd(null);
    },
    onError: (error) => {
      console.error('Error adding user to conversation:', error);
      toast({
        title: "Error",
        description: "Failed to add user to conversation. Please try again.",
        variant: "destructive"
      });
    }
  });

  // Poll mutations
  const createPollMutation = useMutation({
    mutationFn: async (pollData: { question: string; options: string[]; expiresAt?: string }) => {
      // We'll need to create a message first, then add the poll to it
      // For now, let's create a special poll message
      const messageResponse = await apiRequest('POST', `/api/conversations/${selectedConversation}/messages`, {
        content: `📊 ${pollData.question}`,
        messageType: 'poll'
      });
      const message = await messageResponse.json();
      
      const pollResponse = await apiRequest('POST', `/api/messages/${message.id}/polls`, pollData);
      return pollResponse.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/conversations', selectedConversation, 'messages'] });
      setShowPollCreator(false);
      setPollQuestion('');
      setPollOptions(['', '']);
      toast({
        title: 'Poll created',
        description: 'Your poll has been created successfully'
      });
    },
    onError: (error) => {
      console.error('Error creating poll:', error);
      toast({
        title: 'Failed to create poll',
        description: 'Please try again',
        variant: 'destructive'
      });
    }
  });


  // Payment request mutation
  const createPaymentRequestMutation = useMutation({
    mutationFn: async (paymentData: { 
      title: string; 
      description?: string; 
      amountPerPerson: string;
      recipientUserIds: string[];
      relatedConversationId: string;
      relatedScrimmageId: null;
      deadline: null;
    }) => {
      const response = await apiRequest('POST', '/api/payment-requests', paymentData);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/conversations', selectedConversation, 'payment-requests'] });
      queryClient.invalidateQueries({ queryKey: ['/api/conversations', selectedConversation, 'messages'] });
      setShowPaymentRequestCreator(false);
      setPaymentRequestTitle('');
      setPaymentRequestDescription('');
      setPaymentRequestAmount('');
      setSelectedRecipients([]);
      toast({
        title: 'Payment request sent',
        description: 'Your payment request has been sent successfully'
      });
    },
    onError: (error) => {
      console.error('Error creating payment request:', error);
      toast({
        title: 'Failed to send payment request',
        description: 'Please try again',
        variant: 'destructive'
      });
    }
  });

  // Poll helper functions
  const addPollOption = () => {
    if (pollOptions.length < 6) {
      setPollOptions([...pollOptions, '']);
    }
  };

  const removePollOption = (index: number) => {
    if (pollOptions.length > 2) {
      setPollOptions(pollOptions.filter((_, i) => i !== index));
    }
  };

  const updatePollOption = (index: number, value: string) => {
    const newOptions = [...pollOptions];
    newOptions[index] = value;
    setPollOptions(newOptions);
  };

  const handleCreatePoll = () => {
    if (!pollQuestion.trim() || pollOptions.some(option => !option.trim())) {
      toast({
        title: 'Invalid poll data',
        description: 'Please fill in the question and all options',
        variant: 'destructive'
      });
      return;
    }

    createPollMutation.mutate({
      question: pollQuestion.trim(),
      options: pollOptions.filter(option => option.trim())
    });
  };

  const handleCreatePaymentRequest = () => {
    if (!paymentRequestTitle.trim()) {
      toast({
        title: 'Title required',
        description: 'Please enter a title for the payment request',
        variant: 'destructive'
      });
      return;
    }

    const amount = parseFloat(paymentRequestAmount);
    if (isNaN(amount) || amount <= 0) {
      toast({
        title: 'Invalid amount',
        description: 'Please enter a valid amount greater than 0',
        variant: 'destructive'
      });
      return;
    }

    if (selectedRecipients.length === 0) {
      toast({
        title: 'No recipients selected',
        description: 'Please select at least one person to request payment from',
        variant: 'destructive'
      });
      return;
    }

    if (!selectedConversation) {
      toast({
        title: 'No conversation selected',
        description: 'Please select a conversation first',
        variant: 'destructive'
      });
      return;
    }

    createPaymentRequestMutation.mutate({
      title: paymentRequestTitle.trim(),
      description: paymentRequestDescription.trim() || undefined,
      amountPerPerson: paymentRequestAmount,
      recipientUserIds: selectedRecipients,
      relatedConversationId: selectedConversation,
      relatedScrimmageId: null,
      deadline: null
    });
  };


  const handleDeleteConversation = async (conversationId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent conversation selection when clicking delete
    
    // Ask for confirmation before deleting
    if (window.confirm('Are you sure you want to delete this conversation? This action cannot be undone.')) {
      deleteConversationMutation.mutate(conversationId);
    }
  };

  const handleLeaveConversation = async (conversationId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent conversation selection when clicking leave
    
    // Ask for confirmation before leaving
    if (window.confirm('Are you sure you want to leave this conversation?')) {
      leaveConversationMutation.mutate(conversationId);
    }
  };

  // Check if user can manage (delete) a conversation
  const canUserManageConversation = (conversation: any): boolean => {
    if (!currentUserId) return false;
    
    // User created the conversation
    if (conversation.createdBy === currentUserId) return true;
    
    // For team group chats, check if user is team captain
    if (conversation.type === 'team_group' && conversation.teamId) {
      // We'd need team captain info, but for now we'll try deletion and handle error
      return false; // Conservative approach - will show Leave instead of Delete
    }
    
    return false;
  };

  // Persistent WebSocket connection for real-time updates
  useEffect(() => {
    // 🚨 FREE ACCESS - WEBSOCKET ENABLED FOR EVERYONE! 🚨

    // More robust WebSocket URL construction for different environments
    let wsUrl;
    try {
      // Use window.location.origin and convert to WebSocket protocol
      const origin = window.location.origin;
      wsUrl = origin.replace('https:', 'wss:').replace('http:', 'ws:') + '/ws';
    } catch (error) {
      // Fallback for development environment
      console.warn('Failed to get origin, using fallback:', error);
      wsUrl = 'ws://localhost:5000/ws';
    }
    
    console.log('Connecting to WebSocket at:', wsUrl);
    
    const websocket = new WebSocket(wsUrl);
    
    websocket.onopen = () => {
      console.log('Connected to messaging WebSocket');
      wsRef.current = websocket;
      
      // Authenticate with the server so it knows which user this connection belongs to
      if (currentUserId) {
        websocket.send(JSON.stringify({
          type: 'authenticate',
          userId: currentUserId
        }));
      }
    };
    
    websocket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      // Handle different message types
      switch (data.type) {
        case 'message':
          // Refresh conversations and messages
          queryClient.invalidateQueries({ queryKey: ['/api/conversations'] });
          if (data.conversationId === selectedConversation) {
            queryClient.invalidateQueries({ queryKey: ['/api/conversations', selectedConversation, 'messages'] });
          }
          break;
          
        case 'typing_start':
          if (data.conversationId === selectedConversation && data.userId !== currentUserId) {
            setTypingUsers(prev => Array.from(new Set([...prev, data.userId])));
          }
          break;
          
        case 'typing_stop':
          if (data.conversationId === selectedConversation) {
            setTypingUsers(prev => prev.filter(userId => userId !== data.userId));
          }
          break;
          
        case 'user_online':
          if (data.conversationId === selectedConversation) {
            setOnlineUsers(prev => Array.from(new Set([...prev, data.userId])));
          }
          break;
          
        case 'user_offline':
          if (data.conversationId === selectedConversation) {
            setOnlineUsers(prev => prev.filter(userId => userId !== data.userId));
          }
          break;
          
        case 'read_receipt':
        case 'message_read':
          // Refresh messages to show updated read receipts
          // message_read is sent by mark-all-read endpoint with conversationId and messageIds array
          if (data.conversationId === selectedConversation) {
            queryClient.invalidateQueries({ queryKey: ['/api/conversations', selectedConversation, 'messages'] });
          }
          // Invalidate unread counts when read receipts are received
          queryClient.invalidateQueries({ queryKey: ['/api/messages/unread-count'] });
          queryClient.invalidateQueries({ queryKey: ['/api/messages/unread-count-per-conversation'] });
          break;

        case 'poll_created':
          // Refresh messages to show new poll
          if (data.conversationId === selectedConversation) {
            queryClient.invalidateQueries({ queryKey: ['/api/conversations', selectedConversation, 'messages'] });
            queryClient.invalidateQueries({ queryKey: ['/api/messages', data.messageId, 'polls'] });
          }
          break;

        case 'poll_vote':
          // Refresh poll results to show new vote
          if (data.conversationId === selectedConversation) {
            queryClient.invalidateQueries({ queryKey: ['/api/chat-polls', data.pollId, 'results'] });
          }
          break;

        case 'poll_closed':
          // Refresh poll data to show closed status
          if (data.conversationId === selectedConversation) {
            queryClient.invalidateQueries({ queryKey: ['/api/chat-polls', data.pollId, 'results'] });
            queryClient.invalidateQueries({ queryKey: ['/api/messages', data.messageId, 'polls'] });
          }
          break;
          
        case 'notification_update':
          // Real-time notification badge update - invalidate notification queries
          queryClient.invalidateQueries({ queryKey: ['/api/notifications'] });
          queryClient.invalidateQueries({ queryKey: ['/api/notifications/unread'] });
          queryClient.invalidateQueries({ queryKey: ['/api/user/notification-counts'] });
          break;
      }
    };
    
    websocket.onclose = () => {
      console.log('Disconnected from messaging WebSocket');
      wsRef.current = null;
    };
    
    return () => {
      websocket.close();
    };
  }, [currentUserId, selectedConversation]); // 🚨 FIXED DEPENDENCIES
  
  // Reset conversation-scoped state when conversation changes
  useEffect(() => {
    setTypingUsers([]);
    setOnlineUsers([]);
    
    // Clear any pending typing timeout for previous conversation
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
      setIsTyping(false);
    }
  }, [selectedConversation]);

  // Find first unread message
  const firstUnreadMessage = useMemo(() => {
    return messages.find(msg => 
      msg.senderId !== currentUserId && 
      !msg.readReceipts.some(receipt => receipt.userId === currentUserId)
    );
  }, [messages, currentUserId]);

  const prevConversationRef = useRef<string | null>(null);
  const hasScrolledForConversation = useRef<string | null>(null);
  const prevMessagesLengthRef = useRef<number>(0);

  useEffect(() => {
    if (!selectedConversation || messagesLoading) return;

    const container = messagesScrollRef.current;
    if (!container || !messages.length) return;

    const isNewConversation = hasScrolledForConversation.current !== selectedConversation;

    if (isNewConversation) {
      hasScrolledForConversation.current = selectedConversation;
      const doScroll = () => {
        const c = messagesScrollRef.current;
        if (!c) return;
        if (firstUnreadMessage && firstUnreadMessageRef.current) {
          firstUnreadMessageRef.current.scrollIntoView({ behavior: 'instant', block: 'start' });
        } else {
          c.scrollTop = c.scrollHeight;
        }
      };
      doScroll();
      setTimeout(doScroll, 50);
      setTimeout(doScroll, 150);
    } else {
      const isNewMessage = messages.length > prevMessagesLengthRef.current;
      if (isNewMessage) {
        const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 150;
        if (isNearBottom) {
          messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
      }
    }

    prevMessagesLengthRef.current = messages.length;
    prevConversationRef.current = selectedConversation;
  }, [messages, selectedConversation, messagesLoading, firstUnreadMessage]);

  // Typing indicator functions
  const handleTypingStart = () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN || !selectedConversation || isTyping) return;
    
    setIsTyping(true);
    wsRef.current.send(JSON.stringify({
      type: 'typing_start',
      conversationId: selectedConversation
    }));
    
    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    
    // Set timeout to stop typing indicator
    typingTimeoutRef.current = setTimeout(() => {
      handleTypingStop();
    }, 3000);
  };
  
  const handleTypingStop = () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN || !selectedConversation || !isTyping) return;
    
    setIsTyping(false);
    wsRef.current.send(JSON.stringify({
      type: 'typing_stop',
      conversationId: selectedConversation
    }));
    
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
  };
  
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setNewMessage(e.target.value);
    
    // Start typing indicator when user starts typing
    if (e.target.value.trim() && !isTyping) {
      handleTypingStart();
    }
    
    // Reset typing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    
    if (e.target.value.trim()) {
      typingTimeoutRef.current = setTimeout(() => {
        handleTypingStop();
      }, 3000);
    }
  };
  
  const handleSendMessage = async () => {
    if ((!newMessage.trim() && selectedFiles.length === 0) || !selectedConversation) return;
    
    // Stop typing indicator when sending message
    handleTypingStop();
    
    let attachments = [];
    
    // Upload files if any are selected
    if (selectedFiles.length > 0) {
      setIsUploadingFiles(true);
      try {
        attachments = await uploadFiles(selectedFiles);
      } catch (error) {
        toast({
          title: 'Failed to upload files',
          description: 'Please try again',
          variant: 'destructive'
        });
        setIsUploadingFiles(false);
        return;
      }
      setIsUploadingFiles(false);
    }
    
    sendMessageMutation.mutate({ 
      content: newMessage.trim() || ' ', // Ensure content is not empty
      attachments 
    });
    
    // Clear selected files after sending
    setSelectedFiles([]);
  };

  // Handle GIF selection from modal
  const handleGifSelect = (gif: any) => {
    if (!selectedConversation) return;
    
    // Create GIF attachment data
    const gifAttachment = {
      fileName: `${gif.title || 'gif'}.gif`,
      fileUrl: gif.images.original.url,
      fileType: 'image/gif',
      fileSize: 0, // We don't have size info from Giphy
      thumbnailUrl: gif.images.fixed_height.url,
      width: parseInt(gif.images.original.width) || 0,
      height: parseInt(gif.images.original.height) || 0
    };
    
    // Send GIF as message
    sendMessageMutation.mutate({ 
      content: gif.title || 'GIF',
      messageType: 'gif',
      attachments: [gifAttachment] 
    });
    
    toast({
      title: 'GIF sent!',
      description: 'Your GIF has been sent to the conversation'
    });
  };
  
  // Mark message as read when viewing conversation (single message)
  const markMessageAsRead = async (messageId: string) => {
    try {
      await apiRequest('POST', `/api/messages/${messageId}/read`);
    } catch (error) {
      console.error('Failed to mark message as read:', error);
    }
  };

  // Mark all messages in conversation as read (atomic operation)
  const markAllMessagesAsRead = async (conversationId: string) => {
    try {
      await apiRequest('POST', `/api/conversations/${conversationId}/mark-all-read`);
      
      // Immediate cache update - remove this conversation from unread counts
      queryClient.setQueryData(['/api/messages/unread-count-per-conversation'], (old: any) => {
        if (!old?.unreadCounts) return old;
        return {
          unreadCounts: old.unreadCounts.filter((item: any) => item.conversationId !== conversationId)
        };
      });
      
      // Force immediate refetch of fresh data
      await queryClient.refetchQueries({ queryKey: ['/api/messages/unread-count'] });
      await queryClient.refetchQueries({ queryKey: ['/api/messages/unread-count-per-conversation'] });
    } catch (error) {
      console.error('Failed to mark all messages as read:', error);
    }
  };
  
  // Mark all unread messages as read when conversation is opened
  useEffect(() => {
    if (selectedConversation && currentUserId) {
      // Use atomic operation to mark all messages as read
      markAllMessagesAsRead(selectedConversation);
    }
  }, [selectedConversation, currentUserId]);
  
  // File upload functions
  const uploadFiles = async (files: File[]): Promise<any[]> => {
    const uploadPromises = files.map(async (file) => {
      try {
        // Get upload URL and path
        const uploadUrlResponse = await apiRequest('POST', '/api/message-attachments/upload');
        const { uploadURL, path } = await uploadUrlResponse.json();
        
        // Upload file to object storage
        const uploadResponse = await fetch(uploadURL, {
          method: 'PUT',
          body: file,
          headers: {
            'Content-Type': file.type
          }
        });
        
        if (!uploadResponse.ok) {
          throw new Error('Failed to upload file');
        }
        
        // Use the path returned from the API
        const fileUrl = path;
        
        return {
          fileName: file.name,
          fileUrl,
          fileType: file.type,
          fileSize: file.size
        };
      } catch (error) {
        console.error('Error uploading file:', error);
        throw error;
      }
    });
    
    return Promise.all(uploadPromises);
  };
  
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    const validFiles = files.filter(file => {
      // Limit file size to 10MB
      if (file.size > 10 * 1024 * 1024) {
        toast({
          title: 'File too large',
          description: `${file.name} is larger than 10MB`,
          variant: 'destructive'
        });
        return false;
      }
      return true;
    });
    
    setSelectedFiles(prev => [...prev, ...validFiles]);
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };
  
  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };
  
  const getFileIcon = (fileType: string) => {
    if (fileType.startsWith('image/')) {
      return <Image className="w-4 h-4" />;
    }
    return <File className="w-4 h-4" />;
  };

  // Media gallery functions
  const openMediaGallery = (attachments: any[], startIndex: number = 0) => {
    const galleryItems = attachments.map((attachment, index) => ({
      id: `${attachment.messageId || 'unknown'}-${index}`,
      url: attachment.url,
      filename: attachment.filename || 'Unknown file',
      fileSize: attachment.fileSize,
      mimeType: attachment.mimeType,
      thumbnailUrl: attachment.thumbnailUrl
    }));
    
    setGalleryItems(galleryItems);
    setGalleryIndex(startIndex);
    setGalleryOpen(true);
  };

  
  
  // Cleanup typing timeout on unmount
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, []);

  const formatMessageTime = (timestamp: string) => {
    if (!timestamp) return 'Unknown';
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return 'Invalid date';
    return format(date, 'h:mm a');
  };

  const formatConversationTime = (timestamp: string) => {
    if (!timestamp) return 'Unknown';
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return 'Invalid date';
    
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);
    
    if (diffInHours < 24) {
      return format(date, 'h:mm a');
    } else if (diffInHours < 168) {
      return format(date, 'EEE');
    } else {
      return format(date, 'M/d');
    }
  };

  const getParticipantName = (conversation: Conversation) => {
    if (conversation.type === 'team_group' || conversation.type === 'custom_group') {
      return conversation.title || 'Group Chat';
    }
    
    if (conversation.type === 'captain_only') {
      return 'Captains Only';
    }
    
    // For direct messages, find the other participant
    if (!conversation.participants) {
      return 'Loading...';
    }
    const otherParticipant = conversation.participants.find(p => p.user?.id !== currentUserId);
    return otherParticipant?.user?.displayName || 'Unknown User';
  };

  // Get the current conversation to display proper chat title
  // Look in allConversations first to handle cases where conversation has null leagueId 
  // but user has a league filter active (e.g., direct message from user profile)
  const cachedConversation = allConversations.find(c => c.id === selectedConversation);
  
  // Fetch conversation details when navigating directly to a conversation not in cache
  const { data: fetchedConversation } = useQuery<Conversation>({
    queryKey: ['/api/conversations', selectedConversation],
    enabled: !!selectedConversation && !cachedConversation,
  });
  
  // Use cached conversation if available, otherwise use fetched data
  const currentConversation = cachedConversation || fetchedConversation;
  
  // FREE TIER RESTRICTION: Check if current conversation is allowed for free tier users
  // For free tier, we ONLY allow team_group conversations (the conversation list is already filtered to user's own teams)
  const isConversationAllowedForFreeTier = useMemo(() => {
    // Premium users can access everything
    if (!isFreeTier) return true;
    // If no conversation selected, allow (no restriction needed yet)
    if (!currentConversation) return true;
    // Free tier can only access team_group conversations
    // The conversation list is already filtered to only show user's own team chats
    // So if they have a team_group selected, it must be their own team
    return currentConversation.type === 'team_group';
  }, [isFreeTier, currentConversation]);

  // Fetch team data for team group chats (to get logo)
  const { data: conversationTeam } = useQuery<Team>({
    queryKey: ['/api/teams', currentConversation?.teamId],
    enabled: !!currentConversation?.teamId && currentConversation?.type === 'team_group'
  });

  // Fetch available contacts that can be added to the current conversation
  const { data: availableContacts = [] } = useQuery<Contact[]>({
    queryKey: ['/api/leagues', currentConversation?.leagueId, 'contacts'],
    enabled: !!currentConversation?.leagueId && showAddUserModal // 🚨 FREE ACCESS - NO GATES! 🚨
  });

  // Get users that can be added to the conversation (not already participants)
  const getAvailableUsersToAdd = () => {
    if (!currentConversation?.participants || !availableContacts) return [];
    
    const participantUserIds = new Set(currentConversation.participants.map(p => p.userId));
    return availableContacts.filter(contact => !participantUserIds.has(contact.id));
  };

  // Handle adding user to conversation
  const handleAddUserToConversation = () => {
    if (!selectedConversation || !selectedUserToAdd) return;
    
    addUserToConversationMutation.mutate({
      conversationId: selectedConversation,
      userId: selectedUserToAdd
    });
  };

  const getChatTitle = () => {
    if (!currentConversation) return 'Chat';
    
    if (currentConversation.type === 'direct') {
      // For direct messages, show the other person's name
      if (!currentConversation.participants) return 'Loading...';
      const otherParticipant = currentConversation.participants.find(p => p.user?.id !== currentUserId);
      return otherParticipant?.user?.displayName || 'Unknown User';
    }
    
    if (currentConversation.type === 'captain_only') {
      return 'Captains Only';
    }
    
    if (currentConversation.type === 'team_group') {
      return currentConversation.title || 'Team Chat';
    }
    
    if (currentConversation.type === 'custom_group') {
      return currentConversation.title || 'Group Chat';
    }
    
    return 'Chat';
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase();
  };

  // Get other participant's profile image for direct messages
  const getOtherParticipantProfileImage = (conversation: Conversation) => {
    if (conversation.type !== 'direct' || !conversation.participants) return null;
    const otherParticipant = conversation.participants.find(p => p.user?.id !== currentUserId);
    return otherParticipant?.user?.profileImageUrl || null;
  };

  // 🚨 SUBSCRIPTION GATE REMOVED - FULL ACCESS FOR EVERYONE! 🚨
  // All users now have free access to messaging features

  // Helper functions for contact discovery
  const filteredContacts = contacts.filter(contact => {
    if (!searchQuery) return true;
    const fullName = `${contact.firstName} ${contact.lastName}`.toLowerCase();
    const displayName = `${contact.displayFirstName || contact.firstName} ${contact.displayLastName || contact.lastName}`.toLowerCase();
    return fullName.includes(searchQuery.toLowerCase()) || 
           displayName.includes(searchQuery.toLowerCase()) ||
           contact.email.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const handleStartConversation = (contact: Contact) => {
    if (!selectedLeague) return;
    createConversationMutation.mutate({
      otherUserId: contact.id,
      leagueId: selectedLeague
    });
  };

  const handleCreateTeamGroup = () => {
    if (!selectedTeam || !selectedLeague) return;
    createTeamGroupMutation.mutate({
      teamId: selectedTeam,
      leagueId: selectedLeague
    });
  };

  const handleCreateCustomGroup = () => {
    if (!groupTitle.trim() || selectedContacts.length === 0 || !selectedLeague) return;
    createCustomGroupMutation.mutate({
      title: groupTitle,
      leagueId: selectedLeague,
      participantIds: selectedContacts
    });
  };

  const handleCreateCaptainChat = () => {
    if (!selectedLeague) return;
    createCaptainChatMutation.mutate({
      leagueId: selectedLeague
    });
  };

  const toggleContactSelection = (contactId: string) => {
    setSelectedContacts(prev => 
      prev.includes(contactId) 
        ? prev.filter(id => id !== contactId)
        : [...prev, contactId]
    );
  };

  const getContactDisplayName = (contact: Contact) => {
    return `${contact.displayFirstName || contact.firstName} ${contact.displayLastName || contact.lastName}`;
  };

  return (
    <>
      {/* Contact Discovery Dialog */}
      <Dialog open={showContactDiscovery} onOpenChange={setShowContactDiscovery}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Start New Conversation</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            
            {/* Fallback content if no leagues but user is authenticated */}
            {userLeagues.length === 0 && !userLeaguesLoading && (
              <div className="p-4 bg-muted rounded-md text-center">
                <Users className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  No leagues found. Join a league to send messages.
                </p>
              </div>
            )}
            
            {/* League Selection */}
            {userLeagues.length > 1 && (
              <div>
                <label className="text-sm font-medium mb-2 block">Select League</label>
                <select 
                  value={selectedLeague || ''} 
                  onChange={(e) => setSelectedLeague(e.target.value)}
                  className="w-full p-2 border border-border rounded-md bg-background"
                  data-testid="select-league"
                >
                  <option value="">Choose a league...</option>
                  {userLeagues.map((league) => (
                    <option key={league.id} value={league.id}>{league.name}</option>
                  ))}
                </select>
              </div>
            )}
            
            {/* Always show league info if single league */}
            {userLeagues.length === 1 && (
              <div className="p-3 bg-muted rounded-md">
                <div className="text-sm font-medium">League: {userLeagues[0]?.name}</div>
                <div className="text-xs text-muted-foreground">Auto-selected</div>
              </div>
            )}

            {/* Conversation Type Selection */}
            {(selectedLeague || (userLeagues.length === 1 && userLeagues[0])) && (
              <div>
                <label className="text-sm font-medium mb-2 block">Conversation Type</label>
                <div className="grid grid-cols-4 gap-2">
                  <button
                    type="button"
                    onClick={() => setConversationType('direct')}
                    className={`p-3 border rounded-lg text-center transition-colors ${
                      conversationType === 'direct' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'
                    }`}
                    data-testid="button-direct-message"
                  >
                    <MessageCircle className="w-4 h-4 mx-auto mb-1" />
                    <div className="text-xs">Direct</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setConversationType('team_group')}
                    className={`p-3 border rounded-lg text-center transition-colors ${
                      conversationType === 'team_group' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'
                    }`}
                    data-testid="button-team-group"
                  >
                    <Users className="w-4 h-4 mx-auto mb-1" />
                    <div className="text-xs">Team</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setConversationType('custom_group')}
                    className={`p-3 border rounded-lg text-center transition-colors ${
                      conversationType === 'custom_group' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'
                    }`}
                    data-testid="button-custom-group"
                  >
                    <UserPlus className="w-4 h-4 mx-auto mb-1" />
                    <div className="text-xs">Group</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setConversationType('captain_only')}
                    className={`p-3 border rounded-lg text-center transition-colors ${
                      conversationType === 'captain_only' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'
                    }`}
                    data-testid="button-captain-only"
                  >
                    <Crown className="w-4 h-4 mx-auto mb-1" />
                    <div className="text-xs">Captains</div>
                  </button>
                </div>
              </div>
            )}
            
            {/* Team Selection for Team Group Chat */}
            {conversationType === 'team_group' && (selectedLeague || (userLeagues.length === 1 && userLeagues[0])) && (
              <div>
                <label className="text-sm font-medium mb-2 block">Select Team</label>
                <select 
                  value={selectedTeam || ''} 
                  onChange={(e) => setSelectedTeam(e.target.value)}
                  className="w-full p-2 border border-border rounded-md bg-background"
                  data-testid="select-team"
                >
                  <option value="">Choose a team...</option>
                  {userTeams
                    .filter(team => team.leagueId === (selectedLeague || userLeagues[0]?.id))
                    .map((team) => (
                      <option key={team.id} value={team.id}>{team.name}</option>
                    ))}
                </select>
                {selectedTeam && (
                  <Button
                    onClick={handleCreateTeamGroup}
                    disabled={createTeamGroupMutation.isPending}
                    className="w-full mt-3"
                    data-testid="button-create-team-chat"
                  >
                    {createTeamGroupMutation.isPending ? 'Creating...' : 'Create Team Chat'}
                  </Button>
                )}
              </div>
            )}

            {/* Captain-Only Chat Creation */}
            {conversationType === 'captain_only' && (selectedLeague || (userLeagues.length === 1 && userLeagues[0])) && (
              <div className="space-y-3">
                <div className="p-3 bg-muted rounded-md">
                  <div className="flex items-start gap-2">
                    <Crown className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5" />
                    <div className="text-sm text-muted-foreground">
                      This will create a private chat with all team captains in the league.
                    </div>
                  </div>
                </div>
                <Button
                  onClick={handleCreateCaptainChat}
                  disabled={createCaptainChatMutation.isPending}
                  className="w-full"
                  data-testid="button-create-captain-chat"
                >
                  {createCaptainChatMutation.isPending ? 'Creating...' : 'Create Captain Chat'}
                </Button>
              </div>
            )}

            {/* Group Title for Custom Group Chat */}
            {conversationType === 'custom_group' && (selectedLeague || (userLeagues.length === 1 && userLeagues[0])) && (
              <div>
                <label className="text-sm font-medium mb-2 block">Group Name</label>
                <Input
                  placeholder="Enter group name..."
                  value={groupTitle}
                  onChange={(e) => setGroupTitle(e.target.value)}
                  data-testid="input-group-title"
                />
              </div>
            )}

            {/* Search Contacts */}
            {(conversationType === 'direct' || conversationType === 'custom_group') && (selectedLeague || (userLeagues.length === 1 && userLeagues[0])) && (
              <>
                <Input
                  placeholder="Search contacts..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  data-testid="input-search-contacts"
                />
                
                {/* Contacts List */}
                <div className="max-h-64 overflow-y-auto space-y-2">
                  {contactsLoading ? (
                    <div className="space-y-2" data-testid="contacts-loading">
                      {[1, 2, 3].map(i => (
                        <div key={i} className="flex items-center gap-3 p-3 border rounded-lg animate-pulse">
                          <div className="w-8 h-8 bg-muted rounded-full"></div>
                          <div className="flex-1">
                            <div className="h-4 bg-muted rounded w-2/3 mb-1"></div>
                            <div className="h-3 bg-muted rounded w-1/2"></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : filteredContacts.length > 0 ? (
                    <div className="space-y-2" data-testid="contacts-list">
                      {filteredContacts.map((contact) => (
                        <div 
                          key={contact.id}
                          className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                            conversationType === 'custom_group' && selectedContacts.includes(contact.id)
                              ? 'bg-primary/10 border-primary'
                              : 'hover:bg-accent/50'
                          }`}
                          onClick={() => {
                            if (conversationType === 'direct') {
                              handleStartConversation(contact);
                            } else if (conversationType === 'custom_group') {
                              toggleContactSelection(contact.id);
                            }
                          }}
                          data-testid={`contact-${contact.id}`}
                        >
                          <div className="w-8 h-8 bg-muted rounded-full flex items-center justify-center">
                            <span className="text-xs font-semibold">
                              {getInitials(getContactDisplayName(contact))}
                            </span>
                          </div>
                          <div className="flex-1">
                            <p className="font-medium text-sm" data-testid={`text-contact-name-${contact.id}`}>
                              {getContactDisplayName(contact)}
                            </p>
                            {contact.position && (
                              <p className="text-xs text-muted-foreground" data-testid={`text-contact-position-${contact.id}`}>
                                {contact.position}
                                {contact.jerseyNumber && ` #${contact.jerseyNumber}`}
                              </p>
                            )}
                          </div>
                          {conversationType === 'direct' ? (
                            <UserPlus className="w-4 h-4 text-muted-foreground" />
                          ) : conversationType === 'custom_group' ? (
                            <input
                              type="checkbox"
                              checked={selectedContacts.includes(contact.id)}
                              onChange={() => {}}
                              className="w-4 h-4"
                              data-testid={`checkbox-contact-${contact.id}`}
                            />
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-6" data-testid="no-contacts-found">
                      <Users className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">
                        {searchQuery ? 'No contacts found' : 'No contacts available'}
                      </p>
                    </div>
                  )}
                </div>

                {/* Create Custom Group Button */}
                {conversationType === 'custom_group' && selectedContacts.length > 0 && groupTitle.trim() && (
                  <Button
                    onClick={handleCreateCustomGroup}
                    disabled={createCustomGroupMutation.isPending}
                    className="w-full"
                    data-testid="button-create-custom-group"
                  >
                    {createCustomGroupMutation.isPending ? 'Creating...' : `Create Group (${selectedContacts.length} members)`}
                  </Button>
                )}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
      <div className="h-full flex flex-col relative" data-testid="messages-page">
        <FeatureLockOverlay isLocked={false} className="h-full flex flex-col">
      {!selectedConversation ? (
        <>
          {/* Conversations List Header */}
          <div className="sticky top-0 z-50 p-6 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border pt-[12px] pb-[12px] mt-[12px] mb-[12px] pl-[36px] pr-[36px]">
            <div className="flex items-center justify-between mb-6">
              <h1 className="text-2xl font-bold" data-testid="text-page-title">Messages</h1>
{canAccessPremiumFeatures() ? (
                <button 
                  className="text-primary" 
                  data-testid="button-new-message"
                  onClick={() => {
                    setShowContactDiscovery(true);
                    if (userLeagues.length === 1) {
                      setSelectedLeague(userLeagues[0].id);
                    }
                  }}
                >
                  <Edit className="w-5 h-5" />
                </button>
              ) : (
                <button 
                  className="text-muted-foreground cursor-not-allowed relative group" 
                  data-testid="button-new-message-locked"
                  onClick={() => {
                    toast({
                      title: "Premium Feature",
                      description: "Upgrade to Player Pro or Commissioner to start new conversations",
                      variant: "destructive"
                    });
                  }}
                >
                  <Edit className="w-5 h-5" />
                </button>
              )}
            </div>
          </div>
          
          {/* Conversations List */}
          <div className="px-6 mb-6 flex-1">
            {conversationsLoading ? (
              <div className="space-y-3" data-testid="conversations-loading">
                {[1, 2, 3].map(i => (
                  <div key={i} className="bg-card rounded-lg border border-border p-4 animate-pulse">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-muted rounded-full"></div>
                      <div className="flex-1">
                        <div className="h-4 bg-muted rounded w-1/3 mb-2"></div>
                        <div className="h-3 bg-muted rounded w-1/2"></div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : conversations.length > 0 ? (
              <div className="space-y-3" data-testid="conversations-list">
                {conversations.map((conversation: Conversation) => (
                  <div 
                    key={conversation.id}
                    className="rounded-lg border border-border p-4 cursor-pointer hover:bg-accent/50 transition-colors group dark:bg-[#212121] bg-[#e2e2e2]" 
                    data-testid={`card-conversation-${conversation.id}`}
                    onClick={() => setSelectedConversation(conversation.id)}
                  >
                    <div className="flex items-center gap-3">
                      {/* Enhanced Avatar Display */}
                      <div className="relative">
                        {conversation.type === 'team_group' || conversation.type === 'custom_group' ? (
                          // Group chat avatar
                          (<div className="w-10 h-10 bg-muted rounded-full flex items-center justify-center">
                            <Users className="w-5 h-5 text-muted-foreground" />
                          </div>)
                        ) : (
                          // Direct message avatar - show profile pic if available
                          ((() => {
                            const profileImageUrl = getOtherParticipantProfileImage(conversation);
                            const imageUrl = getImageUrl(profileImageUrl);
                            return imageUrl ? (
                              <img 
                                src={imageUrl} 
                                alt=""
                                className="w-10 h-10 rounded-full object-cover"
                              />
                            ) : (
                              <div className="w-10 h-10 bg-muted rounded-full flex items-center justify-center">
                                <span className="text-muted-foreground text-sm font-semibold">
                                  {getInitials(getParticipantName(conversation))}
                                </span>
                              </div>
                            );
                          })())
                        )}
                      </div>
                      
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold" data-testid={`text-conversation-name-${conversation.id}`}>
                            {getParticipantName(conversation)}
                          </h3>
                          {/* Unread message indicator */}
                          {unreadCountsMap[conversation.id] > 0 && (
                            <div className="bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold" data-testid={`badge-unread-${conversation.id}`}>
                              {unreadCountsMap[conversation.id] > 99 ? '99+' : unreadCountsMap[conversation.id]}
                            </div>
                          )}
                          {/* Group chat type indicator */}
                        </div>
                        
                        {/* Enhanced last message display */}
                        {conversation.lastMessage && (
                          <p className="text-sm text-muted-foreground truncate" data-testid={`text-last-message-${conversation.id}`}>
                            {conversation.lastMessage.content}
                          </p>
                        )}
                        
                        
                      </div>
                      
                      {/* Conditional Delete/Leave conversation button */}
                      {canUserManageConversation(conversation) ? (
                        <button
                          onClick={(e) => handleDeleteConversation(conversation.id, e)}
                          className="p-2 hover:bg-destructive/20 rounded-lg transition-colors"
                          title="Delete conversation"
                          data-testid={`button-delete-conversation-${conversation.id}`}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </button>
                      ) : (
                        // Show Leave button for conversations user can't delete (now includes direct and captain chats)
                        (<button
                          onClick={(e) => handleLeaveConversation(conversation.id, e)}
                          className="p-2 hover:bg-orange-500/20 rounded-lg transition-colors"
                          title="Leave conversation"
                          data-testid={`button-leave-conversation-${conversation.id}`}
                        >
                          <LogOut className="w-4 h-4 text-orange-600" />
                        </button>)
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12" data-testid="empty-conversations">
                <MessageCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">No conversations yet</p>
                <p className="text-sm text-muted-foreground mt-2">Start a conversation with your teammates</p>
              </div>
            )}
          </div>
        </>
      ) : !isConversationAllowedForFreeTier ? (
        /* FREE TIER RESTRICTION: Block access to unauthorized conversations */
        <>
          <div className="sticky top-0 z-50 p-4 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 pt-[12px] pb-[12px] pl-[12px] pr-[12px]" data-testid="chat-header">
            <div className="flex items-center gap-3">
              <button 
                onClick={() => setSelectedConversation(null)}
                className="p-2 hover:bg-accent rounded-lg transition-colors" 
                data-testid="button-back"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div className="flex-1">
                <h2 className="font-semibold" data-testid="text-chat-title">Premium Feature</h2>
              </div>
            </div>
          </div>
          <div className="flex flex-col items-center justify-center p-8 flex-1">
            <div className="w-16 h-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <MessageCircle className="w-8 h-8 text-primary" />
            </div>
            <h3 className="text-xl font-semibold mb-2">Premium Feature</h3>
            <p className="text-muted-foreground text-center max-w-sm mb-6">
              {currentConversation?.type === 'direct' 
                ? 'Direct messaging is available with a Player Pro or Commissioner subscription.'
                : currentConversation?.type === 'captain_only'
                ? 'Captain chat is available with a Player Pro or Commissioner subscription.'
                : 'This conversation is available with a Player Pro or Commissioner subscription.'}
            </p>
            <Button 
              onClick={() => {
                setPageTransitionDirection('up');
                navigate('/subscription');
              }}
              size="lg"
              data-testid="button-upgrade-conversation"
            >
              Upgrade to Access
            </Button>
          </div>
        </>
      ) : (
        <>
          {/* Chat Header */}
          <div className="sticky top-0 z-50 p-4 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 pt-[12px] pb-[12px] pl-[12px] pr-[12px]" data-testid="chat-header">
            <div className="flex items-center gap-3">
              <button 
                onClick={() => setSelectedConversation(null)}
                className="p-2 hover:bg-accent rounded-lg transition-colors" 
                data-testid="button-back"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <button 
                onClick={() => setShowMembersModal(true)}
                className="w-8 h-8 bg-muted rounded-full flex items-center justify-center hover:bg-accent transition-colors cursor-pointer"
                data-testid="button-show-members"
                title="View group members"
              >
                <Users className="w-4 h-4 text-muted-foreground" />
              </button>
              <div className="flex-1">
                <h2 className="font-semibold" data-testid="text-chat-title">{getChatTitle()}</h2>
                <p className="text-xs text-muted-foreground" data-testid="text-chat-status">
                  {onlineUsers.length > 0 ? `${onlineUsers.length} online` : 'Team members'}
                </p>
              </div>
              
            </div>
          </div>
          
          
          {/* Messages */}
          <div 
            className={`flex-1 relative ${conversationTeam?.logoUrl ? 'bg-white dark:bg-black' : ''}`}
            data-testid="messages-container"
          >
            {/* Team logo background for team group chats - fixed in place */}
            {conversationTeam?.logoUrl && (
              <div 
                className="absolute inset-0 pointer-events-none flex items-center justify-center overflow-hidden z-0"
              >
                <img 
                  src={getImageUrl(conversationTeam.logoUrl) || ''} 
                  alt="" 
                  className="w-full object-contain opacity-90"
                  style={{ maxHeight: '100%' }}
                />
              </div>
            )}
            <div ref={messagesScrollRef} className="absolute inset-0 overflow-y-auto z-10">
            <div className="relative p-4 space-y-4 pb-4">
            {messagesLoading ? (
              <div className="space-y-4" data-testid="messages-loading">
                {[1, 2, 3].map(i => (
                  <div key={i} className="flex gap-3 animate-pulse">
                    <div className="w-8 h-8 bg-muted rounded-full"></div>
                    <div className="flex-1 space-y-2">
                      <div className="h-3 bg-muted rounded w-1/4"></div>
                      <div className="h-4 bg-muted rounded w-3/4"></div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              timelineItems.map((item) => {
                if (item.type === 'payment') {
                  return (
                    <PaymentRequestCard 
                      key={item.data.id}
                      paymentRequestId={item.data.id}
                      currentUserId={currentUserId}
                    />
                  );
                }
                
                const message = item.data;
                const isCurrentUser = message.senderId === currentUserId;
                const isFirstUnread = firstUnreadMessage?.id === message.id;
                
                return (
                  <div 
                    key={message.id} 
                    ref={isFirstUnread ? firstUnreadMessageRef : null}
                    className={`flex gap-3 items-start ${isCurrentUser ? 'justify-end' : 'justify-start'}`} 
                    data-testid={`message-${message.id}`}
                  >
                    {!isCurrentUser && message.sender && (
                      <div className="order-1">
                        <ClickableAvatar
                          userId={message.senderId}
                          profileImageUrl={message.sender.profileImageUrl}
                          firstName={message.sender.firstName}
                          lastName={message.sender.lastName}
                          size="sm"
                        />
                      </div>
                    )}
                    
                    <div className={`${message.messageType === 'poll' ? 'w-3/4 lg:max-w-[20%]' : 'max-w-[70%]'} ${isCurrentUser ? 'order-1' : 'order-2'}`}>
                      <div className={`rounded-lg p-3 ${
                        isCurrentUser 
                          ? 'text-white ml-auto' 
                          : 'text-white'
                      }`} style={{ backgroundColor: isCurrentUser ? '#3c82f4' : '#212121' }}>
                        {!isCurrentUser && (
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-semibold text-xs" data-testid={`text-message-sender-${message.id}`}>
                              {message.sender?.firstName || 'Unknown User'}{message.sender?.lastName ? ` ${message.sender.lastName}` : ''}
                            </span>
                            <span className="text-xs opacity-70" data-testid={`text-message-time-${message.id}`}>
                              {formatMessageTime(message.sentAt)}
                            </span>
                          </div>
                        )}
                        {isCurrentUser && (
                          <div className="flex items-center gap-2 mb-1 justify-end">
                            <span className="text-xs opacity-70" data-testid={`text-message-time-${message.id}`}>
                              {formatMessageTime(message.sentAt)}
                            </span>
                            {message.readReceipts.length > 0 && (
                              <span className="text-xs opacity-70" data-testid={`text-read-status-${message.id}`}>
                                ✓ Read
                              </span>
                            )}
                          </div>
                        )}
                        {message.messageType !== 'gif' && (
                          <p className="text-sm" data-testid={`text-message-content-${message.id}`}>
                            {message.content}
                          </p>
                        )}
                        
                        {/* Poll Display */}
                        {message.messageType === 'poll' && (
                          <PollCard message={message} currentUserId={currentUserId} />
                        )}
                        
                        {message.attachments && message.attachments.length > 0 && (
                          <div className="mt-2 space-y-2" data-testid={`message-attachments-${message.id}`}>
                            {message.attachments.map((attachment: any, index: number) => {
                              const isImage = attachment.mimeType?.startsWith('image/');
                              const isVideo = attachment.mimeType?.startsWith('video/');
                              const isGif = attachment.mimeType === 'image/gif' || message.messageType === 'gif';
                              
                              return (
                                <div key={index} className={isImage || isVideo || isGif ? "mt-2" : "flex items-center gap-2 p-2 bg-background/20 rounded border"}>
                                  {isGif && (
                                    <div 
                                      className="relative cursor-pointer rounded-lg overflow-hidden max-w-xs border"
                                      onClick={() => openMediaGallery(message.attachments, index)}
                                      data-testid={`gif-preview-${index}`}
                                    >
                                      <img
                                        src={attachment.url}
                                        alt={attachment.filename || 'GIF'}
                                        className="w-full h-auto max-h-64 object-contain hover:opacity-90 transition-opacity rounded"
                                        loading="lazy"
                                      />
                                      <div className="absolute inset-0 bg-black/0 hover:bg-black/10 transition-colors flex items-center justify-center">
                                        <div className="opacity-0 hover:opacity-100 transition-opacity bg-black/50 rounded-full p-2">
                                          <Search className="w-4 h-4 text-white" />
                                        </div>
                                      </div>
                                      {/* GIF indicator */}
                                      <div className="absolute bottom-2 left-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
                                        GIF
                                      </div>
                                    </div>
                                  )}

                                  {isImage && !isGif && (
                                    <div 
                                      className="relative cursor-pointer rounded-lg overflow-hidden max-w-xs border"
                                      onClick={() => openMediaGallery(message.attachments, index)}
                                      data-testid={`image-preview-${index}`}
                                    >
                                      <img
                                        src={attachment.url}
                                        alt={attachment.filename}
                                        className="w-full h-auto max-h-48 object-cover hover:opacity-90 transition-opacity"
                                      />
                                      <div className="absolute inset-0 bg-black/0 hover:bg-black/10 transition-colors flex items-center justify-center">
                                        <div className="opacity-0 hover:opacity-100 transition-opacity bg-black/50 rounded-full p-2">
                                          <Search className="w-4 h-4 text-white" />
                                        </div>
                                      </div>

                                    </div>
                                  )}
                                  
                                  {isVideo && (
                                    <div 
                                      className="relative cursor-pointer rounded-lg overflow-hidden max-w-xs border"
                                      onClick={() => openMediaGallery(message.attachments, index)}
                                      data-testid={`video-preview-${index}`}
                                    >
                                      <video
                                        src={attachment.url}
                                        className="w-full h-auto max-h-48 object-cover"
                                        poster={attachment.thumbnailUrl}
                                      />
                                      <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                                        <div className="bg-black/50 rounded-full p-3">
                                          <Video className="w-6 h-6 text-white" />
                                        </div>
                                      </div>

                                    </div>
                                  )}
                                  
                                  {!isImage && !isVideo && (
                                    <>
                                      {getFileIcon(attachment.mimeType || '')}
                                      <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium truncate">{attachment.filename}</p>
                                        <p className="text-xs opacity-70">
                                          {attachment.fileSize ? (attachment.fileSize / 1024).toFixed(1) + ' KB' : 'Unknown size'}
                                        </p>
                                      </div>
                                      <a 
                                        href={attachment.url} 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        className="text-primary hover:underline text-sm"
                                        data-testid={`attachment-link-${index}`}
                                      >
                                        Download
                                      </a>
                                    </>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
            
            {/* Typing indicators */}
            {typingUsers.length > 0 && (
              <div className="flex gap-3 opacity-75" data-testid="typing-indicators">
                <div className="w-8 h-8 bg-muted rounded-full flex items-center justify-center">
                  <span className="text-muted-foreground text-xs font-semibold">...</span>
                </div>
                <div className="flex-1">
                  <p className="text-sm text-muted-foreground italic" data-testid="text-typing-status">
                    {typingUsers.length === 1 
                      ? 'Someone is typing...' 
                      : `${typingUsers.length} people are typing...`
                    }
                  </p>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
            </div>
            </div>
          </div>
        </>
      )}
        </FeatureLockOverlay>
      {/* Message Input - only show when conversation is selected and accessible */}
      {selectedConversation && (canAccessPremiumFeatures() || isConversationAllowedForFreeTier) && (
        <div 
          ref={inputContainerRef}
          className="bg-background border-t border-border p-4"
          style={{ marginBottom: keyboardHeight > 0 ? `${keyboardHeight}px` : '64px' }}
          data-testid="message-input-container"
        >
          {/* File previews */}
          {selectedFiles.length > 0 && (
            <div className="mb-3 space-y-2" data-testid="selected-files">
              {selectedFiles.map((file, index) => (
                <div key={index} className="flex items-center gap-2 p-2 bg-muted rounded border">
                  {getFileIcon(file.type)}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(file.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                  <button 
                    onClick={() => removeFile(index)}
                    className="p-1 hover:bg-accent rounded"
                    data-testid={`remove-file-${index}`}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
          
          {/* Poll Creator */}
          {showPollCreator && (
            <div className="mb-3 p-4 bg-muted rounded-lg border" data-testid="poll-creator">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-medium">Create Poll</h4>
                <button
                  onClick={() => setShowPollCreator(false)}
                  className="p-1 hover:bg-accent rounded"
                  data-testid="button-close-poll-creator"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium mb-1 block">Poll Question</label>
                  <Input
                    value={pollQuestion}
                    onChange={(e) => setPollQuestion(e.target.value)}
                    placeholder="Ask a question..."
                    data-testid="input-poll-question"
                  />
                </div>
                
                <div>
                  <label className="text-sm font-medium mb-1 block">Options</label>
                  <div className="space-y-2">
                    {pollOptions.map((option, index) => (
                      <div key={index} className="flex gap-2">
                        <Input
                          value={option}
                          onChange={(e) => updatePollOption(index, e.target.value)}
                          placeholder={`Option ${index + 1}`}
                          data-testid={`input-poll-option-${index}`}
                        />
                        {pollOptions.length > 2 && (
                          <button
                            onClick={() => removePollOption(index)}
                            className="p-2 hover:bg-accent rounded"
                            data-testid={`button-remove-option-${index}`}
                          >
                            <Minus className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  
                  {pollOptions.length < 6 && (
                    <button
                      onClick={addPollOption}
                      className="mt-2 flex items-center gap-1 text-sm text-primary hover:underline"
                      data-testid="button-add-poll-option"
                    >
                      <Plus className="w-3 h-3" />
                      Add option
                    </button>
                  )}
                </div>
                
                
                <div className="flex gap-2">
                  <Button
                    onClick={handleCreatePoll}
                    disabled={createPollMutation.isPending}
                    className="flex-1"
                    data-testid="button-post-poll"
                  >
                    {createPollMutation.isPending ? 'Creating...' : 'Post Poll'}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setShowPollCreator(false)}
                    data-testid="button-cancel-poll"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Payment Request Creator */}
          {showPaymentRequestCreator && (
            <div className="mb-3 p-4 bg-muted rounded-lg border" data-testid="payment-request-creator">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-medium">Request Payment</h4>
                <button
                  onClick={() => setShowPaymentRequestCreator(false)}
                  className="p-1 hover:bg-accent rounded"
                  data-testid="button-close-payment-request"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium mb-1 block">Title *</label>
                  <Input
                    value={paymentRequestTitle}
                    onChange={(e) => setPaymentRequestTitle(e.target.value)}
                    placeholder="e.g., Ice rink fee, Team dinner"
                    data-testid="input-payment-title"
                  />
                </div>
                
                <div>
                  <label className="text-sm font-medium mb-1 block">Amount per person ($) *</label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={paymentRequestAmount}
                    onChange={(e) => setPaymentRequestAmount(e.target.value)}
                    placeholder="25.00"
                    data-testid="input-payment-amount"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium mb-1 block">Description (optional)</label>
                  <Input
                    value={paymentRequestDescription}
                    onChange={(e) => setPaymentRequestDescription(e.target.value)}
                    placeholder="Additional details..."
                    data-testid="input-payment-description"
                  />
                </div>
                
                <div>
                  <label className="text-sm font-medium mb-1 block">Request from *</label>
                  <div className="space-y-2 max-h-40 overflow-y-auto border rounded p-2">
                    {currentConversation?.participants
                      ?.filter(p => p.userId !== user?.id)
                      .map(participant => (
                        <label 
                          key={participant.userId} 
                          className="flex items-center gap-2 cursor-pointer hover:bg-accent p-1 rounded"
                          data-testid={`checkbox-recipient-${participant.userId}`}
                        >
                          <input
                            type="checkbox"
                            checked={selectedRecipients.includes(participant.userId)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedRecipients([...selectedRecipients, participant.userId]);
                              } else {
                                setSelectedRecipients(selectedRecipients.filter(id => id !== participant.userId));
                              }
                            }}
                            className="cursor-pointer"
                          />
                          <span className="text-sm">
                            {participant.user?.displayName || participant.user?.email || 'Unknown'}
                          </span>
                        </label>
                      ))}
                  </div>
                  {selectedRecipients.length > 0 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {selectedRecipients.length} person{selectedRecipients.length !== 1 ? 's' : ''} selected
                    </p>
                  )}
                </div>
                
                <div className="flex gap-2">
                  <Button
                    onClick={handleCreatePaymentRequest}
                    disabled={createPaymentRequestMutation.isPending}
                    className="flex-1"
                    data-testid="button-send-payment-request"
                  >
                    {createPaymentRequestMutation.isPending ? 'Sending...' : 'Send Request'}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setShowPaymentRequestCreator(false)}
                    data-testid="button-cancel-payment-request"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          )}
          
          <div className="flex items-end gap-2">
            {/* FREE TIER RESTRICTION: Attachments disabled for free tier - greyed out */}
            <button 
              onClick={() => {
                if (isFreeTier) {
                  toast({
                    title: "Premium Feature",
                    description: "Upgrade to Player Pro to send attachments",
                  });
                  return;
                }
                fileInputRef.current?.click();
              }}
              className={`p-2 rounded transition-colors mb-1 relative ${isFreeTier ? 'opacity-40 cursor-not-allowed text-muted-foreground' : 'hover:bg-accent'}`}
              data-testid="button-attach-file-basic"
              title={isFreeTier ? "Upgrade to send attachments" : "Attach file"}
            >
              <Paperclip className="w-4 h-4" />
            </button>
            <button 
              onClick={() => {
                if (isFreeTier) {
                  toast({
                    title: "Premium Feature",
                    description: "Upgrade to Player Pro to send GIFs",
                  });
                  return;
                }
                setGifModalOpen(true);
              }}
              className={`p-2 rounded transition-colors mb-1 relative ${isFreeTier ? 'opacity-40 cursor-not-allowed text-muted-foreground' : 'hover:bg-accent'}`}
              data-testid="button-gif-search"
              title={isFreeTier ? "Upgrade to send GIFs" : "Send GIF"}
            >
              <Smile className="w-4 h-4" />
            </button>
            <button 
              onClick={() => {
                if (isFreeTier) {
                  toast({
                    title: "Premium Feature",
                    description: "Upgrade to Player Pro to create polls",
                  });
                  return;
                }
                setShowPollCreator(!showPollCreator);
              }}
              className={`p-2 rounded transition-colors mb-1 ${isFreeTier ? 'opacity-40 cursor-not-allowed text-muted-foreground' : 'hover:bg-accent'}`}
              data-testid="button-create-poll"
              title={isFreeTier ? "Upgrade to create polls" : "Create Poll"}
            >
              <BarChart3 className="w-4 h-4" />
            </button>
            <button 
              onClick={() => {
                if (isFreeTier) {
                  toast({
                    title: "Premium Feature",
                    description: "Upgrade to Player Pro to request payments",
                  });
                  return;
                }
                setShowPaymentRequestCreator(!showPaymentRequestCreator);
              }}
              className={`p-2 rounded transition-colors mb-1 ${isFreeTier ? 'opacity-40 cursor-not-allowed text-muted-foreground' : 'hover:bg-accent'}`}
              data-testid="button-request-payment"
              title={isFreeTier ? "Upgrade to request payments" : "Request Payment"}
            >
              <DollarSign className="w-4 h-4" />
            </button>
            <textarea
              ref={textareaRef}
              placeholder="Type a message..."
              value={newMessage}
              onChange={handleInputChange}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              onBlur={handleTypingStop}
              className="flex-1 resize-none overflow-y-auto min-h-[40px] max-h-[120px] py-2 px-3 rounded-md border border-input bg-background text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              rows={1}
              data-testid="input-message"
            />
            <Button 
              onClick={handleSendMessage}
              disabled={(!newMessage.trim() && selectedFiles.length === 0) || sendMessageMutation.isPending || isUploadingFiles}
              className="mb-1"
              data-testid="button-send-message"
            >
              {isUploadingFiles ? (
                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
            
            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleFileSelect}
              className="hidden"
              accept="*/*"
              data-testid="file-input"
            />
          </div>
        </div>
      )}
      </div>
      {/* Media Gallery */}
      <MediaGallery
        items={galleryItems}
        currentIndex={galleryIndex}
        isOpen={galleryOpen}
        onClose={() => setGalleryOpen(false)}
        onIndexChange={setGalleryIndex}
      />
      {/* GIF Search Modal */}
      <GifSearchModal
        open={gifModalOpen}
        onOpenChange={setGifModalOpen}
        onSelectGif={handleGifSelect}
      />
      {/* Group Members Modal */}
      <Dialog open={showMembersModal} onOpenChange={setShowMembersModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5" />
                Group Members
                {currentConversation?.participants && (
                  <span className="text-sm font-normal text-muted-foreground">
                    ({currentConversation.participants.length})
                  </span>
                )}
              </div>
              {currentConversation?.type !== 'direct' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAddUserModal(true)}
                  className="ml-auto"
                  data-testid="button-add-user"
                >
                  <UserPlus className="w-4 h-4 mr-2" />
                  Add User
                </Button>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {currentConversation?.participants?.map((participant) => {
              return (
                <div
                  key={participant.id}
                  className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-accent/50 transition-colors"
                  data-testid={`member-${participant.userId}`}
                >
                  <ClickableAvatar
                    userId={participant.userId}
                    profileImageUrl={participant.user?.profileImageUrl}
                    firstName={participant.user?.firstName}
                    lastName={participant.user?.lastName}
                    size="sm"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate" data-testid={`member-name-${participant.userId}`}>
                      {participant.user?.displayName || 'Unknown User'}
                    </p>
                  </div>
                  {participant.userId === currentUserId && (
                    <span className="text-xs text-muted-foreground bg-green-500 text-white px-2 py-1 rounded">
                      You
                    </span>
                  )}
                </div>
              );
            })}
            {(!currentConversation?.participants || currentConversation.participants.length === 0) && (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>No members found</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
      {/* Add User Modal */}
      <Dialog open={showAddUserModal} onOpenChange={setShowAddUserModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="w-5 h-5" />
              Add User to Group
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {getAvailableUsersToAdd().length > 0 ? (
              <>
                <p className="text-sm text-muted-foreground">
                  Select a user to add to this group conversation:
                </p>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {getAvailableUsersToAdd().map((contact) => (
                    <div
                      key={contact.id}
                      className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                        selectedUserToAdd === contact.id
                          ? 'bg-primary/10 border-2 border-primary'
                          : 'hover:bg-accent/50 border-2 border-transparent'
                      }`}
                      onClick={() => setSelectedUserToAdd(contact.id)}
                      data-testid={`add-user-option-${contact.id}`}
                    >
                      <ClickableAvatar
                        userId={contact.id}
                        profileImageUrl={contact.profileImageUrl}
                        firstName={contact.displayFirstName || contact.firstName}
                        lastName={contact.displayLastName || contact.lastName}
                        size="sm"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate" data-testid={`add-user-name-${contact.id}`}>
                          {contact.displayFirstName || contact.firstName} {contact.displayLastName || contact.lastName}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2 justify-end pt-4">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowAddUserModal(false);
                      setSelectedUserToAdd(null);
                    }}
                    data-testid="button-cancel-add-user"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleAddUserToConversation}
                    disabled={!selectedUserToAdd || addUserToConversationMutation.isPending}
                    data-testid="button-confirm-add-user"
                  >
                    {addUserToConversationMutation.isPending ? (
                      <>
                        <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
                        Adding...
                      </>
                    ) : (
                      <>
                        <UserPlus className="w-4 h-4 mr-2" />
                        Add User
                      </>
                    )}
                  </Button>
                </div>
              </>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>No users available to add</p>
                <p className="text-sm mt-1">All league members are already in this conversation.</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
