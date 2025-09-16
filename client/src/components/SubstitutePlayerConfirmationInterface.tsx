import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle, XCircle, Clock, Users, Calendar, User, MapPin, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { format } from "date-fns";

// Component to show approval workflow status with real data
function ApprovalWorkflowStatus({ request }: { request: any }) {
  // The request status indicates which approval is currently needed
  const status = request.substitutionRequest?.status;
  
  // Define the approval workflow stages
  const workflowStages = [
    { key: 'opposing_captain', label: 'Opposing Captain', status: 'pending_opponent_approval' },
    { key: 'commissioner', label: 'League Commissioner', status: 'pending_commissioner_approval' },
    { key: 'substitute_player', label: 'Substitute Player (You)', status: 'pending_substitute_approval' },
  ];

  return (
    <div className="space-y-2">
      {workflowStages.map((stage) => {
        let icon, textClass, text;
        
        if (status === stage.status && stage.key === 'substitute_player') {
          // Current stage - awaiting substitute player confirmation
          icon = <Clock className="h-4 w-4 text-blue-600" />;
          textClass = "text-sm text-blue-700 font-medium";
          text = "Your Confirmation Required";
        } else if (status === stage.status) {
          // Current stage - awaiting other approver
          icon = <Clock className="h-4 w-4 text-orange-600" />;
          textClass = "text-sm text-orange-700";
          text = `Awaiting ${stage.label} Approval`;
        } else {
          // Check if this stage has been completed based on status progression
          const stageOrder = ['pending_opponent_approval', 'pending_commissioner_approval', 'pending_substitute_approval', 'approved'];
          const currentIndex = stageOrder.indexOf(status);
          const stageIndex = stageOrder.indexOf(stage.status);
          
          if (currentIndex > stageIndex || status === 'approved') {
            // Stage completed
            icon = <CheckCircle className="h-4 w-4 text-green-600" />;
            textClass = "text-sm text-green-700";
            text = `Approved by ${stage.label}`;
          } else {
            // Stage pending
            icon = <Clock className="h-4 w-4 text-gray-400" />;
            textClass = "text-sm text-gray-500";
            text = `Pending ${stage.label} Approval`;
          }
        }
        
        return (
          <div key={stage.key} className="flex items-center gap-2">
            {icon}
            <span className={textClass}>{text}</span>
          </div>
        );
      })}
      
      {status === 'approved' && (
        <div className="flex items-center gap-2">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <span className="text-sm text-green-700 font-medium">Fully Approved</span>
        </div>
      )}
      
      {status === 'denied' && (
        <div className="flex items-center gap-2">
          <XCircle className="h-4 w-4 text-red-600" />
          <span className="text-sm text-red-700 font-medium">Request Denied</span>
        </div>
      )}
    </div>
  );
}

interface SubstitutePlayerConfirmationInterfaceProps {
  className?: string;
}

export function SubstitutePlayerConfirmationInterface({ className }: SubstitutePlayerConfirmationInterfaceProps) {
  const [selectedRequest, setSelectedRequest] = useState<string | null>(null);
  const [confirmationComments, setConfirmationComments] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch current user
  const { data: currentUser } = useQuery({
    queryKey: ["/api/auth/user"],
  });

  // Check if user is authenticated
  const isAuthenticated = !!currentUser;

  // Fetch pending substitute player confirmations with detailed approval history
  const { data: pendingConfirmations = [], isLoading, error } = useQuery({
    queryKey: ["/api/substitute-requests/pending-approvals", "substitute_player"],
    queryFn: async () => {
      const response = await fetch("/api/substitute-requests/pending-approvals?approverType=substitute_player");
      if (!response.ok) {
        if (response.status === 403) {
          throw new Error('Authentication required');
        }
        throw new Error('Failed to fetch pending confirmations');
      }
      const data = await response.json();
      
      // For each pending confirmation, fetch the complete request details to get approval history
      const enrichedData = await Promise.all(data.map(async (request: any) => {
        try {
          const detailResponse = await fetch(`/api/substitute-requests/${request.substitutionRequest.id}`);
          if (detailResponse.ok) {
            const detailData = await detailResponse.json();
            // Merge the detailed approval history
            return {
              ...request,
              substitutionRequest: {
                ...request.substitutionRequest,
                approvals: detailData.approvals || []
              }
            };
          }
        } catch (e) {
          console.warn('Failed to fetch detailed approval history for request:', request.substitutionRequest.id);
        }
        return request;
      }));
      
      return enrichedData;
    },
    enabled: isAuthenticated,
  });

  // Substitute player confirmation mutation
  const confirmationMutation = useMutation({
    mutationFn: async ({ requestId, status, comments }: { 
      requestId: string; 
      status: string; 
      comments?: string;
    }) => {
      await apiRequest("POST", `/api/substitute-requests/${requestId}/approve`, {
        approverType: 'substitute_player',
        status,
        comments
      });
    },
    onSuccess: (_, { status }) => {
      toast({
        title: "Confirmation Processed",
        description: `You have ${status} the substitute request.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/substitute-requests/pending-approvals", "substitute_player"] });
      queryClient.invalidateQueries({ queryKey: ["/api/substitute-requests"] });
      setSelectedRequest(null);
      setConfirmationComments("");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to process confirmation. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleAccept = (requestId: string) => {
    confirmationMutation.mutate({ 
      requestId, 
      status: "approved", 
      comments: confirmationComments 
    });
  };

  const handleDecline = (requestId: string) => {
    if (!confirmationComments.trim()) {
      toast({
        title: "Comments Required",
        description: "Please provide a reason when declining a substitute assignment.",
        variant: "destructive",
      });
      return;
    }
    confirmationMutation.mutate({ 
      requestId, 
      status: "denied", 
      comments: confirmationComments 
    });
  };

  const ConfirmationCard = ({ request }: { request: any }) => (
    <Card 
      className={`transition-all hover:shadow-lg ${selectedRequest === request.id ? 'ring-2 ring-green-500' : ''} bg-gradient-to-r from-green-50 to-blue-50`}
      data-testid={`substitute-confirmation-card-${request.id}`}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <Badge className="bg-green-100 text-green-700">
              <Users className="h-3 w-3 mr-1" />
              Substitute Assignment
            </Badge>
          </div>
          <div className="text-xs text-muted-foreground">
            {format(new Date(request.createdAt), 'MMM d, h:mm a')}
          </div>
        </div>
        
        <CardTitle className="text-lg flex items-center gap-2">
          <MapPin className="h-5 w-5 text-green-600" />
          You've Been Requested as a Substitute!
        </CardTitle>
        
        <CardDescription className="flex items-center gap-2">
          <Calendar className="h-4 w-4" />
          {request.substitutionRequest?.game?.homeTeam?.name} vs {request.substitutionRequest?.game?.awayTeam?.name}
          <span className="mx-1">•</span>
          {format(new Date(request.substitutionRequest?.game?.scheduledAt), 'MMM d, yyyy h:mm a')}
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-5">
        {/* Game Information */}
        <div className="p-4 bg-white rounded-lg border border-green-200 shadow-sm">
          <h4 className="text-sm font-semibold text-green-800 mb-3">GAME DETAILS</h4>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Home Team</p>
              <p className="font-medium text-blue-900">
                {request.substitutionRequest?.game?.homeTeam?.name}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Away Team</p>
              <p className="font-medium text-red-900">
                {request.substitutionRequest?.game?.awayTeam?.name}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Date & Time</p>
              <p className="font-medium">
                {format(new Date(request.substitutionRequest?.game?.scheduledAt), 'EEEE, MMM d')}
              </p>
              <p className="text-sm text-muted-foreground">
                {format(new Date(request.substitutionRequest?.game?.scheduledAt), 'h:mm a')}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Location</p>
              <p className="font-medium">
                {request.substitutionRequest?.game?.location || 'TBD'}
              </p>
            </div>
          </div>
        </div>

        {/* Player You're Substituting For */}
        <div>
          <h4 className="text-sm font-semibold text-muted-foreground mb-3">PLAYER YOU'RE SUBSTITUTING FOR:</h4>
          <div className="flex items-center gap-4 p-3 bg-orange-50 rounded-lg border border-orange-200">
            <Avatar className="h-12 w-12">
              <AvatarImage src={request.substitutionRequest?.originalPlayer?.profileImageUrl} />
              <AvatarFallback className="text-sm bg-orange-200 text-orange-800">
                {request.substitutionRequest?.originalPlayer?.firstName?.[0]}{request.substitutionRequest?.originalPlayer?.lastName?.[0]}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="font-medium text-lg">
                {request.substitutionRequest?.originalPlayer?.firstName} {request.substitutionRequest?.originalPlayer?.lastName}
              </p>
              <p className="text-sm text-muted-foreground">{request.substitutionRequest?.originalPlayer?.email}</p>
              <p className="text-xs text-orange-700 font-medium">Unable to attend this game</p>
            </div>
          </div>
        </div>

        {/* Approval History */}
        <div>
          <h4 className="text-sm font-semibold text-muted-foreground mb-3">APPROVAL STATUS:</h4>
          <div className="space-y-2">
            {/* Show the approval workflow status based on current request status */}
            <ApprovalWorkflowStatus request={request} />
          </div>
        </div>

        {/* Requested By */}
        <div>
          <h4 className="text-sm font-semibold text-muted-foreground mb-2">REQUESTED BY:</h4>
          <div className="flex items-center gap-3 p-2 bg-muted/50 rounded-lg">
            <User className="h-4 w-4" />
            <div>
              <p className="text-sm font-medium">
                {request.substitutionRequest?.requestedByUser?.firstName} {request.substitutionRequest?.requestedByUser?.lastName}
              </p>
              <p className="text-xs text-muted-foreground">Team Captain</p>
            </div>
          </div>
        </div>

        {/* Additional Comments */}
        {request.substitutionRequest?.reason && (
          <div>
            <h4 className="text-sm font-semibold text-muted-foreground mb-2">ADDITIONAL INFORMATION:</h4>
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="text-sm">{request.substitutionRequest.reason}</p>
            </div>
          </div>
        )}

        {/* Confirmation Section */}
        <Separator />
        <div className="space-y-4 pt-2">
          <div className="flex items-center gap-2 text-green-700">
            <AlertCircle className="h-5 w-5" />
            <span className="font-semibold">Your Response Required</span>
          </div>
          
          <div>
            <label className="text-sm font-medium text-muted-foreground">
              Comments (required for declining, optional for accepting):
            </label>
            <Textarea
              value={selectedRequest === request.id ? confirmationComments : ""}
              onChange={(e) => {
                setSelectedRequest(request.id);
                setConfirmationComments(e.target.value);
              }}
              placeholder="Add any comments about your availability or concerns..."
              className="mt-1"
              data-testid={`textarea-confirmation-comments-${request.id}`}
            />
          </div>
          
          <div className="flex gap-3">
            <Button
              size="lg"
              className="flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold py-3"
              onClick={() => handleAccept(request.id)}
              disabled={confirmationMutation.isPending || !isAuthenticated}
              data-testid={`button-accept-${request.id}`}
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              Accept Assignment
            </Button>
            <Button
              size="lg"
              variant="destructive"
              className="flex-1 font-semibold py-3"
              onClick={() => handleDecline(request.id)}
              disabled={confirmationMutation.isPending || !isAuthenticated}
              data-testid={`button-decline-${request.id}`}
            >
              <XCircle className="h-4 w-4 mr-2" />
              Decline Assignment
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  if (!currentUser) {
    return (
      <Card className={className} data-testid="loading-substitute-confirmation">
        <CardContent className="p-6 text-center">
          <div className="text-muted-foreground">Loading user information...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="flex items-center justify-center gap-3 mb-4">
          <Users className="h-8 w-8 text-green-600" />
          <h1 className="text-3xl font-bold text-green-800">Substitute Confirmations</h1>
        </div>
        <p className="text-muted-foreground text-lg">
          Review and confirm your substitute player assignments
        </p>
        <Badge variant="secondary" className="text-lg px-4 py-2">
          {pendingConfirmations.length} Pending Confirmation{pendingConfirmations.length !== 1 ? 's' : ''}
        </Badge>
      </div>

      {/* Pending Confirmations */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-green-700">
            <Clock className="h-5 w-5" />
            Assignments Awaiting Your Confirmation
          </CardTitle>
          <CardDescription>
            These substitute requests have been approved by all parties and need your final confirmation
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[700px]">
            <div className="space-y-6">
              {isLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <Card key={i} className="animate-pulse" data-testid={`loading-confirmation-${i}`}>
                      <CardContent className="p-6">
                        <div className="h-40 bg-muted rounded"></div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : pendingConfirmations.length > 0 ? (
                pendingConfirmations.map((request: any) => (
                  <ConfirmationCard key={request.id} request={request} />
                ))
              ) : (
                <Card data-testid="empty-substitute-confirmations">
                  <CardContent className="p-8 text-center">
                    <Users className="h-20 w-20 text-muted-foreground mx-auto mb-6" />
                    <h3 className="text-xl font-medium mb-3">No Pending Confirmations</h3>
                    <p className="text-muted-foreground text-lg">
                      You don't have any substitute assignments waiting for confirmation.
                    </p>
                    <p className="text-sm text-muted-foreground mt-2">
                      When teams need substitute players, confirmation requests will appear here.
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