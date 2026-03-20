import { useEffect } from "react";
import { useLocation } from "wouter";

export function ScrollToTop() {
  const [location] = useLocation();

  useEffect(() => {
    // Disable browser's automatic scroll restoration
    window.history.scrollRestoration = 'manual';
    
    // Scroll to top immediately
    window.scrollTo(0, 0);
    
    // Also scroll after a brief delay to ensure content is rendered
    const timer = setTimeout(() => {
      window.scrollTo(0, 0);
    }, 0);
    
    return () => clearTimeout(timer);
  }, [location]);

  return null;
}
