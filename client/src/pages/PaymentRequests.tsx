import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { setPageTransitionDirection } from '@/components/PageTransition';
import { ArrowLeft, DollarSign, Plus, Users, Calendar, CheckCircle, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { format } from 'date-fns';
import { apiRequest } from '@/lib/queryClient';

export default function PaymentRequests() {
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<'created' | 'received'>('created');

  // Fetch unpaid count for badge
  const { data: unpaidCount } = useQuery({
    queryKey: ['/api/payment-requests/unpaid-count'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/payment-requests/unpaid-count');
      return response.json();
    },
    refetchInterval: 30000, // Check every 30 seconds
  });

  // Fetch payment requests created by the user
  const { data: createdRequests = [], isLoading: createdLoading } = useQuery({
    queryKey: ['/api/payment-requests/created/by-me'],
  });

  // Fetch payment requests where the user is a recipient
  const { data: receivedRequests = [], isLoading: receivedLoading } = useQuery({
    queryKey: ['/api/payment-requests/received/by-me'],
  });

  const createdRequestsArray = createdRequests as any[];
  const receivedRequestsArray = receivedRequests as any[];

  const getPaymentStatus = (request: any, isCreator: boolean) => {
    if (isCreator) {
      const totalRecipients = request.recipients?.length || 0;
      const paidCount = request.recipients?.filter((r: any) => r.isPaid).length || 0;
      return {
        status: paidCount === totalRecipients ? 'complete' : 'pending',
        label: `${paidCount}/${totalRecipients} paid`,
      };
    } else {
      const myRecipient = request.recipients?.find((r: any) => r.user?.id === (request as any).recipientId);
      return {
        status: myRecipient?.isPaid ? 'paid' : 'unpaid',
        label: myRecipient?.isPaid ? 'Paid' : 'Unpaid',
      };
    }
  };

  const PaymentRequestCard = ({ request, isCreator }: { request: any; isCreator: boolean }) => {
    const status = getPaymentStatus(request, isCreator);
    const deadline = request.deadline ? new Date(request.deadline) : null;
    const isOverdue = deadline && deadline < new Date();

    return (
      <div
        className="bg-card rounded-lg border border-border p-4 cursor-pointer hover:border-primary transition-colors"
        onClick={() => {
          setPageTransitionDirection('up');
          navigate(`/payment-requests/${request.id}`);
        }}
        data-testid={`payment-request-card-${request.id}`}
      >
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1">
            <h3 className="font-semibold mb-1" data-testid={`text-request-title-${request.id}`}>
              {request.title}
            </h3>
            <p className="text-sm text-muted-foreground line-clamp-2">
              {request.description || 'No description'}
            </p>
          </div>
          <div className="text-right ml-4">
            <p className="text-lg font-bold text-primary" data-testid={`text-request-amount-${request.id}`}>
              ${request.amountPerPerson}
            </p>
            <p className="text-xs text-muted-foreground">per person</p>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {isCreator ? (
              <div className="flex items-center gap-2">
                <Avatar className="w-6 h-6">
                  <AvatarImage src={request.creator?.profileImageUrl} />
                  <AvatarFallback className="text-xs">
                    {request.creator?.firstName?.[0]}
                  </AvatarFallback>
                </Avatar>
                <span className="text-sm text-muted-foreground">
                  {request.recipients?.length} recipient{request.recipients?.length !== 1 ? 's' : ''}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Avatar className="w-6 h-6">
                  <AvatarImage src={request.creator?.profileImageUrl} />
                  <AvatarFallback className="text-xs">
                    {request.creator?.firstName?.[0]}
                  </AvatarFallback>
                </Avatar>
                <span className="text-sm text-muted-foreground">
                  {request.creator?.firstName} {request.creator?.lastName}
                </span>
              </div>
            )}

            {deadline && (
              <div className={`flex items-center gap-1 text-xs ${isOverdue ? 'text-destructive' : 'text-muted-foreground'}`}>
                <Calendar className="w-3 h-3" />
                <span>Due {format(deadline, 'MMM d')}</span>
              </div>
            )}
          </div>

          <div className={`flex items-center gap-1 text-sm font-medium ${
            status.status === 'complete' || status.status === 'paid' 
              ? 'text-green-600' 
              : 'text-orange-600'
          }`}>
            {status.status === 'complete' || status.status === 'paid' ? (
              <CheckCircle className="w-4 h-4" />
            ) : (
              <Clock className="w-4 h-4" />
            )}
            <span>{status.label}</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen flex flex-col pb-24" data-testid="payment-requests-page">
      {/* Header */}
      <div className="p-6 pt-12">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => {
                setPageTransitionDirection('down');
                navigate('/more');
              }}
              className="text-muted-foreground"
              data-testid="button-back"
            >
              <ArrowLeft className="w-6 h-6" />
            </button>
            <div>
              <h1 className="text-2xl font-bold" data-testid="text-page-title">Payment Requests</h1>
              <p className="text-sm text-muted-foreground">Manage your payments</p>
            </div>
          </div>

          <Button
            onClick={() => {
              setPageTransitionDirection('up');
              navigate('/create-payment-request');
            }}
            size="sm"
            data-testid="button-create-payment-request"
          >
            <Plus className="w-4 h-4 mr-1" />
            Create
          </Button>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'created' | 'received')}>
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="created" data-testid="tab-created">
              <DollarSign className="w-4 h-4 mr-2" />
              Created by Me
            </TabsTrigger>
            <TabsTrigger value="received" data-testid="tab-received" className="relative">
              <Users className="w-4 h-4 mr-2" />
              Requests for Me
              {unpaidCount && unpaidCount.count > 0 && (
                <span className="ml-2 inline-flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-red-500 rounded-full">
                  {unpaidCount.count}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="created" className="space-y-3">
            {createdLoading ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground">Loading...</p>
              </div>
            ) : createdRequestsArray.length === 0 ? (
              <div className="text-center py-12">
                <DollarSign className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground mb-4">You haven't created any payment requests yet.</p>
                <Button
                  onClick={() => {
                    setPageTransitionDirection('up');
                    navigate('/create-payment-request');
                  }}
                  data-testid="button-create-first-request"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Create Your First Request
                </Button>
              </div>
            ) : (
              createdRequestsArray.map((request: any) => (
                <PaymentRequestCard key={request.id} request={request} isCreator={true} />
              ))
            )}
          </TabsContent>

          <TabsContent value="received" className="space-y-3">
            {receivedLoading ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground">Loading...</p>
              </div>
            ) : receivedRequestsArray.length === 0 ? (
              <div className="text-center py-12">
                <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">You don't have any payment requests at the moment.</p>
              </div>
            ) : (
              receivedRequestsArray.map((request: any) => (
                <PaymentRequestCard key={request.id} request={request} isCreator={false} />
              ))
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
