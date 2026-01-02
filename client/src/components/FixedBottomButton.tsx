import { useAuth } from '@/hooks/useAuth';
import { useKeyboard } from '@/hooks/use-keyboard';
import { cn } from '@/lib/utils';

interface FixedBottomButtonProps {
  children: React.ReactNode;
  className?: string;
}

export function FixedBottomButton({ children, className }: FixedBottomButtonProps) {
  const { user } = useAuth();
  const { isOpen: isKeyboardOpen, height: keyboardHeight } = useKeyboard();
  
  const isFreeTier = user?.role === 'free_tier';
  const baseBottomOffset = isFreeTier ? 132 : 82;
  
  const bottomOffset = isKeyboardOpen 
    ? keyboardHeight + 10
    : baseBottomOffset;

  return (
    <div 
      className={cn(
        "fixed left-0 right-0 px-6 py-3 bg-background/95 backdrop-blur-sm border-t border-border z-40 transition-[bottom] duration-200 ease-out",
        className
      )}
      style={{ bottom: `${bottomOffset}px` }}
      data-testid="fixed-bottom-button-container"
    >
      {children}
    </div>
  );
}
