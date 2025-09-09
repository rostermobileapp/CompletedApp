import { ReactNode } from 'react';

interface ModalTransitionProps {
  isOpen: boolean;
  children: ReactNode;
  onClose?: () => void;
}

export function ModalTransition({ isOpen, children, onClose }: ModalTransitionProps) {
  return isOpen ? (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative"
      >
        {children}
      </div>
    </div>
  ) : null;
}

// No animation for screen transitions
export function SlideUpTransition({ children }: { children: ReactNode }) {
  return (
    <div className="absolute inset-0">
      {children}
    </div>
  );
}