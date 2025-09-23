import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle, XCircle, Clock, Users, Calendar, User, Crown, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { format } from "date-fns";
import { usePermissions } from '@/context/SubscriptionContext';

interface CommissionerApprovalInterfaceProps {
  className?: string;
}

export function CommissionerApprovalInterface({ className }: CommissionerApprovalInterfaceProps) {
  const [selectedRequest, setSelectedRequest] = useState<string | null>(null);
  const [commissionerComments, setCommissionerComments] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch current user to verify commissioner status
  const { data: currentUser } = useQuery({
    queryKey: ["/api/auth/user"],
  });

  // Check if user has commissioner permissions
  const { hasRole } = usePermissions();
  const isCommissioner = hasRole('secondary_commissioner');

  // Fetch substitute requests pending commissioner approval (only if user is commissioner)
  const { data: pendingRequests = [], isLoading, error } = useQuery({
    queryKey: ["/api/substitute-requests/commissioner-approvals"],
    queryFn: async () => {
      const response = await fetch("/api/substitute-requests/commissioner-approvals");
      if (!response.ok) {
        if (response.status === 403) {
          throw new Error('Commissioner access required');
        }
        throw new Error('Failed to fetch commissioner approval requests');
      }
      return response.json();
    },
    enabled: isCommissioner, // Only run query if user is commissioner
  });

  // Commissioner approval mutation
  const commissionerApprovalMutation = useMutation({
    mutationFn: async ({ requestId, status, comments }: { 
      requestId: string; 
      status: string; 
      comments?: string;
    }) => {
      await apiRequest("POST", `/api/substitute-requests/${requestId}/approve`, {
        approverType: 'commissioner',
        status,
        comments
      });
    },
    onSuccess: (_, { status }) => {
      toast({
        title: "Request Processed",
        description: `Substitute request ${status} as league commissioner.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/substitute-requests/commissioner-approvals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/substitute-requests"] });
      setSelectedRequest(null);
      setCommissionerComments("");
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
    commissionerApprovalMutation.mutate({ 
      requestId, 
      status: "approved", 
      comments: commissionerComments 
    });
  };

  const handleDeny = (requestId: string) => {
    if (!commissionerComments.trim()) {
      toast({
        title: "Comments Required",
        description: "Please provide comments when denying a substitute request.",
        variant: "destructive",
      });
      return;
    }
    commissionerApprovalMutation.mutate({ 
      requestId, 
      status: "denied", 
      comments: commissionerComments 
    });
  };

  const RequestCard = ({ request }: { request: any }) => (
    <Card 
      className={`transition-all hover:shadow-md ${selectedRequest === request.id ? 'ring-2 ring-primary' : ''}`}
      data-testid={`commissioner-approval-card-${request.id}`}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <Badge className="bg-purple-100 text-purple-700">
              <Clock className="h-3 w-3 mr-1" />
              Final Approval Required
            </Badge>
            {request.opposingCaptainApproved && (
              <Badge className="bg-green-100 text-green-700">
                <CheckCircle className="h-3 w-3 mr-1" />
                Captain Approved
              </Badge>
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            {format(new Date(request.createdAt), 'MMM d, h:mm a')}
          </div>
        </div>
        
        <CardTitle className="text-base flex items-center gap-2">
          <Crown className="h-4 w-4 text-purple-600" />
          Commissioner Final Review
        </CardTitle>
        
        <CardDescription className="flex items-center gap-2">
          <Calendar className="h-3 w-3" />
          {request.game?.homeTeam?.name} vs {request.game?.awayTeam?.name}
          <span className="mx-1">•</span>
          {format(new Date(request.game?.scheduledAt), 'MMM d, yyyy h:mm a')}
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Approval Progress */}
        <div className="p-3 bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg border border-purple-200">
          <p className="text-xs font-medium text-purple-800 mb-3">APPROVAL PROGRESS:</p>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <span className="text-sm text-green-700">Team Captain Approved</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <span className="text-sm text-green-700">Opposing Captain Approved</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-purple-600" />
              <span className="text-sm text-purple-700 font-medium">Commissioner Approval (FINAL)</span>
            </div>
          </div>
        </div>

        {/* Teams Information */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
            <p className="text-xs font-medium text-blue-800 mb-2">REQUESTING TEAM:</p>
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 bg-blue-600 rounded-full flex items-center justify-center">
                <Users className="h-3 w-3 text-white" />
              </div>
              <span className="text-sm font-medium text-blue-900">
                {request.requestingTeam?.name || 'Unknown Team'}
              </span>
            </div>
          </div>
          <div className="p-3 bg-orange-50 rounded-lg border border-orange-200">
            <p className="text-xs font-medium text-orange-800 mb-2">OPPOSING TEAM:</p>
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 bg-orange-600 rounded-full flex items-center justify-center">
                <Shield className="h-3 w-3 text-white" />
              </div>
              <span className="text-sm font-medium text-orange-900">
                {request.opposingTeam?.name || 'Unknown Team'}
              </span>
            </div>
          </div>
        </div>

        {/* Player Information */}
        <div>
          <p className="text-sm font-medium text-muted-foreground mb-2">Player Substitution:</p>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 p-2 bg-red-50 rounded-lg flex-1">
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
                <p className="text-xs text-red-600">Unable to attend</p>
              </div>
            </div>
            
            {request.substitutePlayer && (
              <>
                <div className="text-muted-foreground">→</div>
                <div className="flex items-center gap-2 p-2 bg-green-50 rounded-lg flex-1">
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
                    <p className="text-xs text-green-600">Substitute player</p>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Previous Comments */}
        {(request.captainComments || request.opposingCaptainComments) && (
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-2">Previous Comments:</p>
            <div className="space-y-2">
              {request.captainComments && (
                <div className="p-2 bg-blue-50 rounded border-l-4 border-blue-400">
                  <p className="text-xs font-medium text-blue-700">Team Captain:</p>
                  <p className="text-sm text-blue-900">{request.captainComments}</p>
                </div>
              )}
              {request.opposingCaptainComments && (
                <div className="p-2 bg-orange-50 rounded border-l-4 border-orange-400">
                  <p className="text-xs font-medium text-orange-700">Opposing Captain:</p>
                  <p className="text-sm text-orange-900">{request.opposingCaptainComments}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Commissioner Decision Section */}
        <div className="space-y-3 pt-4 border-t border-purple-200">
          <div className="flex items-center gap-2 text-purple-700">
            <Crown className="h-4 w-4" />
            <span className="text-sm font-medium">Final Commissioner Decision</span>
          </div>
          
          <div>
            <label className="text-sm font-medium text-muted-foreground">
              Commissioner Comments (required for denial, optional for approval):
            </label>
            <Textarea
              value={selectedRequest === request.id ? commissionerComments : ""}
              onChange={(e) => {
                setSelectedRequest(request.id);
                setCommissionerComments(e.target.value);
              }}
              placeholder="Add your final decision comments as league commissioner..."
              className="mt-1"
              data-testid={`textarea-commissioner-comments-${request.id}`}
            />
          </div>
          
          <div className="flex gap-2">
            <Button
              size="sm"
              className="flex-1 bg-green-600 hover:bg-green-700 text-white"
              onClick={() => handleApprove(request.id)}
              disabled={commissionerApprovalMutation.isPending || !isCommissioner}
              data-testid={`button-commissioner-approve-${request.id}`}
            >
              <CheckCircle className="h-3 w-3 mr-1" />
              Give Final Approval
            </Button>
            <Button
              size="sm"
              variant="destructive"
              className="flex-1"
              onClick={() => handleDeny(request.id)}
              disabled={commissionerApprovalMutation.isPending || !isCommissioner}
              data-testid={`button-commissioner-deny-${request.id}`}
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

  if (!isCommissioner) {
    return (
      <Card className={className}>
        <CardContent className="p-6 text-center">
          <Crown className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-medium mb-2">Commissioner Access Required</h3>
          <p className="text-muted-foreground">
            You need commissioner-level access to view and process final approvals.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Crown className="h-6 w-6 text-purple-600" />
          <div>
            <h1 className="text-2xl font-bold">Commissioner Approvals</h1>
            <p className="text-muted-foreground">
              Final review and approval of substitute requests
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
            <Crown className="h-5 w-5" />
            Requests Awaiting Commissioner Approval
          </CardTitle>
          <CardDescription>
            Final review stage for substitute requests that have passed captain approvals
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[600px]">
            <div className="space-y-4">
              {isLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <Card key={i} className="animate-pulse" data-testid={`loading-commissioner-${i}`}>
                      <CardContent className="p-4">
                        <div className="h-40 bg-muted rounded"></div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : pendingRequests.length > 0 ? (
                pendingRequests.map((request: any) => (
                  <RequestCard key={request.id} request={request} />
                ))
              ) : (
                <Card data-testid="empty-commissioner-approvals">
                  <CardContent className="p-8 text-center">
                    <Crown className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-medium mb-2">No Pending Final Approvals</h3>
                    <p className="text-muted-foreground">
                      There are no substitute requests awaiting your final commissioner approval.
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