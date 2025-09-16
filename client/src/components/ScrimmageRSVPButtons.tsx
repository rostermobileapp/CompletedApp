import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, X, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { ScrimmageRequest } from "@shared/schema";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useState } from "react";

interface ScrimmageRSVPButtonsProps {
  scrimmageId: string;
  className?: string;
}

export function ScrimmageRSVPButtons({ scrimmageId, className }: ScrimmageRSVPButtonsProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);

  // Get current request status
  const { data: userRequests = [], isLoading } = useQuery({
    queryKey: ["/api/users", "scrimmage-requests"],
  }) as { data: (ScrimmageRequest & { scrimmage: any })[], isLoading: boolean };

  const currentRequest = userRequests.find(req => req.scrimmageId === scrimmageId);
  const currentStatus = currentRequest?.status || 'no_request';

  // Join scrimmage mutation
  const joinMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/scrimmages/${scrimmageId}/requests`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users", "scrimmage-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/scrimmages", scrimmageId, "requests"] });
      toast({
        title: "Request Sent",
        description: "Your request to join this scrimmage has been sent to the creator.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to send request. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Withdraw request mutation
  const withdrawMutation = useMutation({
    mutationFn: async () => {
      if (currentRequest?.id) {
        await apiRequest("DELETE", `/api/scrimmage-requests/${currentRequest.id}`, {});
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users", "scrimmage-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/scrimmages", scrimmageId, "requests"] });
      toast({
        title: "Request Withdrawn",
        description: "Your request has been withdrawn.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error", 
        description: error.message || "Failed to withdraw request. Please try again.",
        variant: "destructive",
      });
    },
  });

  const isMutating = joinMutation.isPending || withdrawMutation.isPending;

  // Show loading state while fetching requests
  if (isLoading) {
    return (
      <div className={cn("flex gap-2", className)} data-testid="scrimmage-rsvp-buttons">
        <Button
          variant="outline"
          size="sm"
          disabled
          className="flex items-center gap-1"
        >
          <div className="w-4 h-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          Loading
        </Button>
      </div>
    );
  }

  // Show appropriate button based on current status
  if (currentStatus === 'no_request') {
    return (
      <div className={cn("flex gap-2", className)} data-testid="scrimmage-rsvp-buttons">
        <Button
          variant="default"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            joinMutation.mutate();
          }}
          disabled={isMutating}
          className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white border-2 border-blue-600"
          data-testid="button-join-scrimmage"
        >
          <Users className="w-4 h-4" />
          Join
        </Button>
      </div>
    );
  }

  if (currentStatus === 'pending') {
    return (
      <div className={cn("flex gap-2", className)} data-testid="scrimmage-rsvp-buttons">
        <Button
          variant="outline"
          size="sm"
          disabled
          className="flex items-center gap-1 border-2 border-yellow-500 text-yellow-700 bg-yellow-50"
          data-testid="button-pending-request"
        >
          <Check className="w-4 h-4" />
          Pending
        </Button>
        <Button
          variant="destructive"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            withdrawMutation.mutate();
          }}
          disabled={isMutating}
          className="flex items-center gap-1"
          data-testid="button-withdraw-request"
        >
          <X className="w-4 h-4" />
          Withdraw
        </Button>
      </div>
    );
  }

  if (currentStatus === 'approved') {
    return (
      <>
        <div className={cn("flex gap-2", className)} data-testid="scrimmage-rsvp-buttons">
          <Button
            variant="default"
            size="sm"
            disabled
            className="flex items-center gap-1 bg-green-600 text-white border-2 border-green-600"
            data-testid="button-approved"
          >
            <Check className="w-4 h-4" />
            Approved
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              setShowLeaveConfirm(true);
            }}
            disabled={isMutating}
            className="flex items-center gap-1 text-red-600 border-red-600 hover:bg-red-50"
            data-testid="button-leave-scrimmage"
          >
            <X className="w-4 h-4" />
            Leave
          </Button>
        </div>
        
        <AlertDialog open={showLeaveConfirm} onOpenChange={setShowLeaveConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Leave Scrimmage</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to leave this scrimmage? You will need to request to join again if you change your mind.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  withdrawMutation.mutate();
                  setShowLeaveConfirm(false);
                }}
                className="bg-red-600 hover:bg-red-700"
              >
                Leave Scrimmage
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  }

  if (currentStatus === 'dismissed') {
    return (
      <div className={cn("flex gap-2", className)} data-testid="scrimmage-rsvp-buttons">
        <Button
          variant="outline"
          size="sm"
          disabled
          className="flex items-center gap-1 border-2 border-red-500 text-red-700 bg-red-50"
          data-testid="button-dismissed"
        >
          <X className="w-4 h-4" />
          Declined
        </Button>
      </div>
    );
  }

  return null;
}