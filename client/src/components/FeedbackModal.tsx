import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, getAuthHeaders } from '@/lib/queryClient';
import { useAuth } from '@/hooks/useAuth';
import { AlertCircle, ThumbsUp, Plus, ArrowLeft, Loader2, Send, MessageSquare } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface Reply {
  id: string;
  body: string;
  createdAt: string;
}

interface FeatureRequestItem {
  id: string;
  title: string;
  description?: string;
  createdAt: string;
  submitterName: string;
  voteCount: number;
  userVoted: boolean;
}

type View = 'board' | 'report-bug' | 'new-request';

const FOUNDER_EMAIL = 'founder@rosterhockey.com';

// Per-card reply section — fetches lazily when expanded
function ReplySection({
  requestId,
  isFounder,
}: {
  requestId: string;
  isFounder: boolean;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [replyText, setReplyText] = useState('');
  const [expanded, setExpanded] = useState(false);

  const { data: replies = [], isLoading } = useQuery<Reply[]>({
    queryKey: ['/api/feature-requests', requestId, 'replies'],
    queryFn: async () => {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/feature-requests/${requestId}/replies`, { headers });
      if (!res.ok) throw new Error('Failed to load replies');
      return res.json();
    },
    enabled: expanded || isFounder,
    staleTime: 60_000,
  });

  const postReply = useMutation({
    mutationFn: async (body: string) => {
      const res = await apiRequest('POST', `/api/feature-requests/${requestId}/replies`, { body });
      return res.json() as Promise<Reply>;
    },
    onSuccess: (newReply) => {
      queryClient.setQueryData<Reply[]>(
        ['/api/feature-requests', requestId, 'replies'],
        (old = []) => [...old, newReply],
      );
      setReplyText('');
      setExpanded(true);
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to post reply.', variant: 'destructive' });
    },
  });

  const hasReplies = replies.length > 0;

  // Founder always sees the reply composer; other users only see the toggle when there are replies
  const showToggle = !isFounder && hasReplies;
  const showComposer = isFounder;
  const showReplies = isFounder || expanded;

  if (!showToggle && !showComposer) return null;

  return (
    <div className="mt-2 border-t border-border pt-2 space-y-2">
      {/* Toggle for non-founders */}
      {showToggle && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-1 text-[11px] text-primary hover:underline"
        >
          <MessageSquare className="w-3 h-3" />
          {expanded ? 'Hide' : `${replies.length} reply from Rosters`}
        </button>
      )}

      {/* Replies list */}
      {showReplies && (
        <div className="space-y-1.5">
          {isLoading && (
            <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <Loader2 className="w-3 h-3 animate-spin" /> Loading…
            </div>
          )}
          {replies.map((r) => (
            <div
              key={r.id}
              className="bg-primary/8 border border-primary/20 rounded-md px-3 py-2"
            >
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="text-[10px] font-bold text-primary uppercase tracking-wide">Rosters</span>
                <span className="text-[10px] text-muted-foreground">
                  · {formatDistanceToNow(new Date(r.createdAt), { addSuffix: true })}
                </span>
              </div>
              <p className="text-xs text-foreground leading-relaxed">{r.body}</p>
            </div>
          ))}
        </div>
      )}

      {/* Founder composer */}
      {showComposer && (
        <div className="flex gap-2 items-end">
          <Textarea
            placeholder="Reply as Rosters…"
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            className="min-h-[60px] resize-none text-sm flex-1"
            maxLength={2000}
          />
          <Button
            size="sm"
            onClick={() => {
              if (replyText.trim()) postReply.mutate(replyText.trim());
            }}
            disabled={postReply.isPending || !replyText.trim()}
            className="flex-shrink-0 h-9 px-3"
            aria-label="Send reply"
          >
            {postReply.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>
      )}
    </div>
  );
}

export default function FeedbackModal({ isOpen, onClose }: FeedbackModalProps) {
  const [view, setView] = useState<View>('board');
  const [bugMessage, setBugMessage] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isFounder = (user as any)?.email === FOUNDER_EMAIL;

  const { data: requests = [], isLoading } = useQuery<FeatureRequestItem[]>({
    queryKey: ['/api/feature-requests'],
    enabled: isOpen,
    staleTime: 30_000,
  });

  const bugMutation = useMutation({
    mutationFn: async (message: string) => {
      return apiRequest('POST', '/api/feedback', { category: 'report_issue', message });
    },
    onSuccess: () => {
      toast({ title: 'Bug Report Sent', description: "Thanks for the report! We'll look into it." });
      setBugMessage('');
      setView('board');
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to send bug report. Please try again.', variant: 'destructive' });
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: { title: string; description?: string }): Promise<FeatureRequestItem> => {
      const res = await apiRequest('POST', '/api/feature-requests', data);
      return res.json() as Promise<FeatureRequestItem>;
    },
    onSuccess: (newItem: FeatureRequestItem) => {
      queryClient.setQueryData<FeatureRequestItem[]>(['/api/feature-requests'], (old = []) => [
        ...old,
        newItem,
      ]);
      queryClient.invalidateQueries({ queryKey: ['/api/feature-requests'] });
      toast({ title: 'Request Submitted', description: 'Your feature request has been added!' });
      setNewTitle('');
      setNewDescription('');
      setView('board');
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to submit request. Please try again.', variant: 'destructive' });
    },
  });

  const voteMutation = useMutation({
    mutationFn: async (requestId: string) => {
      const res = await apiRequest('POST', `/api/feature-requests/${requestId}/vote`);
      return res.json() as Promise<{ voted: boolean; voteCount: number }>;
    },
    onMutate: async (requestId) => {
      await queryClient.cancelQueries({ queryKey: ['/api/feature-requests'] });
      const prev = queryClient.getQueryData<FeatureRequestItem[]>(['/api/feature-requests']);
      queryClient.setQueryData<FeatureRequestItem[]>(['/api/feature-requests'], (old = []) =>
        old.map((r) =>
          r.id === requestId
            ? { ...r, userVoted: !r.userVoted, voteCount: r.userVoted ? r.voteCount - 1 : r.voteCount + 1 }
            : r,
        ),
      );
      return { prev };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['/api/feature-requests'], ctx.prev);
      toast({ title: 'Error', description: 'Could not update vote.', variant: 'destructive' });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/feature-requests'] });
    },
  });

  const handleClose = () => {
    setView('board');
    setBugMessage('');
    setNewTitle('');
    setNewDescription('');
    onClose();
  };

  const handleBugSubmit = () => {
    if (!bugMessage.trim()) {
      toast({ title: 'Message Required', description: 'Please describe the issue.', variant: 'destructive' });
      return;
    }
    bugMutation.mutate(bugMessage.trim());
  };

  const handleNewRequest = () => {
    if (!newTitle.trim()) {
      toast({ title: 'Title Required', description: 'Please enter a title for your request.', variant: 'destructive' });
      return;
    }
    createMutation.mutate({ title: newTitle.trim(), description: newDescription.trim() || undefined });
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent
        className="w-screen h-screen max-w-none max-h-none rounded-none flex flex-col p-0 gap-0 sm:w-screen sm:h-screen sm:max-w-none sm:rounded-none"
        data-testid="dialog-feedback"
      >
        {/* Header */}
        <DialogHeader className="px-5 pt-5 pb-3 border-b flex-shrink-0">
          <div className="flex items-center gap-2">
            {view !== 'board' && (
              <button
                onClick={() => setView('board')}
                className="p-1 rounded hover:bg-muted transition-colors"
                aria-label="Back"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <DialogTitle className="text-base font-semibold">
              {view === 'board' && 'Feature Requests'}
              {view === 'report-bug' && 'Report a Bug'}
              {view === 'new-request' && 'New Feature Request'}
            </DialogTitle>
          </div>
        </DialogHeader>

        {/* Board view */}
        {view === 'board' && (
          <>
            <div className="px-5 py-3 flex gap-2 flex-shrink-0 border-b">
              <Button
                variant="outline"
                size="sm"
                className="flex items-center gap-1.5 text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300"
                onClick={() => setView('report-bug')}
                data-testid="button-report-bug"
              >
                <AlertCircle className="w-4 h-4" />
                Report a Bug
              </Button>
              <Button
                size="sm"
                className="flex items-center gap-1.5 ml-auto"
                onClick={() => setView('new-request')}
                data-testid="button-new-request"
              >
                <Plus className="w-4 h-4" />
                New Request
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2 min-h-0">
              {isLoading && (
                <div className="flex items-center justify-center py-12 text-muted-foreground">
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  Loading...
                </div>
              )}
              {!isLoading && requests.length === 0 && (
                <div className="text-center py-12 text-muted-foreground">
                  <p className="font-medium">No feature requests yet</p>
                  <p className="text-sm mt-1">Be the first to suggest one!</p>
                </div>
              )}
              {requests.map((req) => (
                <div
                  key={req.id}
                  className="bg-card border border-border rounded-lg p-3"
                  data-testid={`feature-request-${req.id}`}
                >
                  <div className="flex gap-3 items-start">
                    {/* Vote button */}
                    <button
                      onClick={() => voteMutation.mutate(req.id)}
                      disabled={voteMutation.isPending}
                      className={`flex flex-col items-center gap-0.5 flex-shrink-0 px-2 py-1.5 rounded-md border transition-colors min-w-[48px] ${
                        req.userVoted
                          ? 'bg-primary/10 border-primary text-primary'
                          : 'border-border hover:border-primary/50 text-muted-foreground hover:text-primary'
                      }`}
                      aria-label={req.userVoted ? 'Remove vote' : 'Upvote'}
                      data-testid={`vote-button-${req.id}`}
                    >
                      <ThumbsUp className={`w-4 h-4 ${req.userVoted ? 'fill-primary' : ''}`} />
                      <span className="text-xs font-bold leading-none">{req.voteCount}</span>
                    </button>

                    {/* Content */}
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm leading-tight">{req.title}</p>
                      {req.description && (
                        <p className="text-xs text-muted-foreground mt-0.5">{req.description}</p>
                      )}
                      <p className="text-[11px] text-muted-foreground mt-1">
                        {req.submitterName} · {formatDistanceToNow(new Date(req.createdAt), { addSuffix: true })}
                      </p>
                    </div>
                  </div>

                  {/* Reply section */}
                  <ReplySection requestId={req.id} isFounder={isFounder} />
                </div>
              ))}
            </div>
          </>
        )}

        {/* Report Bug view */}
        {view === 'report-bug' && (
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 min-h-0">
            <p className="text-sm text-muted-foreground">
              Describe the bug you encountered. Include what you were doing and what happened.
            </p>
            <div>
              <Label htmlFor="bug-message" className="text-sm font-medium mb-1.5 block">Description</Label>
              <Textarea
                id="bug-message"
                placeholder="Describe the issue..."
                value={bugMessage}
                onChange={(e) => setBugMessage(e.target.value)}
                className="min-h-[140px] resize-none"
                maxLength={5000}
                data-testid="textarea-bug-message"
              />
              <p className="text-xs text-muted-foreground mt-1">{bugMessage.length} / 5000</p>
            </div>
            <div className="flex gap-3 justify-end pt-1">
              <Button variant="outline" onClick={() => setView('board')} disabled={bugMutation.isPending}>
                Cancel
              </Button>
              <Button
                onClick={handleBugSubmit}
                disabled={bugMutation.isPending || !bugMessage.trim()}
                data-testid="button-submit-bug"
              >
                {bugMutation.isPending ? 'Sending...' : 'Send Report'}
              </Button>
            </div>
          </div>
        )}

        {/* New Request view */}
        {view === 'new-request' && (
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 min-h-0">
            <p className="text-sm text-muted-foreground">
              Suggest a feature you'd like to see. Others can upvote it to show support.
            </p>
            <div>
              <Label htmlFor="req-title" className="text-sm font-medium mb-1.5 block">
                Title <span className="text-red-500">*</span>
              </Label>
              <Input
                id="req-title"
                placeholder="Short, clear title..."
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                maxLength={200}
                data-testid="input-request-title"
              />
              <p className="text-xs text-muted-foreground mt-1">{newTitle.length} / 200</p>
            </div>
            <div>
              <Label htmlFor="req-desc" className="text-sm font-medium mb-1.5 block">
                Description <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Textarea
                id="req-desc"
                placeholder="Add more detail if helpful..."
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                className="min-h-[100px] resize-none"
                maxLength={2000}
                data-testid="textarea-request-description"
              />
              <p className="text-xs text-muted-foreground mt-1">{newDescription.length} / 2000</p>
            </div>
            <div className="flex gap-3 justify-end pt-1">
              <Button variant="outline" onClick={() => setView('board')} disabled={createMutation.isPending}>
                Cancel
              </Button>
              <Button
                onClick={handleNewRequest}
                disabled={createMutation.isPending || !newTitle.trim()}
                data-testid="button-submit-request"
              >
                {createMutation.isPending ? 'Submitting...' : 'Submit Request'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
