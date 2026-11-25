import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";

export function useProductionOnboardingAccess(enabled=true) {
  const { user,isLoading }=useAuth();
  return useQuery<{enabled:boolean}>({
    queryKey:["production-onboarding-access",user?.id],
    queryFn:async({signal})=>(await apiRequest("GET","/api/high-school/test-access",undefined,signal)).json(),
    enabled:import.meta.env.PROD&&enabled&&!!user&&!isLoading,
    staleTime:30_000,retry:false,refetchOnWindowFocus:true,
  });
}
