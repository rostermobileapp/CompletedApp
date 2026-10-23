import { useState, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { TeamAwardCelebration } from "@shared/teamAwards";
import { AwardMark } from "./AwardMark";

type TeamAwardEarnedAnnouncementProps = {
  award: TeamAwardCelebration;
  onDismiss: () => void | Promise<void>;
  onViewTeam: () => void | Promise<void>;
  busy?: boolean;
  error?: string | null;
  confetti?: ReactNode;
};

export function TeamAwardEarnedAnnouncement({
  award,
  onDismiss,
  onViewTeam,
  busy = false,
  error = null,
  confetti,
}: TeamAwardEarnedAnnouncementProps) {
  const [actionPending, setActionPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const isWorking = busy || actionPending;
  const visibleError = error || actionError;

  const dismiss = async () => {
    if (isWorking) return;
    setActionError(null);
    setActionPending(true);
    try {
      await onDismiss();
    } catch {
      setActionError("We couldn’t finish dismissing this award. Please try again.");
    } finally {
      setActionPending(false);
    }
  };

  const viewTeam = async () => {
    if (isWorking) return;
    setActionError(null);
    setActionPending(true);
    try {
      await onViewTeam();
    } catch {
      setActionError("We couldn’t open your team right now. Please try again.");
    } finally {
      setActionPending(false);
    }
  };

  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open && !isWorking) void dismiss();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[10001] bg-white/15 backdrop-blur-[24px]" />
        {confetti && (
          <div className="pointer-events-none fixed inset-0 z-[10004]" aria-hidden="true">
            {confetti}
          </div>
        )}
        <Dialog.Content
          onEscapeKeyDown={(event) => {
            if (isWorking) event.preventDefault();
          }}
          onPointerDownOutside={(event) => {
            if (isWorking) event.preventDefault();
          }}
          className="fixed left-1/2 top-1/2 z-[10003] flex max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col overflow-y-auto rounded-[1.5rem] border-2 border-white bg-[linear-gradient(145deg,#fff,#edf5fb)] p-5 text-center text-[#1e3345] shadow-[0_28px_56px_rgba(28,56,84,0.25)] ring-1 ring-[#a9bfd0] focus:outline-none sm:p-7"
        >
          <div className="pointer-events-none absolute inset-1 rounded-[1.2rem] border border-white/80" />
          <button
            type="button"
            onClick={() => void dismiss()}
            disabled={isWorking}
            aria-label="Dismiss team award announcement"
            className="absolute right-3 top-3 z-10 rounded-full p-2 text-[#597087] transition hover:bg-[#e8f0f6] hover:text-[#173d5b] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#164a73] disabled:cursor-wait disabled:opacity-50 sm:right-4 sm:top-4"
          >
            <X size={20} aria-hidden="true" />
          </button>

          <p className="px-9 text-[10px] font-bold uppercase tracking-[.24em] text-[#d52d3b]">
            Team award earned
          </p>

          <div className="relative mx-auto mt-5 flex h-36 w-36 shrink-0 items-center justify-center bg-transparent sm:h-44 sm:w-44">
            <AwardMark
              imageUrl={award.imageUrl}
              presetIcon={award.presetIcon}
              className="h-full w-full object-contain"
              iconClassName="h-20 w-20 text-[#164a73] sm:h-24 sm:w-24"
            />
          </div>

          <Dialog.Title className="mt-5 text-2xl font-bold tracking-tight text-[#173d5b] sm:text-3xl">
            {award.name}
          </Dialog.Title>
          <Dialog.Description className="mt-2 text-sm text-[#597087]">
            {award.description?.trim() || `${award.teamName} recognized you with a team award.`}
          </Dialog.Description>

          <p className="mt-4 text-sm font-semibold text-[#164a73]">
            {award.teamName}
          </p>
          {award.grantedByName?.trim() && (
            <p className="mt-1 text-xs text-[#597087]">
              Captain recognition from {award.grantedByName}
            </p>
          )}

          {visibleError && (
            <p role="alert" className="mt-4 rounded-lg border border-[#e7b8ba] bg-[#fff1f1] px-3 py-2 text-left text-sm text-[#9f2733]">
              {visibleError}
            </p>
          )}

          <button
            type="button"
            onClick={() => void viewTeam()}
            disabled={isWorking}
            className="mt-6 w-full rounded-lg bg-[#164a73] px-4 py-3 text-xs font-bold uppercase tracking-wider text-white transition hover:bg-[#103a5b] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#164a73] disabled:cursor-wait disabled:opacity-60"
          >
            {isWorking ? "Please wait…" : "View My Team"}
          </button>
          <button
            type="button"
            onClick={() => void dismiss()}
            disabled={isWorking}
            className="mt-2 w-full rounded-lg px-4 py-3 text-xs font-bold uppercase tracking-wider text-[#597087] transition hover:bg-[#e8f0f6] hover:text-[#173d5b] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#164a73] disabled:cursor-wait disabled:opacity-50"
          >
            Dismiss
          </button>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
