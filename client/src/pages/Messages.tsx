// 🚨 SUBSCRIPTION SYSTEM REMOVED - ALL FEATURES FREE! 🚨
// import { SubscriptionGate } from '@/components/SubscriptionGate'; // DELETED
// import { useSubscription } from '@/context/SubscriptionContext'; // REMOVED
import { useQuery, useMutation } from '@tanstack/react-query';
import { MessageCircle, Users, Edit, Send, ArrowLeft, MoreVertical, Phone, Video, Info, Paperclip, X, File, Image, Search, UserPlus } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useAuth } from '@/hooks/useAuth';
import { League } from '@shared/schema';

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

export default function Messages() {
  // 🚨 SUBSCRIPTION REMOVED - FULL ACCESS GRANTED! 🚨
  const hasAccess = () => true; // All features unlocked!
  const tier = 'commissioner'; // Everyone is commissioner now!
  const { user } = useAuth();
  const currentUserId = (user as any)?.id;
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [newMessage, setNewMessage] = useState('');
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isUploadingFiles, setIsUploadingFiles] = useState(false);
  const [showContactDiscovery, setShowContactDiscovery] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLeague, setSelectedLeague] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // Fetch user's leagues for contact discovery
  const { data: userLeagues = [] } = useQuery<League[]>({
    queryKey: ['/api/user/leagues'],
    enabled: true // 🚨 FREE ACCESS - NO GATES! 🚨
  });

  // Fetch contacts for selected league
  const { data: contacts = [], isLoading: contactsLoading } = useQuery<Contact[]>({
    queryKey: ['/api/leagues', selectedLeague, 'contacts'],
    enabled: !!selectedLeague && hasAccess('player_plus')
  });

  // Fetch conversations
  const { data: conversations = [], isLoading: conversationsLoading } = useQuery<Conversation[]>({
    queryKey: ['/api/conversations'],
    enabled: true // 🚨 FREE ACCESS - NO GATES! 🚨
  });

  // Fetch messages for selected conversation
  const { data: messages = [], isLoading: messagesLoading } = useQuery<Message[]>({
    queryKey: ['/api/conversations', selectedConversation, 'messages'],
    enabled: !!selectedConversation && hasAccess('player_plus')
  });

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
      toast({
        title: 'Conversation started',
        description: 'You can now send messages'
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
  
  // File upload functions
  const uploadFiles = async (files: File[]): Promise<any[]> => {
    const uploadPromises = files.map(async (file) => {
      try {
        // Get upload URL
        const uploadUrlResponse = await apiRequest('POST', '/api/message-attachments/upload');
        const { uploadURL } = await uploadUrlResponse.json();
        
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
        
        // Extract file path from upload URL
        const fileUrl = uploadURL.split('?')[0]; // Remove query parameters
        
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
            
            {/* Search Contacts */}
            {selectedLeague && (
              <>
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search contacts..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                    data-testid="input-search-contacts"
                  />
                </div>
                
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
                          className="flex items-center gap-3 p-3 border rounded-lg hover:bg-accent/50 cursor-pointer transition-colors"
                          onClick={() => handleStartConversation(contact)}
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
                          <UserPlus className="w-4 h-4 text-muted-foreground" />
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
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <div className="min-h-screen flex flex-col pb-24" data-testid="messages-page">
      {!selectedConversation ? (
        <>
          {/* Conversations List Header */}
          <div className="p-6 pt-12">
            <div className="flex items-center justify-between mb-6">
              <h1 className="text-2xl font-bold" data-testid="text-page-title">Messages</h1>
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
                    {message.attachments && message.attachments.length > 0 && (
                      <div className="mt-2 space-y-2" data-testid={`message-attachments-${message.id}`}>
                        {message.attachments.map((attachment: any, index: number) => (
                          <div key={index} className="flex items-center gap-2 p-2 bg-muted rounded border">
                            {getFileIcon(attachment.mimeType || '')}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{attachment.filename}</p>
                              <p className="text-xs text-muted-foreground">
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
                          </div>
                        ))}
                      </div>
                    )}
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
            
            <div className="flex items-center gap-2">
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="p-2 hover:bg-accent rounded transition-colors"
                data-testid="button-attach-file"
              >
                <Paperclip className="w-4 h-4" />
              </button>
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
                disabled={(!newMessage.trim() && selectedFiles.length === 0) || sendMessageMutation.isPending || isUploadingFiles}
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
        </>
      )}
    </div>
    </>
  );
}
