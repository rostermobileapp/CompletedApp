import { useQuery } from "@tanstack/react-query";
import { Check, X, Clock, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrimmageRequest } from "@shared/schema";

interface ScrimmageRSVPStatusIconProps {
  scrimmageId: string;
  className?: string;
}

export function ScrimmageRSVPStatusIcon({ scrimmageId, className }: ScrimmageRSVPStatusIconProps) {
  // Get current request status
  const { data: userRequests = [] } = useQuery({
    queryKey: ["/api/users", "scrimmage-requests"],
  }) as { data: (ScrimmageRequest & { scrimmage: any })[] };

  const currentRequest = userRequests.find(req => req.scrimmageId === scrimmageId);
  const status = currentRequest?.status || 'no_request';

  if (status === 'no_request') {
    return (
      <div className={cn("flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 border-2 border-gray-300", className)} data-testid="scrimmage-rsvp-status-no-request">
        <Users className="w-3 h-3 text-gray-500" />
      </div>
    );
  }

  if (status === 'pending') {
    return (
      <div className={cn("flex items-center justify-center w-6 h-6 rounded-full bg-yellow-100 border-2 border-yellow-500", className)} data-testid="scrimmage-rsvp-status-pending">
        <Clock className="w-3 h-3 text-yellow-600" />
      </div>
    );
  }

  if (status === 'approved') {
    return (
      <div className={cn("flex items-center justify-center w-6 h-6 rounded-full bg-green-600 border-2 border-green-600 shadow-lg", className)} data-testid="scrimmage-rsvp-status-approved">
        <Check className="w-4 h-4 text-white font-bold" />
      </div>
    );
  }

  if (status === 'dismissed') {
    return (
      <div className={cn("flex items-center justify-center w-6 h-6 rounded-full bg-red-600 border-2 border-red-600 shadow-lg", className)} data-testid="scrimmage-rsvp-status-dismissed">
        <X className="w-4 h-4 text-white font-bold" />
      </div>
    );
  }

  return null;
}