import { SubscriptionGate } from '@/components/SubscriptionGate';
import { useSubscription } from '@/context/SubscriptionContext';
import { useQuery } from '@tanstack/react-query';
import { MessageCircle, Users, Edit } from 'lucide-react';

export default function Messages() {
  const { hasAccess, tier } = useSubscription();

  return (
    <div className="min-h-screen flex flex-col pb-24" data-testid="messages-page">
      {/* Header */}
      <div className="p-6 pt-12">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Messages</h1>
          {hasAccess('player_plus') && (
            <button className="text-primary" data-testid="button-new-message">
              <Edit className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>
      
      {/* Content */}
      <div className="px-6 mb-6">
        {!hasAccess('player_plus') ? (
          <SubscriptionGate requiredTier="player_plus" />
        ) : (
          <>
            {/* Message Threads */}
            <div className="space-y-3" data-testid="message-threads">
              <div className="bg-card rounded-lg border border-border p-4" data-testid="card-team-chat">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-muted rounded-full flex items-center justify-center">
                    <Users className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold" data-testid="text-team-chat-title">Team Chat</h3>
                    <p className="text-sm text-muted-foreground" data-testid="text-team-chat-preview">
                      Mike: Great game tonight everyone! 🏒
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground" data-testid="text-team-chat-time">2h ago</p>
                    <span className="inline-block w-2 h-2 bg-primary rounded-full" data-testid="indicator-unread-team-chat"></span>
                  </div>
                </div>
              </div>
              
              <div className="bg-card rounded-lg border border-border p-4" data-testid="card-direct-message-1">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-accent rounded-full flex items-center justify-center">
                    <span className="text-accent-foreground text-sm font-semibold" data-testid="text-user-initials-1">JD</span>
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold" data-testid="text-user-name-1">John Davis</h3>
                    <p className="text-sm text-muted-foreground" data-testid="text-message-preview-1">Can you sub for Thursday?</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground" data-testid="text-message-time-1">1d ago</p>
                  </div>
                </div>
              </div>
              
              <div className="bg-card rounded-lg border border-border p-4" data-testid="card-direct-message-2">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-warning rounded-full flex items-center justify-center">
                    <span className="text-black text-sm font-semibold" data-testid="text-user-initials-2">RS</span>
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold" data-testid="text-user-name-2">Ryan Smith</h3>
                    <p className="text-sm text-muted-foreground" data-testid="text-message-preview-2">Thanks for the pass! 🥅</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground" data-testid="text-message-time-2">2d ago</p>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Empty State for new users */}
            <div className="text-center py-12 mt-8" data-testid="empty-messages">
              <MessageCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No messages yet</p>
              <p className="text-sm text-muted-foreground mt-2">Start a conversation with your teammates</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
