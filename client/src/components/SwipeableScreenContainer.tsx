import { useRef, useEffect, useState, useCallback, memo, ReactNode } from 'react';
import { useSwipeableNav, SCREEN_ORDER } from '@/context/SwipeableNavContext';
import { useAuth } from '@/hooks/useAuth';

interface SwipeableScreenContainerProps {
  screens: ReactNode[];
}

const SWIPE_THRESHOLD = 50;
const TRANSITION_DURATION = 300;

function SwipeableScreenContainerInner({ screens }: SwipeableScreenContainerProps) {
  const { activeIndex, setActiveIndex, setIsAnimating } = useSwipeableNav();
  const { user } = useAuth();
  const containerRef = useRef<HTMLDivElement>(null);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  
  const bottomPadding = user?.role === 'free_tier' ? 132 : 82;

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (isTransitioning) return;
    setTouchStart(e.touches[0].clientX);
    setTouchEnd(null);
    setIsDragging(true);
    setDragOffset(0);
  }, [isTransitioning]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchStart || !isDragging) return;
    
    const currentTouch = e.touches[0].clientX;
    const diff = currentTouch - touchStart;
    
    if (activeIndex === 0 && diff > 0) {
      setDragOffset(diff * 0.3);
      return;
    }
    if (activeIndex === SCREEN_ORDER.length - 1 && diff < 0) {
      setDragOffset(diff * 0.3);
      return;
    }
    
    setDragOffset(diff);
    setTouchEnd(currentTouch);
  }, [touchStart, isDragging, activeIndex]);

  const handleTouchEnd = useCallback(() => {
    if (!touchStart || touchEnd === null || isTransitioning) {
      setIsDragging(false);
      setDragOffset(0);
      return;
    }
    
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > SWIPE_THRESHOLD;
    const isRightSwipe = distance < -SWIPE_THRESHOLD;
    
    setIsDragging(false);
    setIsTransitioning(true);
    setDragOffset(0);
    
    if (isLeftSwipe && activeIndex < SCREEN_ORDER.length - 1) {
      setActiveIndex(activeIndex + 1);
    } else if (isRightSwipe && activeIndex > 0) {
      setActiveIndex(activeIndex - 1);
    }
    
    setTimeout(() => {
      setIsTransitioning(false);
      setIsAnimating(false);
    }, TRANSITION_DURATION);
    
    setTouchStart(null);
    setTouchEnd(null);
  }, [touchStart, touchEnd, activeIndex, setActiveIndex, setIsAnimating, isTransitioning]);

  useEffect(() => {
    if (!isDragging && !isTransitioning) return;
    
    const handleMouseUp = () => {
      if (isDragging) {
        handleTouchEnd();
      }
    };
    
    window.addEventListener('mouseup', handleMouseUp);
    return () => window.removeEventListener('mouseup', handleMouseUp);
  }, [isDragging, isTransitioning, handleTouchEnd]);

  useEffect(() => {
    setIsTransitioning(true);
    const timeout = setTimeout(() => {
      setIsTransitioning(false);
      setIsAnimating(false);
    }, TRANSITION_DURATION);
    return () => clearTimeout(timeout);
  }, [activeIndex, setIsAnimating]);

  const getTransform = () => {
    const baseOffset = -activeIndex * 100;
    if (isDragging && containerRef.current) {
      const containerWidth = containerRef.current.offsetWidth;
      const dragPercent = (dragOffset / containerWidth) * 100;
      return `translateX(calc(${baseOffset}% + ${dragPercent}%))`;
    }
    return `translateX(${baseOffset}%)`;
  };

  return (
    <div 
      ref={containerRef}
      className="fixed inset-0 overflow-hidden touch-pan-y"
      style={{ paddingBottom: `${bottomPadding}px` }}
      data-testid="swipeable-container"
    >
      <div
        className="flex h-full"
        style={{
          width: `${screens.length * 100}%`,
          transform: getTransform(),
          transition: isDragging ? 'none' : `transform ${TRANSITION_DURATION}ms ease-out`,
          willChange: 'transform',
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {screens.map((screen, index) => (
          <div
            key={SCREEN_ORDER[index]}
            className="h-full overflow-y-auto overflow-x-hidden bg-background"
            style={{ 
              width: `${100 / screens.length}%`,
              flexShrink: 0,
            }}
            data-testid={`screen-${SCREEN_ORDER[index]}`}
          >
            {screen}
          </div>
        ))}
      </div>
    </div>
  );
}

export const SwipeableScreenContainer = memo(SwipeableScreenContainerInner);
