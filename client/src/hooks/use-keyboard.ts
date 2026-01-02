import { useState, useEffect, useCallback, useRef } from 'react';

interface KeyboardState {
  isOpen: boolean;
  height: number;
}

export function useKeyboard() {
  const [keyboardState, setKeyboardState] = useState<KeyboardState>({
    isOpen: false,
    height: 0,
  });
  const initialViewportHeight = useRef<number>(0);

  useEffect(() => {
    const viewport = window.visualViewport;
    
    if (viewport) {
      initialViewportHeight.current = viewport.height;
    } else {
      initialViewportHeight.current = window.innerHeight;
    }
    
    const detectKeyboard = () => {
      let isKeyboardOpen = false;
      let keyboardHeight = 0;
      
      if (viewport) {
        const currentHeight = viewport.height;
        const heightDiff = initialViewportHeight.current - currentHeight;
        
        const threshold = 150;
        
        if (heightDiff > threshold) {
          isKeyboardOpen = true;
          keyboardHeight = heightDiff;
        } else {
          const offsetTop = viewport.offsetTop;
          if (offsetTop > threshold) {
            isKeyboardOpen = true;
            keyboardHeight = window.innerHeight - currentHeight - offsetTop;
          }
        }
        
        if (currentHeight > initialViewportHeight.current) {
          initialViewportHeight.current = currentHeight;
        }
      } else {
        const activeElement = document.activeElement;
        if (activeElement && (
          activeElement.tagName === 'INPUT' || 
          activeElement.tagName === 'TEXTAREA'
        )) {
          isKeyboardOpen = true;
          keyboardHeight = 300;
        }
      }
      
      setKeyboardState(prev => {
        if (prev.isOpen !== isKeyboardOpen || prev.height !== keyboardHeight) {
          return { isOpen: isKeyboardOpen, height: keyboardHeight };
        }
        return prev;
      });
    };
    
    const handleFocusIn = () => {
      setTimeout(detectKeyboard, 300);
    };
    
    const handleFocusOut = () => {
      setTimeout(detectKeyboard, 100);
    };
    
    if (viewport) {
      viewport.addEventListener('resize', detectKeyboard);
      viewport.addEventListener('scroll', detectKeyboard);
    }
    
    document.addEventListener('focusin', handleFocusIn);
    document.addEventListener('focusout', handleFocusOut);
    
    detectKeyboard();

    return () => {
      if (viewport) {
        viewport.removeEventListener('resize', detectKeyboard);
        viewport.removeEventListener('scroll', detectKeyboard);
      }
      document.removeEventListener('focusin', handleFocusIn);
      document.removeEventListener('focusout', handleFocusOut);
    };
  }, []);

  return keyboardState;
}

export function useScrollToInput() {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const scrollToInput = useCallback((element: HTMLElement | null) => {
    if (!element) return;

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      const viewport = window.visualViewport;
      
      if (viewport) {
        const rect = element.getBoundingClientRect();
        const visibleHeight = viewport.height;
        const offsetTop = viewport.offsetTop;
        
        const padding = 80;
        const visibleAreaTop = offsetTop;
        const visibleAreaBottom = offsetTop + visibleHeight;
        
        if (rect.bottom > visibleAreaBottom - padding) {
          const scrollAmount = rect.bottom - visibleAreaBottom + padding;
          window.scrollBy({
            top: scrollAmount,
            behavior: 'smooth',
          });
        } else if (rect.top < visibleAreaTop + padding) {
          const scrollAmount = rect.top - visibleAreaTop - padding;
          window.scrollBy({
            top: scrollAmount,
            behavior: 'smooth',
          });
        }
      } else {
        element.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      }
    }, 350);
  }, []);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return scrollToInput;
}

export function useKeyboardAwareInput() {
  const scrollToInput = useScrollToInput();

  const handleFocus = useCallback((event: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || 
                     ('ontouchstart' in window) ||
                     (navigator.maxTouchPoints > 0);
    
    if (isMobile) {
      scrollToInput(event.target as HTMLElement);
    }
  }, [scrollToInput]);

  return { handleFocus };
}
