import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { SchoolLeagueActionResult, SchoolLeagueWorkspace } from "@shared/schoolLeagueManagement";

export const schoolLeagueKey = (leagueId: string) => ["school-league-management", leagueId] as const;
export const schoolLeagueBase = (leagueId: string) => `/api/high-school/leagues/${encodeURIComponent(leagueId)}/management`;
export function useSchoolLeagueWorkspace(leagueId: string, enabled = true) {
  return useQuery<SchoolLeagueWorkspace>({
    queryKey: schoolLeagueKey(leagueId), enabled: enabled && !!leagueId, retry: false, gcTime: 0,
    queryFn: async ({ signal }) => {
      const data = await (await apiRequest("GET", schoolLeagueBase(leagueId), undefined, signal)).json();
      if (!Array.isArray(data.schools) || !Array.isArray(data.programs))
        throw new Error("School and program management needs the matching backend and database update. Your existing records have not been changed.");
      return data;
    },
  });
}
export function useSchoolLeagueAction(leagueId: string) {
  const queries = useQueryClient();
  return useMutation<SchoolLeagueActionResult, Error, { path: string; body: unknown }>({
    gcTime: 0,
    mutationFn: async ({ path, body }) => (await apiRequest("POST", `${schoolLeagueBase(leagueId)}${path}`, body)).json(),
    onSuccess: async (_result, action) => {
      if (action.path === "/schedule/preview") return;
      await queries.invalidateQueries({ queryKey: schoolLeagueKey(leagueId) });
      if (action.path === "/name") {
        await queries.invalidateQueries({ queryKey: ["/api/leagues"] });
      }
      await queries.invalidateQueries({ queryKey: ["/api/user/teams"] });
    },
  });
}
