import { useState, useEffect, useRef } from 'react';
import splashVideo from '@assets/Untitled_design_1765853495253.mp4';

interface SplashVideoProps {
  onComplete: () => void;
}

export function SplashVideo({ onComplete }: SplashVideoProps) {
  const [isVisible, setIsVisible] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      video.play().catch(() => {
        onComplete();
      });
    }
  }, [onComplete]);

  const handleVideoEnd = () => {
    setIsVisible(false);
    onComplete();
  };

  const handleVideoError = () => {
    setIsVisible(false);
    onComplete();
  };

  if (!isVisible) return null;

  return (
    <div 
      className="fixed inset-0 z-[9999] bg-black flex items-center justify-center"
      data-testid="splash-video-overlay"
    >
      <video
        ref={videoRef}
        src={splashVideo}
        className="w-full h-full object-cover"
        autoPlay
        muted
        playsInline
        onEnded={handleVideoEnd}
        onError={handleVideoError}
      />
    </div>
  );
}
