import { useState, useEffect, useRef } from 'react';

export default function AnimatedCounter({ value, suffix = '' }: { value: number; suffix?: string }) {
  const [displayValue, setDisplayValue] = useState(0);
  const prevValue = useRef(0);
  const hasStarted = useRef(false);
  const elementRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (value === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !hasStarted.current) {
          hasStarted.current = true;
          const start = prevValue.current;
          const end = value;
          const duration = 1800;
          const startTime = performance.now();

          const animate = (currentTime: number) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            const current = Math.round(start + (end - start) * eased);
            setDisplayValue(current);
            if (progress < 1) {
              requestAnimationFrame(animate);
            } else {
              prevValue.current = end;
            }
          };
          requestAnimationFrame(animate);
        }
      },
      { threshold: 0.3 }
    );

    if (elementRef.current) observer.observe(elementRef.current);
    return () => observer.disconnect();
  }, [value]);

  return (
    <span ref={elementRef} className="tabular-nums font-extrabold">
      {displayValue.toLocaleString()}{suffix}
    </span>
  );
}
