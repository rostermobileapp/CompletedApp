import { Lock } from 'lucide-react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { setPageTransitionDirection } from '@/components/PageTransition';

interface FeatureLockOverlayProps {
  isLocked: boolean;
  children: React.ReactNode;
  className?: string;
}

export function FeatureLockOverlay({ isLocked, children, className = '' }: FeatureLockOverlayProps) {
  const [, navigate] = useLocation();

  if (!isLocked) {
    return <>{children}</>;
  }

  const handleUpgrade = () => {
    setPageTransitionDirection('up');
    navigate('/subscription');
  };

  return (
    <div className={`relative ${className}`}>
      <div className="blur-sm pointer-events-none select-none">
        {children}
      </div>
      
      <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm">
        <div className="text-center space-y-4 p-8">
          <div className="w-16 h-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
            <Lock className="w-8 h-8 text-primary" />
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-semibold">Premium Feature</h3>
            <p className="text-muted-foreground max-w-sm mx-auto">
              This feature is available with a Player Pro or Commissioner subscription
            </p>
          </div>
          <Button 
            onClick={handleUpgrade}
            size="lg"
            className="mt-4"
            data-testid="button-upgrade-feature"
          >
            Upgrade to enjoy this feature
          </Button>
        </div>
      </div>
    </div>
  );
}
