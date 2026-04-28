import { useEffect, useMemo, useState } from "react";
import { Trophy } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { getImageUrl, queryClient } from "@/lib/queryClient";
import { format } from "date-fns";

interface TournamentCountdownProps {
  tournamentId: string;
  name: string;
  logoUrl?: string | null;
  accessStartDate: string | Date | null;
}

interface Remaining {
  total: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

function diff(target: Date): Remaining {
  const total = Math.max(0, target.getTime() - Date.now());
  const seconds = Math.floor((total / 1000) % 60);
  const minutes = Math.floor((total / 1000 / 60) % 60);
  const hours = Math.floor((total / 1000 / 60 / 60) % 24);
  const days = Math.floor(total / 1000 / 60 / 60 / 24);
  return { total, days, hours, minutes, seconds };
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

export function TournamentCountdown({
  tournamentId,
  name,
  logoUrl,
  accessStartDate,
}: TournamentCountdownProps) {
  const target = useMemo(() => {
    if (!accessStartDate) return null;
    const d = accessStartDate instanceof Date ? accessStartDate : new Date(accessStartDate);
    return Number.isNaN(d.getTime()) ? null : d;
  }, [accessStartDate]);

  const [remaining, setRemaining] = useState<Remaining>(() =>
    target ? diff(target) : { total: 0, days: 0, hours: 0, minutes: 0, seconds: 0 }
  );

  useEffect(() => {
    if (!target) return;

    let didTransition = false;
    const tick = () => {
      const next = diff(target);
      setRemaining(next);
      if (next.total === 0 && !didTransition) {
        didTransition = true;
        // Re-fetch the tournament so the page can swap to the normal detail view
        queryClient.invalidateQueries({
          queryKey: ["/api/tournaments", tournamentId],
        });
      }
    };

    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [target, tournamentId]);

  const resolvedLogo = logoUrl ? getImageUrl(logoUrl) : null;
  const startsAtLabel = target ? format(target, "PPPP 'at' p") : null;

  return (
    <div
      className="min-h-screen bg-background flex items-center justify-center px-4 py-10"
      data-testid="tournament-countdown-screen"
    >
      <Card className="w-full max-w-3xl border-border shadow-lg">
        <CardContent className="p-8 md:p-12 flex flex-col items-center text-center gap-8">
          <div className="flex flex-col items-center gap-4">
            {resolvedLogo ? (
              <img
                src={resolvedLogo}
                alt={`${name} logo`}
                className="h-24 w-24 md:h-32 md:w-32 rounded-xl object-cover border border-border bg-card"
                data-testid="img-countdown-logo"
              />
            ) : (
              <div
                className="h-24 w-24 md:h-32 md:w-32 rounded-xl border border-border bg-card flex items-center justify-center"
                data-testid="img-countdown-logo-fallback"
              >
                <Trophy className="h-12 w-12 md:h-16 md:w-16 text-primary" />
              </div>
            )}

            <div className="space-y-1">
              <p className="text-sm uppercase tracking-widest text-muted-foreground">
                You're in!
              </p>
              <h1
                className="text-3xl md:text-4xl font-bold tracking-tight"
                data-testid="text-countdown-tournament-name"
              >
                {name}
              </h1>
              <p className="text-muted-foreground text-base md:text-lg">
                Tournament access opens soon
              </p>
            </div>
          </div>

          {target ? (
            <div className="w-full">
              <div
                className="grid grid-cols-4 gap-2 md:gap-4"
                data-testid="tournament-countdown-timer"
                role="timer"
                aria-live="polite"
              >
                {[
                  { label: "Days", value: remaining.days, testid: "countdown-days" },
                  { label: "Hours", value: remaining.hours, testid: "countdown-hours" },
                  { label: "Minutes", value: remaining.minutes, testid: "countdown-minutes" },
                  { label: "Seconds", value: remaining.seconds, testid: "countdown-seconds" },
                ].map((unit) => (
                  <div
                    key={unit.label}
                    className="rounded-xl border border-border bg-card/60 p-3 md:p-5 flex flex-col items-center"
                  >
                    <span
                      className="text-3xl md:text-6xl font-bold tabular-nums text-foreground"
                      data-testid={unit.testid}
                    >
                      {pad(unit.value)}
                    </span>
                    <span className="text-xs md:text-sm uppercase tracking-wide text-muted-foreground mt-1">
                      {unit.label}
                    </span>
                  </div>
                ))}
              </div>

              {startsAtLabel && (
                <p
                  className="text-sm md:text-base text-muted-foreground mt-6"
                  data-testid="text-countdown-starts-at"
                >
                  Access opens {startsAtLabel}
                </p>
              )}
            </div>
          ) : (
            <p className="text-muted-foreground" data-testid="text-countdown-no-date">
              We don't have an access start time yet. Check back soon.
            </p>
          )}

          <p className="text-xs md:text-sm text-muted-foreground max-w-md">
            We'll automatically unlock the brackets, schedule, and team rosters
            the moment the timer hits zero — no need to refresh.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default TournamentCountdown;
