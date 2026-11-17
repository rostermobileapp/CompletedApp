import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, CreditCard, Download, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { apiRequest, getAuthHeaders } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const ADMIN_EMAIL = 'tobin@rosterhockey.com';
const cents = (value: unknown) => `$${(Number(value ?? 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function AdminOrganizerCardPayments() {
  const [, navigate] = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [eventType, setEventType] = useState('all');
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    if (!authLoading && user?.email !== ADMIN_EMAIL) navigate('/');
  }, [authLoading, user, navigate]);

  const query = new URLSearchParams();
  if (from) query.set('from', from);
  if (to) query.set('to', to);
  query.set('eventType', eventType);
  const queryString = query.toString();
  const { data, isLoading, error } = useQuery<any>({
    queryKey: ['/api/admin/organizer-card-payments/report', from, to, eventType],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/admin/organizer-card-payments/report?${queryString}`);
      return response.json();
    },
    enabled: !authLoading && user?.email === ADMIN_EMAIL,
  });

  const exportCsv = async () => {
    setIsExporting(true);
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`/api/admin/organizer-card-payments/report?${queryString}&format=csv`, { headers });
      if (!response.ok) throw new Error('Could not export the report.');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'organizer-card-payments.csv';
      link.click();
      URL.revokeObjectURL(url);
    } catch (exportError: any) {
      console.error('[OrganizerCardPaymentReport] Export failed:', exportError);
    } finally {
      setIsExporting(false);
    }
  };

  if (authLoading || user?.email !== ADMIN_EMAIL) return null;

  const summary = data?.summary ?? {};
  const payments: any[] = data?.payments ?? [];
  const metricCards = [
    ['Gross volume', cents(summary.gross_volume_cents)],
    ['Service fees', cents(summary.service_fees_cents)],
    ['Stripe processing costs', cents(summary.processing_fees_cents)],
    ['Organizer transfers', cents(summary.organizer_transfers_cents)],
    ['Refunds', cents(summary.refunds_cents)],
    ['Transfer reversals', cents(summary.transfer_reversals_cents)],
    ['Disputes', `${Number(summary.disputes_count ?? 0)} · ${cents(summary.disputed_cents)}`],
  ];

  return (
    <main className="min-h-screen bg-background pb-24">
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/admin/metrics')} aria-label="Back to app statistics">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="rounded-xl bg-primary/10 p-2.5 text-primary"><CreditCard className="h-6 w-6" /></div>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold">Organizer card payments</h1>
            <p className="text-sm text-muted-foreground">Founder-only settlement, fees, refunds, and disputes report</p>
          </div>
          <Button variant="outline" onClick={exportCsv} disabled={isExporting || isLoading || !!error}>
            {isExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            Export CSV
          </Button>
        </div>

        <section className="grid gap-4 rounded-xl border border-[hsl(var(--hairline))] bg-card p-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="report-from">From</Label>
            <Input id="report-from" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="report-to">Through</Label>
            <Input id="report-to" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Payment type</Label>
            <Select value={eventType} onValueChange={setEventType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All payments</SelectItem>
                <SelectItem value="scrimmage">Scrimmages</SelectItem>
                <SelectItem value="league_fee">League fees</SelectItem>
                <SelectItem value="message">Messages</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </section>

        {isLoading ? (
          <div className="py-16 text-center text-sm text-muted-foreground">Loading payment report…</div>
        ) : error ? (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 text-sm text-muted-foreground">
            {(error as Error).message || 'The report is unavailable in this environment. It is enabled only for the isolated payment test environment or an explicitly configured production release.'}
          </div>
        ) : (
          <>
            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {metricCards.map(([label, value]) => (
                <div key={label} className="rounded-xl border border-[hsl(var(--hairline))] bg-card p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
                  <p className="mt-1 text-xl font-semibold">{value}</p>
                </div>
              ))}
            </section>

            <section className="overflow-hidden rounded-xl border border-[hsl(var(--hairline))] bg-card">
              <div className="border-b border-[hsl(var(--hairline))] p-4">
                <h2 className="font-semibold">Transactions</h2>
                <p className="text-xs text-muted-foreground">{payments.length} rows (maximum 5,000 per export)</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1050px] text-left text-sm">
                  <thead className="bg-muted/40 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2">Date</th>
                      <th className="px-3 py-2">Type / invoice</th>
                      <th className="px-3 py-2">Organizer</th>
                      <th className="px-3 py-2">Payer</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2 text-right">Gross</th>
                      <th className="px-3 py-2 text-right">Service fee</th>
                      <th className="px-3 py-2 text-right">Stripe cost</th>
                      <th className="px-3 py-2 text-right">Transfer / reversal</th>
                      <th className="px-3 py-2">Refund / dispute</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((payment) => (
                      <tr key={payment.id} className="border-t border-[hsl(var(--hairline))] align-top">
                        <td className="whitespace-nowrap px-3 py-3">{new Date(payment.created_at).toLocaleString()}</td>
                        <td className="max-w-56 px-3 py-3">
                          <div className="capitalize">{payment.event_type.replace('_', ' ')}</div>
                          <div className="truncate text-xs text-muted-foreground" title={payment.title}>{payment.title}</div>
                          <div className="font-mono text-[10px] text-muted-foreground">{payment.id}</div>
                        </td>
                        <td className="px-3 py-3">{payment.organizer_display_id || payment.organizer_user_id}</td>
                        <td className="px-3 py-3">{payment.payer_display_id || payment.payer_user_id}</td>
                        <td className="px-3 py-3">
                          <div className="capitalize">{String(payment.status).replace('_', ' ')}</div>
                          {payment.dispute_status && <div className="text-xs text-amber-700 dark:text-amber-300">Dispute: {payment.dispute_status}</div>}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-right">{cents(payment.total_amount_cents)}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-right">{cents(payment.service_fee_cents)}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-right">{cents(payment.stripe_processing_fee_cents)}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-right">
                          {cents(Number(payment.transfer_amount_cents ?? payment.base_amount_cents) - Number(payment.transfer_reversed_cents ?? 0))}
                        </td>
                        <td className="px-3 py-3 text-xs">
                          {payment.refund_status && <div>Refund: {payment.refund_status}</div>}
                          {payment.refunded_at && <div>{new Date(payment.refunded_at).toLocaleDateString()}</div>}
                        </td>
                      </tr>
                    ))}
                    {payments.length === 0 && (
                      <tr><td colSpan={10} className="px-4 py-10 text-center text-muted-foreground">No card payments match these filters.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
