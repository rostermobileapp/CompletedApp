import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle, XCircle, Clock, Users, Calendar, User, ArrowRight, AlertCircle } from "lucide-react";
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

interface SubstituteRequestInterfaceProps {
  className?: string;
}

export function SubstituteRequestInterface({ className }: SubstituteRequestInterfaceProps) {
  const [selectedRequest, setSelectedRequest] = useState<string | null>(null);
  const [comments, setComments] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch user's outgoing requests
  const { data: outgoingRequests = [], isLoading: outgoingLoading } = useQuery({
    queryKey: ["/api/substitute-requests"],
    queryFn: async () => {
      const response = await fetch("/api/substitute-requests");
      if (!response.ok) {
        throw new Error('Failed to fetch substitute requests');
      }
      return response.json();
    },
  });

  // Fetch pending approvals for current user
  const { data: pendingApprovals = [], isLoading: approvalsLoading } = useQuery({
    queryKey: ["/api/substitute-requests/pending-approvals"],
    queryFn: async () => {
      const response = await fetch("/api/substitute-requests/pending-approvals");
      if (!response.ok) {
        throw new Error('Failed to fetch pending approvals');
      }
      return response.json();
    },
  });

  // Process approval mutation
  const processApprovalMutation = useMutation({
    mutationFn: async ({ requestId, approverType, status, comments }: { 
      requestId: string; 
      approverType: string; 
      status: string; 
      comments?: string;
    }) => {
      await apiRequest("POST", `/api/substitute-requests/${requestId}/approve`, {
        approverType,
        status,
        comments
      });
    },
    onSuccess: (_, { status }) => {
      toast({
        title: "Request Processed",
        description: `Request ${status} successfully.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/substitute-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/substitute-requests/pending-approvals"] });
      setSelectedRequest(null);
      setComments("");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to process request. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleApprove = (request: any, approverType: string) => {
    processApprovalMutation.mutate({ 
      requestId: request.id, 
      approverType, 
      status: "approved", 
      comments 
    });
  };

  const handleDeny = (request: any, approverType: string) => {
    if (!comments.trim()) {
      toast({
        title: "Comments Required",
        description: "Please provide comments when denying a request.",
        variant: "destructive",
      });
      return;
    }
    processApprovalMutation.mutate({ 
      requestId: request.id, 
      approverType, 
      status: "denied", 
      comments 
    });
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      pending_opponent_approval: { color: 'bg-blue-100 text-blue-700', icon: Clock, label: 'Pending Opponent' },
      pending_commissioner_approval: { color: 'bg-yellow-100 text-yellow-700', icon: Clock, label: 'Pending Commissioner' },
      pending_substitute_approval: { color: 'bg-purple-100 text-purple-700', icon: Clock, label: 'Pending Substitute' },
      approved: { color: 'bg-green-100 text-green-700', icon: CheckCircle, label: 'Approved' },
      denied: { color: 'bg-red-100 text-red-700', icon: XCircle, label: 'Denied' },
      expired: { color: 'bg-gray-100 text-gray-700', icon: AlertCircle, label: 'Expired' }
    };
    
    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.pending_opponent_approval;
    const Icon = config.icon;
    
    return (
      <Badge className={config.color}>
        <Icon className="h-3 w-3 mr-1" />
        {config.label}
      </Badge>
    );
  };

  const RequestCard = ({ request, isOutgoing = true }: { request: any; isOutgoing?: boolean }) => (
    <Card 
      className={`transition-all hover:shadow-md ${selectedRequest === request.id ? 'ring-2 ring-primary' : ''}`}
      data-testid={`request-card-${request.id}`}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            {getStatusBadge(request.status)}
          </div>
          <div className="text-xs text-muted-foreground">
            {format(new Date(request.createdAt), 'MMM d, h:mm a')}
          </div>
        </div>
        
        <CardTitle className="text-sm flex items-center gap-2">
          <Users className="h-4 w-4" />
          {request.game?.homeTeam?.name} vs {request.game?.awayTeam?.name}
        </CardTitle>
        
        <CardDescription className="flex items-center gap-1 text-xs">
          <Calendar className="h-3 w-3" />
          {format(new Date(request.game?.scheduledAt), 'MMM d, h:mm a')}
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-3">
        {/* Player Information */}
        <div className="flex items-center gap-3">
          <ClickableAvatar
            userId={request.originalPlayer?.id || ''}
            profileImageUrl={request.originalPlayer?.profileImageUrl}
            firstName={request.originalPlayer?.firstName}
            lastName={request.originalPlayer?.lastName}
            size="sm"
          />
          <div className="flex-1">
            <p className="text-sm font-medium">
              {request.originalPlayer?.firstName} {request.originalPlayer?.lastName}
            </p>
            <p className="text-xs text-muted-foreground">Cannot attend</p>
          </div>
          {request.substitutePlayer && (
            <>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
              <ClickableAvatar
                userId={request.substitutePlayer?.id || ''}
                profileImageUrl={request.substitutePlayer?.profileImageUrl}
                firstName={request.substitutePlayer?.firstName}
                lastName={request.substitutePlayer?.lastName}
                size="sm"
              />
              <div>
                <p className="text-sm font-medium">
                  {request.substitutePlayer?.firstName} {request.substitutePlayer?.lastName}
                </p>
                <p className="text-xs text-muted-foreground">Substitute</p>
              </div>
            </>
          )}
        </div>

        {/* Reason/Comments */}
        {request.reason && (
          <div className="p-2 bg-muted/50 rounded-lg">
            <p className="text-xs text-muted-foreground">Comments:</p>
            <p className="text-sm">{request.reason}</p>
          </div>
        )}

        {/* Action Buttons for Pending Approvals */}
        {!isOutgoing && (
          <div className="space-y-2 pt-2 border-t">
            <Textarea
              value={selectedRequest === request.id ? comments : ""}
              onChange={(e) => {
                setSelectedRequest(request.id);
                setComments(e.target.value);
              }}
              placeholder="Add comments (required for denial)..."
              className="text-sm"
              data-testid={`textarea-comments-${request.id}`}
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                className="flex-1 text-green-700 border-green-200 hover:bg-green-50"
                onClick={() => handleApprove(request, request.nextApprover)}
                disabled={processApprovalMutation.isPending}
                data-testid={`button-approve-${request.id}`}
              >
                <CheckCircle className="h-3 w-3 mr-1" />
                Approve
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="flex-1 text-red-700 border-red-200 hover:bg-red-50"
                onClick={() => handleDeny(request, request.nextApprover)}
                disabled={processApprovalMutation.isPending}
                data-testid={`button-deny-${request.id}`}
              >
                <XCircle className="h-3 w-3 mr-1" />
                Deny
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className={`grid grid-cols-1 lg:grid-cols-2 gap-6 ${className}`}>
      {/* Left Column - Outgoing Requests */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          <h2 className="text-lg font-semibold">My Requests</h2>
          <Badge variant="secondary" className="ml-auto">
            {outgoingRequests.length}
          </Badge>
        </div>
        
        <ScrollArea className="h-[600px]">
          <div className="space-y-3">
            {outgoingLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Card key={i} className="animate-pulse" data-testid={`loading-outgoing-${i}`}>
                    <CardContent className="p-4">
                      <div className="h-20 bg-muted rounded"></div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : outgoingRequests.length > 0 ? (
              outgoingRequests.map((request: any) => (
                <RequestCard key={request.id} request={request} isOutgoing={true} />
              ))
            ) : (
              <Card data-testid="empty-outgoing-requests">
                <CardContent className="p-6 text-center">
                  <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">No substitute requests yet</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Requests you make will appear here
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Right Column - Pending Approvals */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          <h2 className="text-lg font-semibold">Pending Approvals</h2>
          <Badge variant="secondary" className="ml-auto">
            {pendingApprovals.length}
          </Badge>
        </div>
        
        <ScrollArea className="h-[600px]">
          <div className="space-y-3">
            {approvalsLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Card key={i} className="animate-pulse" data-testid={`loading-approvals-${i}`}>
                    <CardContent className="p-4">
                      <div className="h-24 bg-muted rounded"></div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : pendingApprovals.length > 0 ? (
              pendingApprovals.map((request: any) => (
                <RequestCard key={request.id} request={request} isOutgoing={false} />
              ))
            ) : (
              <Card data-testid="empty-pending-approvals">
                <CardContent className="p-6 text-center">
                  <Clock className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">No pending approvals</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Requests awaiting your approval will appear here
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}