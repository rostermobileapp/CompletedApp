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
      className={`transition-all hover:shadow-md bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800 ${selectedRequest === request.id ? 'ring-2 ring-red-500' : ''}`}
      data-testid={`commissioner-approval-card-${request.id}`}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <Badge className="bg-[#000000] text-[#ffffff]">
              <Clock className="h-3 w-3 mr-1" />
              Final Approval Required
            </Badge>
            {request.opposingCaptainApproved && (
              <Badge className="bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                <CheckCircle className="h-3 w-3 mr-1" />
                Captain Approved
              </Badge>
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            {format(new Date(request.createdAt), 'MMM d, h:mm a')}
          </div>
        </div>
        
        <CardTitle className="text-base flex items-center gap-2 text-red-700 dark:text-red-400">
          <Crown className="h-4 w-4" />
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
        <div className="p-3 bg-white dark:bg-red-900 rounded-lg border border-red-200 dark:border-red-700">
          <p className="text-xs font-medium text-red-800 dark:text-red-300 mb-3">APPROVAL PROGRESS:</p>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-gray-600 dark:text-gray-400" />
              <span className="text-sm text-gray-700 dark:text-gray-300">Team Captain Approved</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-gray-600 dark:text-gray-400" />
              <span className="text-sm text-gray-700 dark:text-gray-300">Opposing Captain Approved</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-red-600" />
              <span className="text-sm text-red-700 dark:text-red-400 font-medium">Commissioner Approval (FINAL)</span>
            </div>
          </div>
        </div>

        {/* Teams Information */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 bg-white dark:bg-red-900 rounded-lg border border-red-200 dark:border-red-700">
            <p className="text-xs font-medium text-red-800 dark:text-red-300 mb-2">REQUESTING TEAM:</p>
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 bg-[#000000] rounded-full flex items-center justify-center">
                <Users className="h-3 w-3 text-white" />
              </div>
              <span className="text-sm font-medium text-red-900 dark:text-red-200">
                {request.requestingTeam?.name || 'Unknown Team'}
              </span>
            </div>
          </div>
          <div className="p-3 bg-white dark:bg-red-900 rounded-lg border border-red-200 dark:border-red-700">
            <p className="text-xs font-medium text-red-800 dark:text-red-300 mb-2">OPPOSING TEAM:</p>
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 bg-[#000000] rounded-full flex items-center justify-center">
                <Shield className="h-3 w-3 text-white" />
              </div>
              <span className="text-sm font-medium text-red-900 dark:text-red-200">
                {request.opposingTeam?.name || 'Unknown Team'}
              </span>
            </div>
          </div>
        </div>

        {/* Player Information */}
        <div>
          <p className="text-sm font-medium text-muted-foreground mb-2">Player Substitution:</p>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 p-2 bg-red-100 dark:bg-red-900 rounded-lg flex-1 border border-red-200 dark:border-red-700">
              <Avatar className="h-8 w-8">
                <AvatarImage src={request.originalPlayer?.profileImageUrl} />
                <AvatarFallback className="text-xs bg-red-200 dark:bg-red-800 text-red-800 dark:text-red-200">
                  {request.originalPlayer?.firstName?.[0]}{request.originalPlayer?.lastName?.[0]}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="text-sm font-medium">
                  {request.originalPlayer?.firstName} {request.originalPlayer?.lastName}
                </p>
                <p className="text-xs text-red-600 dark:text-red-400">Unable to attend</p>
              </div>
            </div>
            
            {request.substitutePlayer && (
              <>
                <div className="text-muted-foreground">→</div>
                <div className="flex items-center gap-2 p-2 bg-white dark:bg-red-900 rounded-lg flex-1 border border-red-200 dark:border-red-700">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={request.substitutePlayer?.profileImageUrl} />
                    <AvatarFallback className="text-xs bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200">
                      {request.substitutePlayer?.firstName?.[0]}{request.substitutePlayer?.lastName?.[0]}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-medium">
                      {request.substitutePlayer?.firstName} {request.substitutePlayer?.lastName}
                    </p>
                    <p className="text-xs text-muted-foreground">Substitute player</p>
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
                <div className="p-2 bg-red-50 dark:bg-red-900 rounded border-l-4 border-red-400 dark:border-red-600">
                  <p className="text-xs font-medium text-red-700 dark:text-red-300">Team Captain:</p>
                  <p className="text-sm text-red-900 dark:text-red-200">{request.captainComments}</p>
                </div>
              )}
              {request.opposingCaptainComments && (
                <div className="p-2 bg-red-50 dark:bg-red-900 rounded border-l-4 border-red-400 dark:border-red-600">
                  <p className="text-xs font-medium text-red-700 dark:text-red-300">Opposing Captain:</p>
                  <p className="text-sm text-red-900 dark:text-red-200">{request.opposingCaptainComments}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Commissioner Decision Section */}
        <div className="space-y-3 pt-4 border-t border-red-200 dark:border-red-700">
          <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
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
              className="flex-1 bg-[#000000] hover:bg-[#000000] hover:opacity-90 text-[#fcfcfc]"
              onClick={() => handleApprove(request.id)}
              disabled={commissionerApprovalMutation.isPending || !isCommissioner}
              data-testid={`button-commissioner-approve-${request.id}`}
            >
              <CheckCircle className="h-3 w-3 mr-1" />
              Give Final Approval
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="flex-1 border-red-300 dark:border-red-700 text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900"
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
          <Crown className="h-6 w-6 text-red-600 dark:text-red-400" />
          <div>
            <h1 className="text-2xl font-bold text-red-800 dark:text-red-400">Commissioner Approvals</h1>
            <p className="text-muted-foreground">
              Final review and approval of substitute requests
            </p>
          </div>
        </div>
        <Badge className="text-lg px-3 py-1 bg-[#000000] text-[#ffffff]">
          {pendingRequests.length} Pending
        </Badge>
      </div>

      {/* Pending Requests */}
      <Card className="bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-700 dark:text-red-400">
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