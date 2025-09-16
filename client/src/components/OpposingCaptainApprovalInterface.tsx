import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle, XCircle, Clock, Users, Calendar, User, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { format } from "date-fns";

interface OpposingCaptainApprovalInterfaceProps {
  className?: string;
}

export function OpposingCaptainApprovalInterface({ className }: OpposingCaptainApprovalInterfaceProps) {
  const [selectedRequest, setSelectedRequest] = useState<string | null>(null);
  const [captainComments, setCaptainComments] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch current user to check captain status
  const { data: currentUser } = useQuery({
    queryKey: ["/api/auth/user"],
  });

  // Check if user is a team captain (simplified check - server will validate properly)
  const isCaptain = currentUser ? true : false; // Simplified - server validates actual captain status

  // Fetch substitute requests pending opposing captain approval (only if user exists)
  const { data: pendingRequests = [], isLoading, error } = useQuery({
    queryKey: ["/api/substitute-requests/captain-approvals"],
    queryFn: async () => {
      const response = await fetch("/api/substitute-requests/captain-approvals");
      if (!response.ok) {
        if (response.status === 403) {
          throw new Error('Captain access required');
        }
        throw new Error('Failed to fetch captain approval requests');
      }
      return response.json();
    },
    enabled: isCaptain, // Only run query if user is authenticated
  });

  // Captain approval mutation
  const captainApprovalMutation = useMutation({
    mutationFn: async ({ requestId, status, comments }: { 
      requestId: string; 
      status: string; 
      comments?: string;
    }) => {
      await apiRequest("POST", `/api/substitute-requests/${requestId}/approve`, {
        approverType: 'opposing_captain',
        status,
        comments
      });
    },
    onSuccess: (_, { status }) => {
      toast({
        title: "Request Processed",
        description: `Substitute request ${status} as opposing team captain.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/substitute-requests/captain-approvals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/substitute-requests"] });
      setSelectedRequest(null);
      setCaptainComments("");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to process request. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleApprove = (requestId: string) => {
    captainApprovalMutation.mutate({ 
      requestId, 
      status: "approved", 
      comments: captainComments 
    });
  };

  const handleDeny = (requestId: string) => {
    if (!captainComments.trim()) {
      toast({
        title: "Comments Required",
        description: "Please provide comments when denying a substitute request.",
        variant: "destructive",
      });
      return;
    }
    captainApprovalMutation.mutate({ 
      requestId, 
      status: "denied", 
      comments: captainComments 
    });
  };

  const RequestCard = ({ request }: { request: any }) => (
    <Card 
      className={`transition-all hover:shadow-md ${selectedRequest === request.id ? 'ring-2 ring-primary' : ''}`}
      data-testid={`captain-approval-card-${request.id}`}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <Badge className="bg-orange-100 text-orange-700">
              <Clock className="h-3 w-3 mr-1" />
              Awaiting Your Approval
            </Badge>
          </div>
          <div className="text-xs text-muted-foreground">
            {format(new Date(request.createdAt), 'MMM d, h:mm a')}
          </div>
        </div>
        
        <CardTitle className="text-base flex items-center gap-2">
          <Shield className="h-4 w-4 text-blue-600" />
          Opposing Team Substitute Request
        </CardTitle>
        
        <CardDescription className="flex items-center gap-2">
          <Calendar className="h-3 w-3" />
          {request.game?.homeTeam?.name} vs {request.game?.awayTeam?.name}
          <span className="mx-1">•</span>
          {format(new Date(request.game?.scheduledAt), 'MMM d, yyyy h:mm a')}
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Requesting Team Information */}
        <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
          <p className="text-xs font-medium text-blue-800 mb-2">REQUESTING TEAM:</p>
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 bg-blue-600 rounded-full flex items-center justify-center">
              <Users className="h-4 w-4 text-white" />
            </div>
            <div>
              <p className="text-sm font-medium text-blue-900">
                {request.requestingTeam?.name || 'Unknown Team'}
              </p>
              <p className="text-xs text-blue-700">Opposing Team</p>
            </div>
          </div>
        </div>

        {/* Player Unable to Attend */}
        <div>
          <p className="text-sm font-medium text-muted-foreground mb-2">Player Unable to Attend:</p>
          <div className="flex items-center gap-3 p-3 bg-red-50 rounded-lg border border-red-200">
            <Avatar className="h-8 w-8">
              <AvatarImage src={request.originalPlayer?.profileImageUrl} />
              <AvatarFallback className="text-xs bg-red-200 text-red-800">
                {request.originalPlayer?.firstName?.[0]}{request.originalPlayer?.lastName?.[0]}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="text-sm font-medium">
                {request.originalPlayer?.firstName} {request.originalPlayer?.lastName}
              </p>
              <p className="text-xs text-muted-foreground">{request.originalPlayer?.email}</p>
            </div>
          </div>
        </div>

        {/* Requested Substitute */}
        {request.substitutePlayer && (
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-2">Requested Substitute:</p>
            <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg border border-green-200">
              <Avatar className="h-8 w-8">
                <AvatarImage src={request.substitutePlayer?.profileImageUrl} />
                <AvatarFallback className="text-xs bg-green-200 text-green-800">
                  {request.substitutePlayer?.firstName?.[0]}{request.substitutePlayer?.lastName?.[0]}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="text-sm font-medium">
                  {request.substitutePlayer?.firstName} {request.substitutePlayer?.lastName}
                </p>
                <p className="text-xs text-muted-foreground">{request.substitutePlayer?.email}</p>
              </div>
            </div>
          </div>
        )}

        {/* Request Details */}
        <div>
          <p className="text-sm font-medium text-muted-foreground mb-2">Requested By:</p>
          <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
            <User className="h-4 w-4" />
            <div>
              <p className="text-sm font-medium">
                {request.requestedByUser?.firstName} {request.requestedByUser?.lastName}
              </p>
              <p className="text-xs text-muted-foreground">Team Captain</p>
            </div>
          </div>
        </div>

        {request.reason && (
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-2">Additional Comments:</p>
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="text-sm">{request.reason}</p>
            </div>
          </div>
        )}

        {/* Captain Decision Section */}
        <div className="space-y-3 pt-4 border-t border-orange-200">
          <div className="flex items-center gap-2 text-orange-700">
            <Shield className="h-4 w-4" />
            <span className="text-sm font-medium">Captain Decision Required</span>
          </div>
          
          <div>
            <label className="text-sm font-medium text-muted-foreground">
              Comments (required for denial, optional for approval):
            </label>
            <Textarea
              value={selectedRequest === request.id ? captainComments : ""}
              onChange={(e) => {
                setSelectedRequest(request.id);
                setCaptainComments(e.target.value);
              }}
              placeholder="Add your comments as opposing team captain..."
              className="mt-1"
              data-testid={`textarea-captain-comments-${request.id}`}
            />
          </div>
          
          <div className="flex gap-2">
            <Button
              size="sm"
              className="flex-1 bg-green-600 hover:bg-green-700 text-white"
              onClick={() => handleApprove(request.id)}
              disabled={captainApprovalMutation.isPending || !isCaptain}
              data-testid={`button-captain-approve-${request.id}`}
            >
              <CheckCircle className="h-3 w-3 mr-1" />
              Approve Request
            </Button>
            <Button
              size="sm"
              variant="destructive"
              className="flex-1"
              onClick={() => handleDeny(request.id)}
              disabled={captainApprovalMutation.isPending || !isCaptain}
              data-testid={`button-captain-deny-${request.id}`}
            >
              <XCircle className="h-3 w-3 mr-1" />
              Deny Request
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  if (!currentUser) {
    return (
      <Card className={className}>
        <CardContent className="p-6 text-center">
          <div className="text-muted-foreground">Loading user information...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Shield className="h-6 w-6 text-blue-600" />
          <div>
            <h1 className="text-2xl font-bold">Captain Approvals</h1>
            <p className="text-muted-foreground">
              Review substitute requests from opposing teams
            </p>
          </div>
        </div>
        <Badge variant="secondary" className="text-lg px-3 py-1">
          {pendingRequests.length} Pending
        </Badge>
      </div>

      {/* Pending Requests */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Requests Awaiting Your Approval
          </CardTitle>
          <CardDescription>
            As an opposing team captain, review these substitute requests
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[600px]">
            <div className="space-y-4">
              {isLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <Card key={i} className="animate-pulse" data-testid={`loading-captain-${i}`}>
                      <CardContent className="p-4">
                        <div className="h-32 bg-muted rounded"></div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : pendingRequests.length > 0 ? (
                pendingRequests.map((request: any) => (
                  <RequestCard key={request.id} request={request} />
                ))
              ) : (
                <Card data-testid="empty-captain-approvals">
                  <CardContent className="p-8 text-center">
                    <Shield className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-medium mb-2">No Pending Approvals</h3>
                    <p className="text-muted-foreground">
                      There are no substitute requests awaiting your approval as opposing team captain.
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}