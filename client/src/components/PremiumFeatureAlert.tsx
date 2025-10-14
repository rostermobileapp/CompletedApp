import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { Sparkles } from "lucide-react";

interface PremiumFeatureAlertProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PremiumFeatureAlert({ open, onOpenChange }: PremiumFeatureAlertProps) {
  const [, navigate] = useLocation();

  const handleManageSubscription = () => {
    onOpenChange(false);
    navigate('/pricing');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="dialog-premium-feature-alert">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-2xl">
            <Sparkles className="w-6 h-6 text-primary" />
            Premium Feature
          </DialogTitle>
          <DialogDescription className="sr-only">
            This is a premium feature that requires a subscription
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex flex-col items-center gap-6 py-4">
          <div className="w-full max-w-[280px] rounded-lg overflow-hidden border border-border">
            <img
              src="https://media4.giphy.com/media/v1.Y2lkPTc5MGI3NjExMzV3ajB1OXV4d3pudW9oanhkd2ZjNHM4ejdqZnE3OG56NzE5bTBmZCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/TuCn6uVQb6VzeVfqDJ/giphy.gif"
              alt="Premium feature animation"
              className="w-full h-auto"
              data-testid="img-premium-gif"
            />
          </div>
          
          <div className="text-center space-y-2">
            <p className="text-lg font-semibold text-foreground">
              This is a Premium feature
            </p>
            <p className="text-sm text-muted-foreground">
              Upgrade your subscription to unlock this feature and more!
            </p>
          </div>

          <Button
            onClick={handleManageSubscription}
            className="w-full"
            size="lg"
            data-testid="button-manage-subscription"
          >
            Manage Subscription
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
