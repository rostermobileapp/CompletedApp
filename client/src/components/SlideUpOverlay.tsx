import { createContext, useContext, useState, useCallback, useEffect, ReactNode, useRef } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/hooks/useAuth';

interface SlideUpOverlayContextType {
  openOverlay: (targetRoute: string, content: ReactNode) => void;
  closeWithSlideDown: (targetRoute: string) => void;
  isOverlayRoute: boolean;
}

const SlideUpOverlayContext = createContext<SlideUpOverlayContextType | null>(null);

export function useSlideUpOverlay() {
  const ctx = useContext(SlideUpOverlayContext);
  if (!ctx) throw new Error('useSlideUpOverlay must be used within SlideUpOverlayProvider');
  return ctx;
}

const DURATION = 500;

export function SlideUpOverlayProvider({ children }: { children: ReactNode }) {
  const [location, navigate] = useLocation();
  const { user } = useAuth();

  const [overlay, setOverlay] = useState<{ content: ReactNode; targetRoute: string } | null>(null);
  const [slideIn, setSlideIn] = useState(false);
  const animatingRef = useRef(false);

  const [dismissContent, setDismissContent] = useState<ReactNode | null>(null);
  const [slideOut, setSlideOut] = useState(false);

  const overlayRouteRef = useRef<string | null>(null);

  const bottomNavHeight = (user as any)?.role === 'free_tier' ? 132 : 82;

  const openOverlay = useCallback((targetRoute: string, content: ReactNode) => {
    if (animatingRef.current) return;
    animatingRef.current = true;

    overlayRouteRef.current = targetRoute;
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

  const closeWithSlideDown = useCallback((targetRoute: string) => {
    if (animatingRef.current) return;
    animatingRef.current = true;

    const mainEl = document.querySelector('[data-page-content]');
    let capturedContent: ReactNode = null;
    if (mainEl) {
      const html = mainEl.innerHTML;
      capturedContent = <div dangerouslySetInnerHTML={{ __html: html }} style={{ pointerEvents: 'none' }} />;
    }

    navigate(targetRoute);
    overlayRouteRef.current = null;

    setDismissContent(capturedContent);
    setSlideOut(false);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setSlideOut(true);

        setTimeout(() => {
          setDismissContent(null);
          setSlideOut(false);
          animatingRef.current = false;
        }, DURATION);
      });
    });
  }, [navigate]);

  const isOverlayRoute = overlayRouteRef.current !== null && location === overlayRouteRef.current;

  return (
    <SlideUpOverlayContext.Provider value={{ openOverlay, closeWithSlideDown, isOverlayRoute }}>
      {children}

      {overlay && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: `${bottomNavHeight}px`,
            zIndex: 99,
            transform: slideIn ? 'translateY(0)' : `translateY(calc(100% + ${bottomNavHeight}px))`,
            transition: `transform ${DURATION}ms cubic-bezier(0.32, 0.72, 0, 1)`,
            willChange: 'transform',
            overflowY: slideIn ? 'auto' : 'hidden',
            WebkitOverflowScrolling: 'touch' as any,
            backgroundColor: 'var(--background, #fff)',
            borderTopLeftRadius: '12px',
            borderTopRightRadius: '12px',
          }}
        >
          {overlay.content}
        </div>
      )}

      {dismissContent !== null && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: `${bottomNavHeight}px`,
            zIndex: 99,
            transform: slideOut ? `translateY(calc(100% + ${bottomNavHeight}px))` : 'translateY(0)',
            transition: `transform ${DURATION}ms cubic-bezier(0.32, 0.72, 0, 1)`,
            willChange: 'transform',
            overflow: 'hidden',
            backgroundColor: 'var(--background, #fff)',
            borderTopLeftRadius: '12px',
            borderTopRightRadius: '12px',
          }}
        >
          {dismissContent}
        </div>
      )}
    </SlideUpOverlayContext.Provider>
  );
}
