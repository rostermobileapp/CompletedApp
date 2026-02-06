import { ReactNode, useEffect, useState } from 'react';

interface SlideUpTransitionProps {
  children: ReactNode;
  duration?: number;
}

export function SlideUpTransition({ children, duration = 500 }: SlideUpTransitionProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setIsVisible(true);
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div
      style={{
        transform: isVisible ? 'translateY(0)' : 'translateY(60px)',
        opacity: isVisible ? 1 : 0,
        transition: `transform ${duration}ms cubic-bezier(0.32, 0.72, 0, 1), opacity ${Math.round(duration * 0.4)}ms ease-out`,
      }}
    >
      {children}
    </div>
  );
}
