import { createContext, useContext, useState, useCallback, useEffect, ReactNode, useRef } from 'react';
import { useLocation } from 'wouter';

interface SlideUpOverlayContextType {
  openOverlay: (targetRoute: string, content: ReactNode) => void;
}

const SlideUpOverlayContext = createContext<SlideUpOverlayContextType | null>(null);

export function useSlideUpOverlay() {
  const ctx = useContext(SlideUpOverlayContext);
  if (!ctx) throw new Error('useSlideUpOverlay must be used within SlideUpOverlayProvider');
  return ctx;
}

const DURATION = 500;

export function SlideUpOverlayProvider({ children }: { children: ReactNode }) {
  const [, navigate] = useLocation();
  const [overlay, setOverlay] = useState<{ content: ReactNode; targetRoute: string } | null>(null);
  const [slideIn, setSlideIn] = useState(false);
  const animatingRef = useRef(false);

  const openOverlay = useCallback((targetRoute: string, content: ReactNode) => {
    if (animatingRef.current) return;
    animatingRef.current = true;

    setOverlay({ content, targetRoute });
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setSlideIn(true);
      });
    });
  }, []);

  useEffect(() => {
    if (!slideIn || !overlay) return;
    const timer = setTimeout(() => {
      navigate(overlay.targetRoute);

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setOverlay(null);
          setSlideIn(false);
          animatingRef.current = false;
        });
      });
    }, DURATION);
    return () => clearTimeout(timer);
  }, [slideIn, overlay, navigate]);

  return (
    <SlideUpOverlayContext.Provider value={{ openOverlay }}>
      {children}
      {overlay && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 9999,
            transform: slideIn ? 'translateY(0)' : 'translateY(100%)',
            transition: `transform ${DURATION}ms cubic-bezier(0.32, 0.72, 0, 1)`,
            willChange: 'transform',
            overflowY: slideIn ? 'auto' : 'hidden',
            WebkitOverflowScrolling: 'touch' as any,
            backgroundColor: 'var(--background, #fff)',
          }}
        >
          {overlay.content}
        </div>
      )}
    </SlideUpOverlayContext.Provider>
  );
}
