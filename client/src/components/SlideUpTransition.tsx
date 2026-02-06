import { ReactNode, useEffect, useState, useRef } from 'react';

interface SlideUpTransitionProps {
  children: ReactNode;
  duration?: number;
}

export function SlideUpTransition({ children, duration = 500 }: SlideUpTransitionProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [animationDone, setAnimationDone] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setIsVisible(true);
    });
    const timer = setTimeout(() => {
      setAnimationDone(true);
    }, duration + 50);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, [duration]);

  return (
    <div
      ref={wrapperRef}
      style={{
        overflow: animationDone ? undefined : 'hidden',
        minHeight: animationDone ? undefined : '100vh',
      }}
    >
      <div
        style={{
          transform: isVisible ? 'translateY(0)' : 'translateY(100vh)',
          opacity: isVisible ? 1 : 0,
          transition: `transform ${duration}ms cubic-bezier(0.32, 0.72, 0, 1), opacity ${Math.round(duration * 0.6)}ms ease-out`,
          willChange: 'transform, opacity',
        }}
      >
        {children}
      </div>
    </div>
  );
}
