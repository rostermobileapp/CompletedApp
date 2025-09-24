import { useEffect, useRef } from 'react';
import videoUrl from '@assets/Black Coming Soon Greeting Mobile Video_1758747454877.mp4';

export default function More() {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    // Ensure video plays when component mounts
    if (videoRef.current) {
      const playPromise = videoRef.current.play();
      
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            console.log('Video auto-play started');
          })
          .catch((error) => {
            console.log('Auto-play prevented:', error);
          });
      }
    }
  }, []);

  return (
    <div className="fixed inset-0 w-full h-full bg-black" data-testid="more-page">
      <video
        ref={videoRef}
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        className="w-full h-full object-cover"
        data-testid="chirp-video"
      >
        <source src={videoUrl} type="video/mp4" />
        <p className="text-white text-center flex items-center justify-center h-full">
          Your browser does not support the video tag.
        </p>
      </video>
    </div>
  );
}
