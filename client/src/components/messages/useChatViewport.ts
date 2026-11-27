import { useEffect, useState } from "react";
import { useKeyboard } from "@/hooks/use-keyboard";

/** Layout only: share the adult chat's measured navigation/keyboard clearance. */
export function useChatViewport() {
  const keyboard = useKeyboard();
  const [navigationHeight, setNavigationHeight] = useState(0);
  useEffect(() => {
    const navigation = document.querySelector<HTMLElement>('[data-testid="bottom-navigation"]');
    if (!navigation) { setNavigationHeight(0); return; }
    const measure = () => setNavigationHeight(navigation.getBoundingClientRect().height);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(navigation);
    return () => observer.disconnect();
  }, [keyboard.isOpen]);
  return { keyboard, bottomOffset: keyboard.isOpen ? keyboard.height : navigationHeight };
}
