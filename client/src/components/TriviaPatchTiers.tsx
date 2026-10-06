import { useEffect, useRef, useState } from "react";
import { Content as DialogContent } from "@radix-ui/react-dialog";
import { CircleHelp, X } from "lucide-react";
import { getImageUrl } from "@/lib/queryClient";
import { TrophySectionHeading } from "@/components/TrophySectionHeading";
import { TRIVIA_TIER_NAMES } from "@shared/trivia";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog";

export type TriviaPatchTier = {
  tier: number | string;
  threshold: number;
  unlocked_at?: string | null;
  imagePath?: string | null;
};

function formatTierDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function TriviaPatchTiers({
  categoryName,
  description,
  currentTier,
  correctCount,
  tiers,
  autoExpandToken,
}: {
  categoryName: string;
  description: string;
  currentTier: number;
  correctCount: number;
  tiers: TriviaPatchTier[];
  autoExpandToken?: string | null;
}) {
  const [viewingTier, setViewingTier] = useState<TriviaPatchTier | null>(null);
  const viewerTrigger = useRef<HTMLButtonElement | null>(null);
  const [expanded, setExpanded] = useState(false);
  const sectionRef = useRef<HTMLElement | null>(null);
  const contentId = `trivia-category-${categoryName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

  useEffect(() => {
    setViewingTier(null);
  }, [categoryName]);

  useEffect(() => {
    if (!autoExpandToken) return;
    setExpanded(true);
    window.requestAnimationFrame(() => {
      sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [autoExpandToken]);

  const sortedTiers = tiers.slice().sort((a, b) => Number(a.tier) - Number(b.tier));
  const viewingImage = viewingTier?.imagePath ? getImageUrl(viewingTier.imagePath) : null;

  return (
    <>
      <section
        ref={sectionRef}
        className={`trophy-depth-section rounded-2xl px-3.5 sm:px-5 ${expanded ? "pt-2 pb-3.5 sm:pt-3 sm:pb-5" : "py-1 sm:py-1.5"}`}
      >
        <TrophySectionHeading
          label={categoryName}
          description={description}
          count={tiers.length}
          expanded={expanded}
          onToggle={() => setExpanded((open) => !open)}
          contentId={contentId}
        />
        <div id={contentId} hidden={!expanded}>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4">
            {sortedTiers.map((tier) => {
              const unlocked = Number(tier.tier) <= currentTier || !!tier.unlocked_at;
              const image = unlocked && tier.imagePath ? getImageUrl(tier.imagePath) : null;
              const tierNumber = Number(tier.tier);
              const tierName = TRIVIA_TIER_NAMES[tierNumber - 1]?.replaceAll("_", " ") ?? "Patch";
              const progress = Math.min(Math.max(correctCount, 0), tier.threshold);
              const earnedDate = unlocked ? formatTierDate(tier.unlocked_at) : null;
              const spotContent = (
                <div className="trophy-slot-well">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center sm:h-[4.5rem] sm:w-[4.5rem]">
                    {image ? (
                      <img
                        src={image}
                        alt={`${categoryName} Tier ${tier.tier} patch`}
                        className="h-full w-full object-contain transition-transform duration-200 group-hover:scale-[1.04]"
                      />
                    ) : unlocked ? (
                      <span className="text-center text-[9px] font-semibold uppercase leading-tight tracking-wide text-[#718394]">
                        Artwork unavailable
                      </span>
                    ) : (
                      <span className="trophy-depth-medallion flex h-12 w-12 items-center justify-center rounded-full border-2 border-[#aebfce] bg-[#e8eef3]">
                        <CircleHelp size={18} className="text-[#728699]" aria-hidden="true" />
                      </span>
                    )}
                  </div>
                  <div className={`mt-2 max-w-full truncate text-[10px] font-bold uppercase tracking-[.1em] ${unlocked ? "text-[#164a73]" : "text-[#597087]"}`}>
                    Tier {tier.tier}
                  </div>
                  <div className="mt-1 max-w-full truncate text-[10px] uppercase tracking-wider text-[#566e82]">{tierName}</div>
                  <div className={`mt-1 text-[9px] font-semibold uppercase tracking-[.12em] ${unlocked ? "text-[#d52d3b]" : "text-[#50687b]"}`}>
                    {unlocked ? "Earned" : "In progress"}
                  </div>
                  {earnedDate && <div className="mt-1 text-[9px] text-[#597087]">Earned {earnedDate}</div>}
                  <div className="mt-3 w-full">
                    <div className="trophy-depth-track h-1.5 overflow-hidden rounded-full bg-[#d8e3eb]">
                      <div
                        className="h-full rounded-full bg-[#d52d3b] transition-all duration-700"
                        style={{ width: `${Math.min(1, progress / Math.max(1, tier.threshold)) * 100}%` }}
                      />
                    </div>
                    <div className="mt-1 text-center font-mono text-[10px] text-[#597087]">{progress} / {tier.threshold}</div>
                  </div>
                </div>
              );

              return unlocked ? (
                <button
                  key={String(tier.tier)}
                  type="button"
                  onClick={(event) => {
                    viewerTrigger.current = event.currentTarget;
                    setViewingTier(tier);
                  }}
                  aria-label={`View ${categoryName} Tier ${tier.tier} (${tier.threshold} correct${image ? "" : ", artwork unavailable"})`}
                  className="trophy-depth-slot group min-w-0 rounded-xl text-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#164a73]"
                >
                  {spotContent}
                </button>
              ) : (
                <div key={String(tier.tier)} className="trophy-depth-slot min-w-0 rounded-xl text-center">
                  {spotContent}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <Dialog open={!!viewingTier} onOpenChange={(open) => { if (!open) setViewingTier(null); }}>
        <DialogPortal>
          <DialogOverlay
            className="z-[10020] bg-[#173d5b]/75 backdrop-blur-sm"
            onClick={(event) => event.stopPropagation()}
          />
          <DialogContent
            className="fixed left-1/2 top-1/2 z-[10021] flex max-h-[90dvh] max-w-[94vw] -translate-x-1/2 -translate-y-1/2 items-center justify-center bg-transparent p-0 outline-none"
            onClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              viewerTrigger.current?.focus();
            }}
          >
            <DialogTitle className="sr-only">
              {viewingTier ? `${categoryName} Tier ${viewingTier.tier} patch` : "Trivia patch artwork"}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {viewingTier ? `Patch artwork for ${categoryName}, Tier ${viewingTier.tier}.` : "Patch artwork unavailable."}
            </DialogDescription>
            <DialogClose asChild>
              <button
                type="button"
                aria-label="Close patch artwork viewer"
                className="fixed right-4 top-4 z-[10022] flex h-12 w-12 items-center justify-center rounded-full border border-white/55 bg-[#173d5b]/70 text-white shadow-lg transition hover:bg-[#173d5b] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                <X size={22} />
              </button>
            </DialogClose>
            {viewingTier && viewingImage ? (
              <img
                src={viewingImage}
                alt={`${categoryName} tier ${viewingTier.tier} patch artwork`}
                className="max-h-[88dvh] max-w-[92vw] object-contain"
              />
            ) : (
              <p className="max-w-sm text-center text-sm font-semibold text-white">
                Artwork unavailable for this tier.
              </p>
            )}
          </DialogContent>
        </DialogPortal>
      </Dialog>
    </>
  );
}
