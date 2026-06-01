import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Cell,
  Tooltip,
  ResponsiveContainer,
  LabelList,
} from 'recharts';
import { TrendingUp, TrendingDown, Users, DollarSign, BarChart2, Handshake } from 'lucide-react';

const ADMIN_EMAIL = 'founder@rosterhockey.com';

function fmt(n: number) {
  return n.toLocaleString();
}

function fmtDollars(cents: number) {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function MomBadge({ current, previous, label }: { current: number; previous: number; label: string }) {
  if (previous === 0) {
    return <Badge variant="outline" className="text-xs">{label}: N/A</Badge>;
  }
  const diff = current - previous;
  const pct = ((diff / previous) * 100).toFixed(1);
  const positive = diff >= 0;
  return (
    <Badge
      className={`text-xs flex items-center gap-1 ${
        positive
          ? 'bg-green-500/20 text-green-600 dark:text-green-400 border-green-500/30'
          : 'bg-red-500/20 text-red-600 dark:text-red-400 border-red-500/30'
      }`}
      variant="outline"
    >
      {positive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {positive ? '+' : ''}{pct}% MoM {label}
    </Badge>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card className="elev-rest">
      <CardContent className="pt-4 pb-4">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">{label}</p>
        <p className="text-2xl font-bold">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function SkeletonCard() {
  return (
    <Card className="elev-rest">
      <CardContent className="pt-4 pb-4">
        <Skeleton className="h-3 w-24 mb-2" />
        <Skeleton className="h-8 w-20" />
      </CardContent>
    </Card>
  );
}

const SOURCE_COLORS: Record<string, string> = {
  Stripe: '#6366f1',
  Apple: '#22c55e',
  Google: '#f59e0b',
};

export default function AdminMetrics() {
  const [, navigate] = useLocation();
  const { user: authUser, isLoading: authLoading } = useAuth();

  useEffect(() => {
    if (!authLoading && authUser?.email !== ADMIN_EMAIL) {
      navigate('/');
    }
  }, [authLoading, authUser, navigate]);

  const { data, isLoading, isError } = useQuery<any>({
    queryKey: ['/api/admin/metrics'],
    enabled: !authLoading && authUser?.email === ADMIN_EMAIL,
    staleTime: 60_000,
  });

  // Full-page skeleton while auth is resolving
  if (authLoading) {
    return (
      <div className="min-h-screen bg-background pb-24">
        <div className="max-w-4xl mx-auto px-4 py-6 space-y-8">
          <div className="flex items-center gap-3">
            <Skeleton className="w-11 h-11 rounded-xl" />
            <div className="space-y-2">
              <Skeleton className="h-7 w-40" />
              <Skeleton className="h-4 w-56" />
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        </div>
      </div>
    );
  }

  // Not the founder — redirect in-flight; render nothing while navigating
  if (authUser?.email !== ADMIN_EMAIL) {
    return null;
  }

  const overview = data?.overview;
  const revenue = data?.revenue;
  const partners: any[] = data?.partners ?? [];

  const totalCommission = partners.reduce((s: number, p: any) => s + (p.commissionDueCents ?? 0), 0);
  const totalSignups = partners.reduce((s: number, p: any) => s + (p.attributedSignups ?? 0), 0);

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-8">

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary/10">
            <BarChart2 className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">App Statistics</h1>
            <p className="text-sm text-muted-foreground">Live data · founder access only</p>
          </div>
        </div>

        {/* ── Overview ─────────────────────────────────────────────────── */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Users className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-base font-semibold">Overview</h2>
            {!isLoading && overview && (
              <MomBadge
                current={overview.signupsThisMonth}
                previous={overview.signupsLastMonth}
                label="signups"
              />
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)
            ) : isError ? (
              <p className="col-span-full text-sm text-destructive">Failed to load overview data.</p>
            ) : (
              <>
                <StatCard label="Total Users" value={fmt(overview.totalUsers)} />
                <StatCard label="DAU" value={fmt(overview.dau)} sub="last 24 h" />
                <StatCard label="WAU" value={fmt(overview.wau)} sub="last 7 days" />
                <StatCard label="MAU" value={fmt(overview.mau)} sub="last 30 days" />
                <StatCard
                  label="WAU : MAU Stickiness"
                  value={overview.wauMauRatio.toFixed(2)}
                  sub="WAU ÷ MAU"
                />
                <StatCard
                  label="Signups This Month"
                  value={fmt(overview.signupsThisMonth)}
                  sub={`${fmt(overview.signupsLastMonth)} last month`}
                />
              </>
            )}
          </div>
        </section>

        {/* ── Revenue ──────────────────────────────────────────────────── */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <DollarSign className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-base font-semibold">Revenue</h2>
            {!isLoading && revenue && (
              <MomBadge
                current={revenue.newPaidThisMonth}
                previous={revenue.newPaidLastMonth}
                label="new paid"
              />
            )}
          </div>

          {isLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
            </div>
          ) : isError ? (
            <p className="text-sm text-destructive">Failed to load revenue data.</p>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
                <StatCard label="MRR" value={fmtDollars(revenue.mrrCents)} sub="~$6.49/user" />
                <StatCard label="Paid Users" value={fmt(revenue.paidCount)} />
                <StatCard label="Free Users" value={fmt(revenue.freeCount)} />
                <StatCard label="Comped Users" value={fmt(revenue.compedCount)} sub="fee_exempt" />
                <StatCard
                  label="Conversion Rate"
                  value={`${(revenue.conversionRate * 100).toFixed(1)}%`}
                  sub="paid ÷ total"
                />
              </div>

              {/* Revenue by source bar chart */}
              <Card className="elev-rest">
                <CardHeader className="pb-2 pt-4">
                  <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                    MRR by Platform
                  </CardTitle>
                </CardHeader>
                <CardContent className="pb-4">
                  <ResponsiveContainer width="100%" height={140}>
                    <BarChart
                      layout="vertical"
                      data={revenue.bySource}
                      margin={{ top: 0, right: 80, bottom: 0, left: 8 }}
                    >
                      <XAxis type="number" hide />
                      <YAxis
                        type="category"
                        dataKey="source"
                        width={56}
                        tick={{ fontSize: 13, fontWeight: 600 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        formatter={(v: any, name: string) => [fmtDollars(v as number), 'MRR']}
                        cursor={{ fill: 'hsl(var(--muted))' }}
                      />
                      <Bar dataKey="mrrCents" radius={[0, 4, 4, 0]} barSize={28}>
                        {revenue.bySource.map((entry: any) => (
                          <Cell key={entry.source} fill={SOURCE_COLORS[entry.source] ?? '#8884d8'} />
                        ))}
                        <LabelList
                          dataKey="mrrCents"
                          position="right"
                          formatter={(v: number) => fmtDollars(v)}
                          style={{ fontSize: 12, fontWeight: 600, fill: 'hsl(var(--foreground))' }}
                        />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  <div className="mt-2 flex gap-4 flex-wrap">
                    {revenue.bySource.map((s: any) => (
                      <span key={s.source} className="text-xs text-muted-foreground">
                        <span
                          className="inline-block w-2 h-2 rounded-full mr-1"
                          style={{ background: SOURCE_COLORS[s.source] ?? '#8884d8' }}
                        />
                        {s.source}: {fmt(s.count)} user{s.count !== 1 ? 's' : ''}
                      </span>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </section>

        {/* ── Referral Partners ─────────────────────────────────────────── */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Handshake className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-base font-semibold">Referral Partners</h2>
          </div>

          {isLoading ? (
            <Card className="elev-rest">
              <CardContent className="pt-4 space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </CardContent>
            </Card>
          ) : isError ? (
            <p className="text-sm text-destructive">Failed to load referral data.</p>
          ) : partners.length === 0 ? (
            <Card className="elev-rest">
              <CardContent className="py-6 text-center text-sm text-muted-foreground">
                No referral partners yet.
              </CardContent>
            </Card>
          ) : (
            <Card className="elev-rest overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40">
                      <th className="text-left px-4 py-3 font-semibold text-muted-foreground whitespace-nowrap">Partner</th>
                      <th className="text-left px-4 py-3 font-semibold text-muted-foreground whitespace-nowrap">Status</th>
                      <th className="text-left px-4 py-3 font-semibold text-muted-foreground whitespace-nowrap">Approved</th>
                      <th className="text-right px-4 py-3 font-semibold text-muted-foreground whitespace-nowrap">Signups</th>
                      <th className="text-right px-4 py-3 font-semibold text-muted-foreground whitespace-nowrap">Commission Due</th>
                    </tr>
                  </thead>
                  <tbody>
                    {partners.map((p: any, i: number) => (
                      <tr key={p.id} className={`border-b border-border/50 ${i % 2 === 0 ? '' : 'bg-muted/20'}`}>
                        <td className="px-4 py-3 font-medium">{p.orgName}</td>
                        <td className="px-4 py-3">
                          <Badge
                            variant="outline"
                            className={
                              p.status === 'approved'
                                ? 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/30'
                                : p.status === 'pending'
                                ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30'
                                : 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30'
                            }
                          >
                            {p.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                          {p.approvedAt
                            ? new Date(p.approvedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                            : '—'}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">{fmt(p.attributedSignups)}</td>
                        <td className="px-4 py-3 text-right tabular-nums font-medium">{fmtDollars(p.commissionDueCents)}</td>
                      </tr>
                    ))}
                    {/* Totals row */}
                    <tr className="bg-muted/40 font-semibold">
                      <td className="px-4 py-3" colSpan={3}>Totals</td>
                      <td className="px-4 py-3 text-right tabular-nums">{fmt(totalSignups)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{fmtDollars(totalCommission)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </section>

      </div>
    </div>
  );
}
