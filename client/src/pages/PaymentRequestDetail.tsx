import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useParams } from 'wouter';
import { setPageTransitionDirection } from '@/components/PageTransition';
import { ArrowLeft, DollarSign, Calendar, AlertCircle, CheckCircle2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format } from 'date-fns';
import { apiRequest, getImageUrl } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';

export default function PaymentRequestDetail() {
  const { id } = useParams();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const { data: paymentRequest, isLoading } = useQuery({
    queryKey: [`/api/payment-requests/${id}`],
    enabled: !!id,
  });

  const updateRecipientMutation = useMutation({
    mutationFn: async ({ recipientId, isPaid, paymentMethod }: { recipientId: string; isPaid: boolean; paymentMethod?: string }) => {
      const response = await apiRequest('PATCH', `/api/payment-request-recipients/${recipientId}`, {
        isPaid,
        paymentMethod,
      });
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'Payment status updated' });
      queryClient.invalidateQueries({ queryKey: [`/api/payment-requests/${id}`] });
      queryClient.invalidateQueries({ queryKey: ['/api/payment-requests/created/by-me'] });
      queryClient.invalidateQueries({ queryKey: ['/api/payment-requests/received/by-me'] });
    },
    onError: () => {
      toast({ title: 'Failed to update payment status', variant: 'destructive' });
    },
  });

  const confirmRecipientMutation = useMutation({
    mutationFn: async ({ recipientId, isConfirmed }: { recipientId: string; isConfirmed: boolean }) => {
      const response = await apiRequest('PATCH', `/api/payment-request-recipients/${recipientId}/confirm`, {
        isConfirmed,
      });
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'Payment confirmation updated' });
      queryClient.invalidateQueries({ queryKey: [`/api/payment-requests/${id}`] });
      queryClient.invalidateQueries({ queryKey: ['/api/payment-requests/created/by-me'] });
    },
    onError: () => {
      toast({ title: 'Failed to update confirmation', variant: 'destructive' });
    },
  });

  const deletePaymentRequestMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('DELETE', `/api/payment-requests/${id}`);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'Payment request deleted' });
      queryClient.invalidateQueries({ queryKey: ['/api/payment-requests/created/by-me'] });
      queryClient.invalidateQueries({ queryKey: ['/api/payment-requests/received/by-me'] });
      setPageTransitionDirection('down');
      navigate('/payment-requests');
    },
    onError: () => {
      toast({ title: 'Failed to delete payment request', variant: 'destructive' });
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!paymentRequest) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Payment request not found</p>
      </div>
    );
  }

  const request = paymentRequest as any;
  const isCreator = request.creatorId === (user as any)?.id;
  const myRecipient = request.recipients?.find((r: any) => r.userId === (user as any)?.id);
  const totalRecipients = request.recipients?.length || 0;
  const paidCount = request.recipients?.filter((r: any) => r.isPaid).length || 0;
  const deadline = request.deadline ? new Date(request.deadline) : null;
  const isOverdue = deadline && deadline < new Date();

  return (
    <div className="min-h-screen flex flex-col pb-24" data-testid="payment-request-detail-page">
      {/* Header */}
      <div className="p-6 pt-12">
        <div className="flex items-center justify-between mb-6">
          <button 
            onClick={() => {
              setPageTransitionDirection('down');
              navigate('/payment-requests');
            }}
            className="text-muted-foreground"
            data-testid="button-back"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>

          {isCreator && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" data-testid="button-delete">
                  <Trash2 className="w-4 h-4 mr-1" />
                  Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Payment Request</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete this payment request? This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => deletePaymentRequestMutation.mutate()}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>

        {/* Payment Details Card */}
        <div className="bg-card rounded-xl border border-[hsl(var(--hairline))] shadow-[var(--elev-rest)] p-6 mb-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1">
              <h1 className="text-2xl font-bold mb-2" data-testid="text-request-title">{request.title}</h1>
              {request.description && (
                <p className="text-muted-foreground mb-4">{request.description}</p>
              )}
            </div>
            <div className="text-right ml-4">
              <p className="text-3xl font-bold text-primary" data-testid="text-request-amount">
                ${request.amountPerPerson}
              </p>
              <p className="text-sm text-muted-foreground">per person</p>
            </div>
          </div>

          <div className="flex items-center gap-4 mb-4">
            <div className="flex items-center gap-2">
              <Avatar className="w-8 h-8">
                <AvatarImage src={getImageUrl(request.creator?.profileImageUrl) || ''} />
                <AvatarFallback>
                  {request.creator?.firstName?.[0]}{request.creator?.lastName?.[0]}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="text-sm font-medium">Created by</p>
                <p className="text-sm text-muted-foreground">
                  {request.creator?.firstName} {request.creator?.lastName}
                </p>
              </div>
            </div>

            {deadline && (
              <div className={`flex items-center gap-2 ${isOverdue ? 'text-destructive' : 'text-muted-foreground'}`}>
                <Calendar className="w-4 h-4" />
                <div>
                  <p className="text-sm font-medium">Deadline</p>
                  <p className="text-sm">{format(deadline, 'MMM d, yyyy')}</p>
                </div>
              </div>
            )}
          </div>

          {/* Progress Bar */}
          <div className="mb-4">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-muted-foreground">Payment Progress</span>
              <span className="font-medium">{paidCount}/{totalRecipients} paid</span>
            </div>
            <div className="w-full bg-muted rounded-full h-2">
              <div 
                className="bg-green-600 h-2 rounded-full transition-all"
                style={{ width: `${totalRecipients > 0 ? (paidCount / totalRecipients) * 100 : 0}%` }}
              />
            </div>
          </div>

          {isOverdue && !myRecipient?.isPaid && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                This payment request is overdue. Please submit your payment as soon as possible.
              </AlertDescription>
            </Alert>
          )}
        </div>

        {/* Recipients List */}
        <div className="bg-card rounded-xl border border-[hsl(var(--hairline))] shadow-[var(--elev-rest)] p-6">
          <h2 className="text-lg font-semibold mb-4" data-testid="text-recipients-title">
            Recipients ({totalRecipients})
          </h2>

          <div className="space-y-3">
            {request.recipients?.map((recipient: any) => {
              const isMe = recipient.userId === (user as any)?.id;
              const canUpdate = isCreator || isMe;

              return (
                <div
                  key={recipient.id}
                  className="flex items-center justify-between p-3 rounded-lg border border-border"
                  data-testid={`recipient-${recipient.id}`}
                >
                  <div className="flex items-center gap-3">
                    <Avatar className="w-10 h-10">
                      <AvatarImage src={getImageUrl(recipient.user?.profileImageUrl) || ''} />
                      <AvatarFallback>
                        {(recipient.user?.firstName || recipient.placeholderPlayer?.firstName)?.[0]}
                        {(recipient.user?.lastName || recipient.placeholderPlayer?.lastName)?.[0]}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium">
                        {recipient.user
                          ? `${recipient.user.firstName ?? ''} ${recipient.user.lastName ?? ''}`.trim()
                          : recipient.placeholderPlayer
                            ? `${recipient.placeholderPlayer.firstName} ${recipient.placeholderPlayer.lastName}`
                            : 'Unknown'}
                        {!recipient.user && recipient.placeholderPlayer && (
                          <span className="text-xs text-muted-foreground ml-2">(Placeholder)</span>
                        )}
                        {isMe && <span className="text-xs text-muted-foreground ml-2">(You)</span>}
                      </p>
                      {(recipient.user?.venmoUsername || recipient.user?.cashappUsername) && (
                        <p className="text-xs text-muted-foreground">
                          {recipient.user?.venmoUsername && (
                            <>
                              Venmo:{' '}
                              <a
                                href={`https://venmo.com/${recipient.user.venmoUsername.replace(/^@/, '')}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary hover:underline"
                                data-testid={`link-venmo-${recipient.id}`}
                              >
                                {recipient.user.venmoUsername}
                              </a>
                            </>
                          )}
                          {recipient.user?.venmoUsername && recipient.user?.cashappUsername && ' • '}
                          {recipient.user?.cashappUsername && (
                            <>
                              CashApp:{' '}
                              <a
                                href={`https://cash.app/$${recipient.user.cashappUsername.replace(/^\$/, '')}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary hover:underline"
                                data-testid={`link-cashapp-${recipient.id}`}
                              >
                                {recipient.user.cashappUsername}
                              </a>
                            </>
                          )}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {recipient.isPaid ? (
                      <div className="flex flex-col items-end gap-1">
                        <div className="flex items-center gap-2 text-green-600">
                          <CheckCircle2 className="w-5 h-5" />
                          <span className="text-sm font-medium">Paid</span>
                          {recipient.paymentMethod && (
                            <span className="text-xs text-muted-foreground">({recipient.paymentMethod})</span>
                          )}
                        </div>
                        {isCreator && (
                          recipient.isConfirmed ? (
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-green-600 font-medium">✓ Confirmed</span>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2 text-xs"
                                onClick={() => confirmRecipientMutation.mutate({ recipientId: recipient.id, isConfirmed: false })}
                                data-testid={`button-unconfirm-${recipient.id}`}
                              >
                                Unconfirm
                              </Button>
                            </div>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-6 px-2 text-xs"
                              onClick={() => confirmRecipientMutation.mutate({ recipientId: recipient.id, isConfirmed: true })}
                              data-testid={`button-confirm-${recipient.id}`}
                            >
                              Confirm Payment
                            </Button>
                          )
                        )}
                      </div>
                    ) : canUpdate ? (
                      <div className="flex items-center gap-2">
                        <Select
                          onValueChange={(method) => {
                            updateRecipientMutation.mutate({
                              recipientId: recipient.id,
                              isPaid: true,
                              paymentMethod: method,
                            });
                          }}
                        >
                          <SelectTrigger className="w-[140px]" data-testid={`select-payment-method-${recipient.id}`}>
                            <SelectValue placeholder="Mark Paid" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="venmo">Venmo</SelectItem>
                            <SelectItem value="cashapp">CashApp</SelectItem>
                            <SelectItem value="cash">Cash</SelectItem>
                            <SelectItem value="other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    ) : (
                      <span className="text-sm text-orange-600 font-medium">Pending</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
