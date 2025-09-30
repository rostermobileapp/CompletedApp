import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useMutation } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { MessageSquare, AlertCircle } from 'lucide-react';

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function FeedbackModal({ isOpen, onClose }: FeedbackModalProps) {
  const [category, setCategory] = useState<'product_improvement' | 'report_issue'>('product_improvement');
  const [message, setMessage] = useState('');
  const { toast } = useToast();

  const submitFeedbackMutation = useMutation({
    mutationFn: async (data: { category: string; message: string }) => {
      return apiRequest('POST', '/api/feedback', data);
    },
    onSuccess: () => {
      toast({
        title: "Feedback Submitted",
        description: "Thank you for your feedback! We'll review it soon.",
      });
      setMessage('');
      setCategory('product_improvement');
      onClose();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to submit feedback. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = () => {
    if (!message.trim()) {
      toast({
        title: "Message Required",
        description: "Please enter your feedback message.",
        variant: "destructive",
      });
      return;
    }

    submitFeedbackMutation.mutate({ category, message });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-xl" data-testid="dialog-feedback">
        <DialogHeader>
          <DialogTitle data-testid="text-feedback-title">Send Feedback</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Category Selection */}
          <div>
            <Label className="text-sm font-medium mb-2 block">Category</Label>
            <div className="flex gap-2">
              <button
                onClick={() => setCategory('product_improvement')}
                className={`flex-1 px-4 py-3 rounded-lg border transition-colors flex items-center justify-center gap-2 ${
                  category === 'product_improvement'
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-card border-border hover:border-primary'
                }`}
                data-testid="button-category-product-improvement"
              >
                <MessageSquare className="w-4 h-4" />
                <span className="font-medium">Product Improvement</span>
              </button>
              <button
                onClick={() => setCategory('report_issue')}
                className={`flex-1 px-4 py-3 rounded-lg border transition-colors flex items-center justify-center gap-2 ${
                  category === 'report_issue'
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-card border-border hover:border-primary'
                }`}
                data-testid="button-category-report-issue"
              >
                <AlertCircle className="w-4 h-4" />
                <span className="font-medium">Report an Issue</span>
              </button>
            </div>
          </div>

          {/* Message Input */}
          <div>
            <Label htmlFor="feedback-message" className="text-sm font-medium mb-2 block">
              Message
            </Label>
            <Textarea
              id="feedback-message"
              placeholder={
                category === 'product_improvement'
                  ? 'Tell us how we can improve Rosters...'
                  : 'Describe the issue you encountered...'
              }
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="min-h-[150px] resize-none"
              maxLength={5000}
              data-testid="textarea-feedback-message"
            />
            <p className="text-xs text-muted-foreground mt-1">
              {message.length} / 5000 characters
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 justify-end">
            <Button
              variant="outline"
              onClick={onClose}
              disabled={submitFeedbackMutation.isPending}
              data-testid="button-cancel-feedback"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={submitFeedbackMutation.isPending || !message.trim()}
              data-testid="button-submit-feedback"
            >
              {submitFeedbackMutation.isPending ? "Submitting..." : "Submit Feedback"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
