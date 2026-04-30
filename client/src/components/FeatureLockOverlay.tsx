import { Lock } from 'lucide-react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { setPageTransitionDirection } from '@/components/PageTransition';

interface FeatureLockOverlayProps {
  isLocked: boolean;
  children: React.ReactNode;
  className?: string;
  title?: string;
  ctaLabel?: string;
}

export function FeatureLockOverlay({
  isLocked,
  children,
  className = '',
  title = 'Premium Feature',
  ctaLabel = 'Upgrade',
}: FeatureLockOverlayProps) {
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
        <div className="text-center space-y-2 p-4">
          <div className="w-10 h-10 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
            <Lock className="w-5 h-5 text-primary" />
          </div>
          <h3 className="text-lg font-semibold">{title}</h3>
          <Button 
            onClick={handleUpgrade}
            size="sm"
            data-testid="button-upgrade-feature"
          >
            {ctaLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
