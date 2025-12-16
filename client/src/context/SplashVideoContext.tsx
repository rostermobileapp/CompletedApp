import { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';
import splashVideo from '@assets/Untitled_design_1765853495253.mp4';

interface SplashVideoContextType {
  preload: () => void;
  play: (onComplete: () => void) => void;
  isPlaying: boolean;
  isPreloaded: boolean;
}

const SplashVideoContext = createContext<SplashVideoContextType | null>(null);

export function SplashVideoProvider({ children }: { children: React.ReactNode }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPreloaded, setIsPreloaded] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const blobUrlRef = useRef<string | null>(null);
  const onCompleteRef = useRef<(() => void) | null>(null);

  const preload = useCallback(() => {
    if (blobUrlRef.current || isPreloaded) return;
    
    fetch(splashVideo)
      .then(response => response.blob())
      .then(blob => {
        blobUrlRef.current = URL.createObjectURL(blob);
        setIsPreloaded(true);
      })
      .catch(console.error);
  }, [isPreloaded]);

  const play = useCallback((onComplete: () => void) => {
    onCompleteRef.current = onComplete;
    setIsPlaying(true);
  }, []);

  const handleVideoEnd = useCallback(() => {
    setIsPlaying(false);
    if (onCompleteRef.current) {
      onCompleteRef.current();
      onCompleteRef.current = null;
    }
  }, []);

  const handleVideoError = useCallback(() => {
    setIsPlaying(false);
    if (onCompleteRef.current) {
      onCompleteRef.current();
      onCompleteRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (isPlaying && videoRef.current) {
      videoRef.current.currentTime = 0;
      videoRef.current.play().catch(handleVideoError);
    }
  }, [isPlaying, handleVideoError]);

  return (
    <SplashVideoContext.Provider value={{ preload, play, isPlaying, isPreloaded }}>
      {children}
      {isPlaying && (
        <div 
          className="fixed inset-0 z-[9999] bg-black flex items-center justify-center"
          data-testid="splash-video-overlay"
        >
          <video
            ref={videoRef}
            src={blobUrlRef.current || splashVideo}
            className="w-full h-full object-cover"
            autoPlay
            muted
            playsInline
            onEnded={handleVideoEnd}
            onError={handleVideoError}
          />
        </div>
      )}
    </SplashVideoContext.Provider>
  );
}

export function useSplashVideo() {
  const context = useContext(SplashVideoContext);
  if (!context) {
    throw new Error('useSplashVideo must be used within SplashVideoProvider');
  }
  return context;
}
