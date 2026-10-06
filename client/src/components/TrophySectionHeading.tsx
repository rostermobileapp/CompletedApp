import { useState } from "react";
import { ChevronDown, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export function TrophySectionHeading({
  label,
  description,
  count,
  expanded,
  onToggle,
  contentId,
}: {
  label: string;
  description: string;
  count?: number;
  expanded?: boolean;
  onToggle?: () => void;
  contentId?: string;
}) {
  const [helpOpen, setHelpOpen] = useState(false);
  const helpTitleId = `category-help-title-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  const helpDescriptionId = `${helpTitleId}-description`;

  return (
    <div className={expanded ? "mb-3 border-b border-[#d7e2eb] pb-2" : "mb-0 border-b-0 pb-0"}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <h3 className="min-w-0">
            {onToggle ? (
              <button
                type="button"
                aria-expanded={expanded}
                aria-controls={contentId}
                onClick={onToggle}
                className="inline-flex min-h-11 items-center gap-2 rounded-md text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#164a73]"
              >
                <span className="text-base font-bold tracking-tight text-[#173d5b] sm:text-lg">{label}</span>
                <ChevronDown aria-hidden="true" size={17} className={`shrink-0 text-[#164a73] transition-transform duration-200 ${expanded ? "rotate-180" : ""}`} />
              </button>
            ) : (
              <span className="text-base font-bold tracking-tight text-[#173d5b] sm:text-lg">{label}</span>
            )}
          </h3>
          <Popover open={helpOpen} onOpenChange={setHelpOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label={`About ${label}`}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[#b7c9d7] bg-[#edf5fb] text-xs font-bold leading-none text-[#164a73] transition hover:border-[#164a73] hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#164a73]"
              >
                ?
              </button>
            </PopoverTrigger>
            <PopoverContent
              side="bottom"
              align="start"
              collisionPadding={12}
              aria-labelledby={helpTitleId}
              aria-describedby={helpDescriptionId}
              className="w-[calc(100vw-2rem)] max-w-[20rem] rounded-xl border-[#c8dbe8] bg-[#f8fbfd] p-4 text-[#173d5b] shadow-[0_16px_35px_#23415d25]"
            >
              <div className="flex items-start justify-between gap-3">
                <h4 id={helpTitleId} className="text-sm font-bold tracking-tight">About {label}</h4>
                <button
                  type="button"
                  aria-label={`Close ${label} description`}
                  onClick={() => setHelpOpen(false)}
                  className="-mr-1 -mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[#718394] transition hover:bg-[#e8f0f6] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#164a73]"
                >
                  <X size={16} />
                </button>
              </div>
              <p id={helpDescriptionId} className="mt-2 text-xs leading-relaxed text-[#597087]">{description}</p>
            </PopoverContent>
          </Popover>
        </div>
        {count !== undefined && (
          <span className="shrink-0 rounded-full bg-[#e8f0f6] px-2.5 py-1 font-mono text-[9px] uppercase tracking-wider text-[#164a73]">
            {count} {count === 1 ? "award" : "spots"}
          </span>
        )}
      </div>
    </div>
  );
}
