export type BadgeBackfillJob = { name: string; run: () => Promise<unknown> };

// Historical repairs must never decide whether the HTTP server is available.
// Each job is independent: one malformed record cannot stop other badge families.
export async function runBadgeBackfillJobs(
  jobs: readonly BadgeBackfillJob[],
  onError: (name: string, error: unknown) => void = (name, error) =>
    console.error(`[Badges] ${name} backfill failed:`, error),
): Promise<void> {
  for (const job of jobs) {
    try {
      await job.run();
    } catch (error) {
      onError(job.name, error);
    }
  }
}