import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { toast } from "@/hooks/use-toast";

type Alert = { id: string; title: string; message: string };

/** Poll only the active adult coach's team. No child, chat, email or external
 * notification transport is involved. Unacknowledged IDs survive lost requests. */
export function useSchoolEligibilityAlerts(actorId: string, teamId: string, enabled: boolean) {
  const client = useQueryClient();
  const shown = useRef(new Set<string>());
  const endpoint = `/api/high-school/staff/teams/${encodeURIComponent(teamId)}/eligibility-alerts`;
  const query = useQuery<{ alerts: Alert[] }>({
    queryKey: ["school-eligibility-alerts", actorId, teamId],
    queryFn: async ({ signal }) => (await apiRequest("GET", endpoint, undefined, signal)).json(),
    enabled: enabled && !!actorId && !!teamId,
    refetchInterval: 15_000,
    refetchOnWindowFocus: "always",
    retry: false, staleTime: 0, gcTime: 0,
  });
  useEffect(() => {
    if (!enabled || !query.data?.alerts.length) return;
    let stopped = false;
    const alerts = query.data.alerts;
    const fresh = alerts.filter(alert => !shown.current.has(`${actorId}:${teamId}:${alert.id}`));
    if (fresh.length) {
      toast({ title: "Playing eligibility updated",
        description: "A league playing-status decision changed. Review your team’s eligibility before setting the lineup." });
      fresh.forEach(alert => shown.current.add(`${actorId}:${teamId}:${alert.id}`));
    }
    void (async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ["school-player-eligibility", "team", teamId] }),
        client.invalidateQueries({ queryKey: ["hs-staff", actorId, teamId] }),
      ]);
      for (const alert of alerts) {
        if (stopped) return;
        try { await apiRequest("POST", `${endpoint}/${encodeURIComponent(alert.id)}/read`, {}); }
        catch { /* Keep the durable unread record; the next poll retries ACK. */ }
      }
    })();
    return () => { stopped = true; };
  }, [query.data, query.dataUpdatedAt, actorId, teamId, enabled, endpoint, client]);
  return query;
}
