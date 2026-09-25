import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import confettiVideo from "./badge-confetti.webm";
import "./_group.css";

// This preview isolates the card from BirthdayHost. Auth, the date check,
// badge priority, and the dismissal API are intentionally not run here.
function hasTransparentVideoFrame(video: HTMLVideoElement): boolean {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context || !video.videoWidth || !video.videoHeight) return false;
    for (const [x, y] of [[0, 0], [video.videoWidth - 1, 0], [0, video.videoHeight - 1]]) {
      context.clearRect(0, 0, 1, 1);
      context.drawImage(video, x, y, 1, 1, 0, 0, 1, 1);
      if (context.getImageData(0, 0, 1, 1).data[3] < 32) return true;
    }
  } catch {
    // The card still works when the browser cannot inspect video alpha.
  }
  return false;
}

function BadgeConfettiOverlay() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [visible, setVisible] = useState(false);
  const [reducedMotion] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  useEffect(() => {
    const video = videoRef.current;
    if (reducedMotion || !video) return;
    let active = true;
    let elapsed = false;
    const timeout = window.setTimeout(() => {
      elapsed = true;
      video.pause();
      setVisible(false);
    }, 3000);
    video.play().then(() => {
      if (active && !elapsed && hasTransparentVideoFrame(video)) setVisible(true);
      else video.pause();
    }).catch(() => {
      if (active) setVisible(false);
    });
    return () => {
      active = false;
      window.clearTimeout(timeout);
      video.pause();
    };
  }, [reducedMotion]);

  if (reducedMotion) return null;
  return (
    <video
      ref={videoRef}
      src={confettiVideo}
      muted
      playsInline
      preload="auto"
      aria-hidden="true"
      onEnded={() => setVisible(false)}
      onError={() => setVisible(false)}
      className={`pointer-events-none absolute inset-0 z-10 h-full w-full object-contain object-center ${visible ? "opacity-100" : "opacity-0"}`}
    />
  );
}

export function Current() {
  const [open, setOpen] = useState(true);
  const [playCount, setPlayCount] = useState(0);

  function reopen() {
    setOpen(true);
    setPlayCount(count => count + 1);
  }

  return (
    <div className="birthday-preview relative min-h-screen overflow-hidden bg-[#eaf2f8] text-[#1e3345]">
      {/* Background only gives the real translucent overlay something to blur. */}
      <div className="mx-auto max-w-4xl p-7 opacity-60">
        <div className="mb-10 flex items-center justify-between border-b border-[#c8d7e4] pb-5">
          <span className="text-xl font-extrabold tracking-tight text-[#173d5b]">ROSTER</span>
          <div className="flex gap-5 text-xs font-medium text-[#587287]"><span>Dashboard</span><span>Teams</span><span>Schedule</span></div>
        </div>
        <div className="mb-6 h-36 rounded-2xl bg-white shadow-sm" />
        <div className="grid grid-cols-2 gap-5">
          <div className="h-44 rounded-2xl bg-white shadow-sm" />
          <div className="h-44 rounded-2xl bg-white shadow-sm" />
        </div>
      </div>

      {!open && (
        <button type="button" onClick={reopen} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-lg bg-[#164a73] px-6 py-3 font-bold text-white">
          Show birthday popup again
        </button>
      )}

      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[10001] bg-white/15 backdrop-blur-[24px]" />
          <Dialog.Content
            data-testid="birthday-card"
            className="fixed left-1/2 top-1/2 z-[10002] max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[1.5rem] border-2 border-white bg-[linear-gradient(145deg,#fff,#edf5fb)] p-6 text-center text-[#1e3345] shadow-[0_28px_56px_rgba(28,56,84,0.25)] ring-1 ring-[#a9bfd0] sm:p-8"
          >
            <div className="pointer-events-none absolute inset-1 rounded-[1.2rem] border border-white/80" />
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close birthday greeting"
              className="absolute right-3 top-3 rounded-full p-2 text-[#597087] hover:bg-[#e8f0f6] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#164a73]"
            ><X size={20} /></button>
            <Dialog.Title className="mt-5 text-3xl font-bold tracking-tight text-[#173d5b] sm:text-4xl">
              Happy Birthday!
            </Dialog.Title>
            <Dialog.Description className="mt-4 text-base text-[#597087]">
              Roster Hockey wishes you a fantastic day.
            </Dialog.Description>
            <div className="mt-8 flex items-center justify-center" aria-label="Roster Hockey">
              <img
                src="/__mockup/images/birthday-popup-roster-logo.png"
                alt="Roster Hockey"
                className="h-auto w-[12.5rem] max-w-[78%] object-contain"
              />
            </div>
          </Dialog.Content>
          {open && <div key={playCount} className="pointer-events-none fixed inset-0 z-[10003]" aria-hidden="true"><BadgeConfettiOverlay /></div>}
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}