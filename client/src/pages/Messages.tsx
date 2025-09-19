import { SubscriptionGate } from '@/components/SubscriptionGate';
import { useSubscription } from '@/context/SubscriptionContext';
import { useQuery, useMutation } from '@tanstack/react-query';
import { MessageCircle, Users, Edit, Send, ArrowLeft, MoreVertical, Phone, Video, Info } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useAuth } from '@/hooks/useAuth';

interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  messageType: 'text' | 'image' | 'gif' | 'file';
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
  name?: string;
  type: 'direct' | 'team';
  leagueId: string;
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
  };
}

export default function Messages() {
  const { hasAccess, tier } = useSubscription();
  const { user } = useAuth();
  const currentUserId = (user as any)?.id;
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [newMessage, setNewMessage] = useState('');
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const { toast } = useToast();

  // Fetch conversations
  const { data: conversations = [], isLoading: conversationsLoading } = useQuery<Conversation[]>({
    queryKey: ['/api/conversations'],
    enabled: hasAccess('player_plus')
  });

  // Fetch messages for selected conversation
  const { data: messages = [], isLoading: messagesLoading } = useQuery<Message[]>({
    queryKey: ['/api/conversations', selectedConversation, 'messages'],
    enabled: !!selectedConversation && hasAccess('player_plus')
  });

  // Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: async (messageData: { content: string; messageType?: string }) => {
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

  // Persistent WebSocket connection for real-time updates
  useEffect(() => {
    if (!hasAccess('player_plus')) return;

    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${location.host}/ws`;
    
    const websocket = new WebSocket(wsUrl);
    
    websocket.onopen = () => {
      console.log('Connected to messaging WebSocket');
      wsRef.current = websocket;
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
          // Refresh messages to show updated read receipts
          if (data.conversationId === selectedConversation) {
            queryClient.invalidateQueries({ queryKey: ['/api/conversations', selectedConversation, 'messages'] });
          }
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
  }, [hasAccess]);
  
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

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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
  
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
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
  
  const handleSendMessage = () => {
    if (!newMessage.trim() || !selectedConversation) return;
    
    // Stop typing indicator when sending message
    handleTypingStop();
    
    sendMessageMutation.mutate({ content: newMessage.trim() });
  };
  
  // Mark message as read when viewing conversation
  const markMessageAsRead = async (messageId: string) => {
    try {
      await apiRequest('POST', `/api/messages/${messageId}/read`);
    } catch (error) {
      console.error('Failed to mark message as read:', error);
    }
  };
  
  // Mark messages as read when conversation is opened
  useEffect(() => {
    if (messages.length > 0 && selectedConversation && currentUserId) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage && lastMessage.senderId !== currentUserId) {
        markMessageAsRead(lastMessage.id);
      }
    }
  }, [messages, selectedConversation]);
  
  // Cleanup typing timeout on unmount
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, []);

  const formatMessageTime = (timestamp: string) => {
    return format(new Date(timestamp), 'h:mm a');
  };

  const formatConversationTime = (timestamp: string) => {
    const date = new Date(timestamp);
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
    if (conversation.type === 'team') {
      return conversation.name || 'Team Chat';
    }
    
    // For direct messages, find the other participant
    const otherParticipant = conversation.participants.find(p => p.user?.id !== currentUserId);
    return otherParticipant?.user?.displayName || 'Unknown User';
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase();
  };

  if (!hasAccess('player_plus')) {
    return (
      <div className="min-h-screen flex flex-col pb-24" data-testid="messages-page">
        <div className="p-6 pt-12">
          <h1 className="text-2xl font-bold mb-6" data-testid="text-page-title">Messages</h1>
        </div>
        <div className="px-6 mb-6">
          <SubscriptionGate requiredTier="player_plus">
            <div className="text-center py-8">
              <MessageCircle className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">Team Messages</h3>
              <p className="text-muted-foreground">
                Upgrade to Player Plus to access team messaging
              </p>
            </div>
          </SubscriptionGate>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col pb-24" data-testid="messages-page">
      {!selectedConversation ? (
        <>
          {/* Conversations List Header */}
          <div className="p-6 pt-12">
            <div className="flex items-center justify-between mb-6">
              <h1 className="text-2xl font-bold" data-testid="text-page-title">Messages</h1>
              <button className="text-primary" data-testid="button-new-message">
                <Edit className="w-5 h-5" />
              </button>
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
                    className="bg-card rounded-lg border border-border p-4 cursor-pointer hover:bg-accent/50 transition-colors" 
                    data-testid={`card-conversation-${conversation.id}`}
                    onClick={() => setSelectedConversation(conversation.id)}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-muted rounded-full flex items-center justify-center">
                        {conversation.type === 'team' ? (
                          <Users className="w-5 h-5 text-muted-foreground" />
                        ) : (
                          <span className="text-muted-foreground text-sm font-semibold">
                            {getInitials(getParticipantName(conversation))}
                          </span>
                        )}
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold" data-testid={`text-conversation-name-${conversation.id}`}>
                          {getParticipantName(conversation)}
                        </h3>
                        {conversation.lastMessage && (
                          <p className="text-sm text-muted-foreground truncate" data-testid={`text-last-message-${conversation.id}`}>
                            {conversation.lastMessage.content}
                          </p>
                        )}
                      </div>
                      <div className="text-right">
                        {conversation.lastMessage && (
                          <p className="text-xs text-muted-foreground" data-testid={`text-conversation-time-${conversation.id}`}>
                            {formatConversationTime(conversation.lastMessage.sentAt)}
                          </p>
                        )}
                      </div>
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
      ) : (
        <>
          {/* Chat Header */}
          <div className="p-4 pt-12 border-b border-border" data-testid="chat-header">
            <div className="flex items-center gap-3">
              <button 
                onClick={() => setSelectedConversation(null)}
                className="p-2 hover:bg-accent rounded-lg transition-colors" 
                data-testid="button-back"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div className="w-8 h-8 bg-muted rounded-full flex items-center justify-center">
                <Users className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="flex-1">
                <h2 className="font-semibold" data-testid="text-chat-title">Team Chat</h2>
                <p className="text-xs text-muted-foreground" data-testid="text-chat-status">
                  {onlineUsers.length > 0 ? `${onlineUsers.length} online` : 'Team members'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button className="p-2 hover:bg-accent rounded-lg transition-colors" data-testid="button-voice-call">
                  <Phone className="w-5 h-5" />
                </button>
                <button className="p-2 hover:bg-accent rounded-lg transition-colors" data-testid="button-video-call">
                  <Video className="w-5 h-5" />
                </button>
                <button className="p-2 hover:bg-accent rounded-lg transition-colors" data-testid="button-chat-info">
                  <Info className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
          
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4" data-testid="messages-container">
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
              messages.map((message: Message) => (
                <div key={message.id} className="flex gap-3" data-testid={`message-${message.id}`}>
                  <div className="w-8 h-8 bg-accent rounded-full flex items-center justify-center">
                    <span className="text-accent-foreground text-xs font-semibold">U</span>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-sm" data-testid={`text-message-sender-${message.id}`}>User</span>
                      <span className="text-xs text-muted-foreground" data-testid={`text-message-time-${message.id}`}>
                        {formatMessageTime(message.sentAt)}
                      </span>
                      {message.readReceipts.length > 0 && (
                        <span className="text-xs text-muted-foreground" data-testid={`text-read-status-${message.id}`}>
                          ✓ Read
                        </span>
                      )}
                    </div>
                    <p className="text-sm" data-testid={`text-message-content-${message.id}`}>
                      {message.content}
                    </p>
                  </div>
                </div>
              ))
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
          
          {/* Message Input */}
          <div className="p-4 border-t border-border" data-testid="message-input-container">
            <div className="flex items-center gap-2">
              <Input
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
                className="flex-1"
                data-testid="input-message"
              />
              <Button 
                onClick={handleSendMessage}
                disabled={!newMessage.trim() || sendMessageMutation.isPending}
                data-testid="button-send-message"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
