import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle, XCircle, Clock, Users, Calendar, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ClickableAvatar } from "@/components/ClickableAvatar";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { format } from "date-fns";

interface SubstituteRequestsDashboardProps {
  className?: string;
  gameId?: string; // Optional prop to filter requests by specific game
}

export function SubstituteRequestsDashboard({ className, gameId }: SubstituteRequestsDashboardProps) {
  const [selectedRequest, setSelectedRequest] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch substitute requests
  const { data: requests = [], isLoading } = useQuery({
    queryKey: ["/api/substitute-requests", gameId],
    queryFn: async () => {
      const response = await fetch("/api/substitute-requests");
      if (!response.ok) {
        throw new Error('Failed to fetch substitute requests');
      }
      const allRequests = await response.json();
      
      // Filter by gameId if provided
      if (gameId) {
        return allRequests.filter((request: any) => request.gameId === gameId);
      }
      
      return allRequests;
    },
  });

  // Update request mutation
  const updateRequestMutation = useMutation({
    mutationFn: async ({ requestId, status, reason }: { requestId: string; status: string; reason?: string }) => {
      await apiRequest("PUT", `/api/substitute-requests/${requestId}`, { status, reason });
    },
    onSuccess: (_, { status }) => {
      toast({
        title: "Request Updated",
        description: `Substitute request ${status}.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/substitute-requests"] });
      setSelectedRequest(null);
      setReason("");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update request. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleApprove = (requestId: string) => {
    updateRequestMutation.mutate({ requestId, status: "approved", reason });
  };

  const handleDeny = (requestId: string) => {
    if (!reason.trim()) {
      toast({
        title: "Reason Required",
        description: "Please provide a reason for denying this request.",
        variant: "destructive",
      });
      return;
    }
    updateRequestMutation.mutate({ requestId, status: "denied", reason });
  };

  const pendingRequests = requests.filter((req: any) => req.status === 'pending');
  const processedRequests = requests.filter((req: any) => req.status !== 'pending');

  const RequestCard = ({ request, isPending = true }: { request: any; isPending?: boolean }) => (
    <Card 
      className={`transition-all bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800 ${selectedRequest === request.id ? 'ring-2 ring-red-500' : ''}`}
      data-testid={`request-card-${request.id}`}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <Badge 
              variant={request.status === 'pending' ? 'secondary' : request.status === 'approved' ? 'default' : 'destructive'}
              className={
                request.status === 'pending' ? 'bg-[#000000] text-[#ffffff]' :
                request.status === 'approved' ? 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' :
                'bg-red-200 text-red-800 dark:bg-red-900 dark:text-red-300'
              }
            >
              {request.status === 'pending' && <Clock className="h-3 w-3 mr-1" />}
              {request.status === 'approved' && <CheckCircle className="h-3 w-3 mr-1" />}
              {request.status === 'denied' && <XCircle className="h-3 w-3 mr-1" />}
              {request.status}
            </Badge>
          </div>
          <div className="text-xs text-muted-foreground">
            {format(new Date(request.createdAt), 'MMM d, yyyy h:mm a')}
          </div>
        </div>
        
        <CardTitle className="text-base flex items-center gap-2 text-red-700 dark:text-red-400">
          <Users className="h-4 w-4" />
          Substitute Request
        </CardTitle>
        
        <CardDescription className="flex items-center gap-2">
          <Calendar className="h-3 w-3" />
          {request.game.homeTeam.name} vs {request.game.awayTeam.name}
          <span className="mx-1">•</span>
          {format(new Date(request.game.scheduledAt), 'MMM d, yyyy h:mm a')}
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Original Player */}
        <div>
          <p className="text-sm font-medium text-muted-foreground mb-2">Player Unable to Attend:</p>
          <div className="flex items-center gap-3 p-2 bg-red-100 dark:bg-red-900 rounded-lg border border-red-200 dark:border-red-700">
            <ClickableAvatar
              userId={request.originalPlayer.id}
              profileImageUrl={request.originalPlayer.profileImageUrl}
              firstName={request.originalPlayer.firstName}
              lastName={request.originalPlayer.lastName}
              size="sm"
            />
            <div>
              <p className="text-sm font-medium">
                {request.originalPlayer.firstName} {request.originalPlayer.lastName}
              </p>
              <p className="text-xs text-muted-foreground">{request.originalPlayer.email}</p>
            </div>
          </div>
        </div>

        {/* Substitute Player */}
        {request.substitutePlayer && (
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-2">Requested Substitute:</p>
            <div className="flex items-center gap-3 p-2 bg-white dark:bg-red-900 rounded-lg border border-red-200 dark:border-red-700">
              <ClickableAvatar
                userId={request.substitutePlayer.id}
                profileImageUrl={request.substitutePlayer.profileImageUrl}
                firstName={request.substitutePlayer.firstName}
                lastName={request.substitutePlayer.lastName}
                size="sm"
              />
              <div>
                <p className="text-sm font-medium">
                  {request.substitutePlayer.firstName} {request.substitutePlayer.lastName}
                </p>
                <p className="text-xs text-muted-foreground">{request.substitutePlayer.email}</p>
              </div>
            </div>
          </div>
        )}

        {/* Requested By */}
        <div>
          <p className="text-sm font-medium text-muted-foreground mb-2">Requested By:</p>
          <div className="flex items-center gap-3 p-2 bg-muted/50 rounded-lg">
            <User className="h-4 w-4" />
            <div>
              <p className="text-sm font-medium">
                {request.requestedByUser.firstName} {request.requestedByUser.lastName}
              </p>
              <p className="text-xs text-muted-foreground">Team Captain</p>
            </div>
          </div>
        </div>

        {/* Reason (if denied) */}
        {request.reason && (
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-2">Reason:</p>
            <div className="p-2 bg-muted/50 rounded-lg">
              <p className="text-sm">{request.reason}</p>
            </div>
          </div>
        )}

        {/* Action Buttons for Pending Requests */}
        {isPending && (
          <div className="space-y-3 pt-2 border-t">
            <div>
              <label className="text-sm font-medium text-muted-foreground">
                Reason (optional for approval, required for denial):
              </label>
              <Textarea
                value={selectedRequest === request.id ? reason : ""}
                onChange={(e) => {
                  setSelectedRequest(request.id);
                  setReason(e.target.value);
                }}
                placeholder="Enter reason for your decision..."
                className="mt-1"
                data-testid={`textarea-reason-${request.id}`}
              />
            </div>
            
            <div className="flex gap-2">
              <Button
                variant="default"
                size="sm"
                onClick={() => handleApprove(request.id)}
                disabled={updateRequestMutation.isPending}
                className="bg-[#000000] text-[#fcfcfc] hover:bg-[#000000] hover:opacity-90"
                data-testid={`button-approve-${request.id}`}
              >
                <CheckCircle className="h-4 w-4 mr-1" />
                Approve
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleDeny(request.id)}
                disabled={updateRequestMutation.isPending}
                className="border-red-300 dark:border-red-700 text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900"
                data-testid={`button-deny-${request.id}`}
              >
                <XCircle className="h-4 w-4 mr-1" />
                Deny
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );

  if (isLoading) {
    return (
      <div className={className}>
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader>
                <div className="h-4 bg-muted rounded w-32"></div>
                <div className="h-3 bg-muted rounded w-48"></div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="h-3 bg-muted rounded w-full"></div>
                  <div className="h-3 bg-muted rounded w-3/4"></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={className} data-testid="substitute-requests-dashboard">
      <div className="space-y-6">
        {/* Pending Requests */}
        {pendingRequests.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Clock className="h-5 w-5 text-red-600 dark:text-red-400" />
              Pending Requests ({pendingRequests.length})
            </h2>
            <ScrollArea className="max-h-[60vh]">
              <div className="space-y-4 pr-4">
                {pendingRequests.map((request: any) => (
                  <RequestCard key={request.id} request={request} isPending={true} />
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* Processed Requests */}
        {processedRequests.length > 0 && (
          <div>
            {pendingRequests.length > 0 && <Separator />}
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-gray-600 dark:text-gray-400" />
              Processed Requests ({processedRequests.length})
            </h2>
            <ScrollArea className="max-h-[40vh]">
              <div className="space-y-4 pr-4">
                {processedRequests.map((request: any) => (
                  <RequestCard key={request.id} request={request} isPending={false} />
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* Empty State - Compact */}
        {requests.length === 0 && (
          <div className="text-center py-2">
            <p className="text-sm text-muted-foreground">
              No substitute requests for this game
            </p>
          </div>
        )}
      </div>
    </div>
  );
}