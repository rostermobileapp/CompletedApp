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
import { AlertCircle, Plus, ArrowLeft, Loader2, ArrowUp, ArrowDown, MessageSquare, Send } from 'lucide-react';
import { format } from 'date-fns';

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

function ReplySection({ requestId, isFounder }: { requestId: string; isFounder: boolean }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [replyText, setReplyText] = useState('');
  const [showComposer, setShowComposer] = useState(false);
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
      setShowComposer(false);
      setExpanded(true);
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to post reply.', variant: 'destructive' });
    },
  });

  const hasReplies = replies.length > 0;
  const showReplies = isFounder || expanded;

  return (
    <div className="mt-1.5 flex flex-col gap-2">
      {/* Action row */}
      <div className="flex items-center gap-3">
        {/* Founder reply button */}
        {isFounder && (
          <button
            onClick={() => setShowComposer((v) => !v)}
            className="flex items-center gap-1 text-xs font-bold text-[#878a8c] hover:text-[#0079d3] transition-colors"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            Reply
          </button>
        )}
        {/* Non-founder: toggle existing replies */}
        {!isFounder && hasReplies && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-1 text-xs font-bold text-[#0079d3] hover:underline transition-colors"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            {expanded ? 'Hide' : `${replies.length} reply from Rosters`}
          </button>
        )}
      </div>

      {/* Founder composer */}
      {isFounder && showComposer && (
        <div className="ml-4 border-l-2 border-[#0079d3] pl-3 flex flex-col gap-2">
          <Textarea
            placeholder="Reply as Rosters…"
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            className="min-h-[72px] resize-none text-sm bg-[#f6f7f8] border-[#edeff1] focus:bg-white"
            maxLength={2000}
          />
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => { setShowComposer(false); setReplyText(''); }}
              className="text-xs font-bold text-[#878a8c] hover:text-[#1c1c1c] px-3 py-1.5 rounded-full hover:bg-[#edeff1] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => { if (replyText.trim()) postReply.mutate(replyText.trim()); }}
              disabled={postReply.isPending || !replyText.trim()}
              className="text-xs font-bold text-white bg-[#0079d3] hover:bg-[#006cbf] disabled:opacity-40 px-3 py-1.5 rounded-full transition-colors flex items-center gap-1"
            >
              {postReply.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
              Reply
            </button>
          </div>
        </div>
      )}

      {/* Replies list */}
      {showReplies && (
        <div className="ml-4 border-l-2 border-[#edeff1] pl-3 flex flex-col gap-3">
          {isLoading && (
            <div className="flex items-center gap-1 text-xs text-[#878a8c]">
              <Loader2 className="w-3 h-3 animate-spin" /> Loading…
            </div>
          )}
          {replies.map((r) => (
            <div key={r.id} className="flex flex-col gap-0.5">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-[#0079d3]">Rosters</span>
                <span className="text-[11px] text-[#878a8c]">· {formatDistanceToNow(new Date(r.createdAt), { addSuffix: true })}</span>
              </div>
              <p className="text-sm text-[#1c1c1c] leading-relaxed">{r.body}</p>
            </div>
          ))}
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
      queryClient.setQueryData<FeatureRequestItem[]>(['/api/feature-requests'], (old = []) => [...old, newItem]);
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

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent
        className="w-screen h-screen max-w-none max-h-none rounded-none flex flex-col p-0 gap-0 bg-[#dae0e6] sm:w-screen sm:h-screen sm:max-w-none sm:rounded-none"
        data-testid="dialog-feedback"
      >
        {/* Reddit-style header bar */}
        <div className="bg-white border-b border-[#edeff1] px-4 py-2 flex items-center gap-3 flex-shrink-0">
          {view !== 'board' && (
            <button onClick={() => setView('board')} className="p-1 rounded hover:bg-[#f6f7f8] transition-colors" aria-label="Back">
              <ArrowLeft className="w-4 h-4 text-[#878a8c]" />
            </button>
          )}
          {view !== 'board' && (
            <DialogTitle className="text-sm font-bold text-[#1c1c1c]">
              {view === 'report-bug' && 'Report a Bug'}
              {view === 'new-request' && 'Create Post'}
            </DialogTitle>
          )}
          {view === 'board' && <DialogTitle className="sr-only">Feature Requests</DialogTitle>}
          {view === 'board' && (
            <>
              <button
                onClick={() => setView('new-request')}
                className="flex items-center gap-1.5 text-xs font-bold text-white bg-[#0079d3] hover:bg-[#006cbf] px-3 py-1.5 rounded-full transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Create Post
              </button>
              <button
                onClick={() => setView('report-bug')}
                className="flex items-center gap-1.5 text-xs font-bold text-[#878a8c] hover:text-[#1c1c1c] px-3 py-1.5 rounded-full border border-[#edeff1] hover:border-[#878a8c] bg-white transition-colors"
              >
                <AlertCircle className="w-3.5 h-3.5" />
                Bug
              </button>
            </>
          )}
        </div>

        {/* Board view */}
        {view === 'board' && (
          <div className="flex-1 overflow-y-auto min-h-0">
            {isLoading && (
              <div className="flex items-center justify-center py-16 text-[#878a8c]">
                <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…
              </div>
            )}
            {!isLoading && requests.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-[#878a8c]">
                <p className="font-bold text-base text-[#1c1c1c]">No posts yet</p>
                <p className="text-sm mt-1">Be the first to suggest a feature!</p>
              </div>
            )}

            {/* Posts — Reddit list style */}
            <div className="max-w-2xl mx-auto py-3 px-2 flex flex-col gap-2">
              {requests.map((req) => (
                <div
                  key={req.id}
                  className="bg-white rounded border border-[#ccc] hover:border-[#898989] transition-colors"
                  data-testid={`feature-request-${req.id}`}
                >
                  <div className="flex">
                    {/* Vote column */}
                    <div className="w-10 bg-[#f8f9fa] rounded-l flex flex-col items-center pt-2 gap-0.5 border-r border-[#edeff1]">
                      <button
                        onClick={() => voteMutation.mutate(req.id)}
                        disabled={voteMutation.isPending}
                        className={`p-0.5 rounded transition-colors hover:bg-[#edeff1] ${req.userVoted ? 'text-[#ff4500]' : 'text-[#878a8c] hover:text-[#ff4500]'}`}
                        aria-label="Upvote"
                        data-testid={`vote-button-${req.id}`}
                      >
                        <ArrowUp className="w-5 h-5" />
                      </button>
                      <span className={`text-xs font-bold leading-none ${req.userVoted ? 'text-[#ff4500]' : 'text-[#1c1c1c]'}`}>
                        {req.voteCount}
                      </span>
                      <button
                        className="p-0.5 rounded text-[#878a8c] hover:text-[#7193ff] hover:bg-[#edeff1] transition-colors"
                        aria-label="Downvote"
                        disabled
                      >
                        <ArrowDown className="w-5 h-5 opacity-40" />
                      </button>
                    </div>

                    {/* Content */}
                    <div className="flex-1 p-2 min-w-0">
                      <p className="text-xs text-[#878a8c] mb-1">
                        {(() => {
                          const parts = (req.submitterName || '').split(' ');
                          const first = parts[0] || '';
                          const lastInitial = parts[1] ? parts[1][0] : '';
                          return `${first}${lastInitial ? `, ${lastInitial}` : ''}`;
                        })()} · {format(new Date(req.createdAt), 'MMM d, yyyy')}
                      </p>
                      <h3 className="text-base font-semibold text-[#1c1c1c] leading-snug">{req.title}</h3>
                      {req.description && (
                        <p className="text-sm text-[#474747] mt-1 leading-relaxed">{req.description}</p>
                      )}

                      {/* Reply section */}
                      <ReplySection requestId={req.id} isFounder={isFounder} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Report Bug view */}
        {view === 'report-bug' && (
          <div className="flex-1 overflow-y-auto min-h-0 px-4 py-4">
            <div className="max-w-2xl mx-auto bg-white rounded border border-[#ccc] p-4 space-y-4">
              <p className="text-sm text-[#878a8c]">
                Describe the bug you encountered. Include what you were doing and what happened.
              </p>
              <div>
                <Label htmlFor="bug-message" className="text-sm font-bold text-[#1c1c1c] mb-1.5 block">Description</Label>
                <Textarea
                  id="bug-message"
                  placeholder="Describe the issue..."
                  value={bugMessage}
                  onChange={(e) => setBugMessage(e.target.value)}
                  className="min-h-[140px] resize-none bg-[#f6f7f8] border-[#edeff1] focus:bg-white"
                  maxLength={5000}
                  data-testid="textarea-bug-message"
                />
                <p className="text-xs text-[#878a8c] mt-1">{bugMessage.length} / 5000</p>
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setView('board')}
                  disabled={bugMutation.isPending}
                  className="text-sm font-bold text-[#878a8c] hover:text-[#1c1c1c] px-4 py-2 rounded-full hover:bg-[#edeff1] transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (!bugMessage.trim()) {
                      toast({ title: 'Message Required', description: 'Please describe the issue.', variant: 'destructive' });
                      return;
                    }
                    bugMutation.mutate(bugMessage.trim());
                  }}
                  disabled={bugMutation.isPending || !bugMessage.trim()}
                  className="text-sm font-bold text-white bg-[#ff4500] hover:bg-[#e03d00] disabled:opacity-40 px-4 py-2 rounded-full transition-colors"
                  data-testid="button-submit-bug"
                >
                  {bugMutation.isPending ? 'Sending…' : 'Send Report'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* New Request view */}
        {view === 'new-request' && (
          <div className="flex-1 overflow-y-auto min-h-0 px-4 py-4">
            <div className="max-w-2xl mx-auto bg-white rounded border border-[#ccc] p-4 space-y-4">
              <p className="text-sm text-[#878a8c]">
                Suggest a feature you'd like to see. Others can upvote it to show support.
              </p>
              <div>
                <Label htmlFor="req-title" className="text-sm font-bold text-[#1c1c1c] mb-1.5 block">
                  Title <span className="text-[#ff4500]">*</span>
                </Label>
                <Input
                  id="req-title"
                  placeholder="An interesting title"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  maxLength={200}
                  className="bg-[#f6f7f8] border-[#edeff1] focus:bg-white"
                  data-testid="input-request-title"
                />
                <p className="text-xs text-[#878a8c] mt-1">{newTitle.length} / 200</p>
              </div>
              <div>
                <Label htmlFor="req-desc" className="text-sm font-bold text-[#1c1c1c] mb-1.5 block">
                  Description <span className="text-[#878a8c] font-normal">(optional)</span>
                </Label>
                <Textarea
                  id="req-desc"
                  placeholder="Text (optional)"
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  className="min-h-[100px] resize-none bg-[#f6f7f8] border-[#edeff1] focus:bg-white"
                  maxLength={2000}
                  data-testid="textarea-request-description"
                />
                <p className="text-xs text-[#878a8c] mt-1">{newDescription.length} / 2000</p>
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setView('board')}
                  disabled={createMutation.isPending}
                  className="text-sm font-bold text-[#878a8c] hover:text-[#1c1c1c] px-4 py-2 rounded-full hover:bg-[#edeff1] transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (!newTitle.trim()) {
                      toast({ title: 'Title Required', description: 'Please enter a title for your request.', variant: 'destructive' });
                      return;
                    }
                    createMutation.mutate({ title: newTitle.trim(), description: newDescription.trim() || undefined });
                  }}
                  disabled={createMutation.isPending || !newTitle.trim()}
                  className="text-sm font-bold text-white bg-[#0079d3] hover:bg-[#006cbf] disabled:opacity-40 px-4 py-2 rounded-full transition-colors"
                  data-testid="button-submit-request"
                >
                  {createMutation.isPending ? 'Posting…' : 'Post'}
                </button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
