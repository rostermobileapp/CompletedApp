import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation, Link } from 'wouter';
import {
  LogOut, TrendingUp, Users, DollarSign,
  ChevronLeft, ChevronRight, Loader2, AlertCircle, Search, Download,
} from 'lucide-react';
import rosterLightLogo from '@assets/Light_Mode_Logo_1768322748282.png';

interface UserLink {
  id: string;
  userId: string;
  isPaid: boolean;
  paidTier: string | null;
  linkedAt: string;
  paidAt: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  role: string | null;
}

interface PartnerMe {
  partner: {
    orgName: string;
    contactName: string;
    referralCode: string;
    payoutRate: number;
  };
  stats: {
    totalConversions: number;
    tierBreakdown: Record<string, number>;
    platformBreakdown: Record<string, number>;
    totalReferred: number;
    totalPaid: number;
    conversionRate: number;
    tierBreakdownLinks: Record<string, number>;
  };
  userLinks: {
    total: number;
    paid: number;
    free: number;
    conversionRate: number;
    rows: UserLink[];
  };
  quarterEstimate: {
    quarter: string;
    conversions: number;
    grossCents: number;
    platformFeePercent: number;
    payoutRate: number;
    estimatedPayoutCents: number;
  };
  conversions: Array<{
    id: string;
    convertedAt: string;
    conversionType: string | null;
    tier: string | null;
    platform: string | null;
    grossPriceCents: number | null;
    netContributionCents: number | null;
    estimatedEarningsCents: number | null;
    status: string;
  }>;
  payouts: Array<{
    id: string;
    periodStart: string;
    periodEnd: string;
    amountCents: number;
    status: string;
    paidAt: string | null;
  }>;
}

function formatRole(role: string | null | undefined): string {
  if (!role) return '—';
  return role.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

const CONVERSIONS_PER_PAGE = 10;

function StatCard({ label, value, icon: Icon, sub }: {
  label: string;
  value: string | number;
  icon: typeof TrendingUp;
  sub?: string;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-9 h-9 rounded-xl bg-[#3c82f4]/10 flex items-center justify-center">
          <Icon className="w-5 h-5 text-[#3c82f4]" />
        </div>
        <span className="text-sm font-medium text-gray-500">{label}</span>
      </div>
      <p className="text-2xl font-black text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}


export default function ReferralPortal() {
  const [, setLocation] = useLocation();
  const [convPage, setConvPage] = useState(1);
  const [userLinkSearch, setUserLinkSearch] = useState('');

  const { data, isLoading, isError, error } = useQuery<PartnerMe>({
    queryKey: ['/api/referral/portal/me'],
    queryFn: async () => {
      const res = await fetch('/api/referral/portal/me', { credentials: 'include' });
      if (res.status === 401) {
        setLocation('/referral-program/portal/login');
        throw new Error('Unauthorized');
      }
      if (!res.ok) {
        const d: { message?: string } = await res.json().catch(() => ({}));
        throw new Error(d.message || 'Failed to load portal');
      }
      return res.json();
    },
    retry: false,
    staleTime: 30000,
  });

  async function handleLogout() {
    await fetch('/api/referral/portal/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
    setLocation('/referral-program/portal/login');
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#3c82f4] animate-spin" />
      </div>
    );
  }

  if (isError) {
    const msg = (error as Error)?.message;
    if (msg === 'Unauthorized') return null;
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="bg-white border border-red-200 rounded-2xl p-8 text-center max-w-sm">
          <AlertCircle className="w-10 h-10 text-red-500 mx-auto mb-3" />
          <p className="font-semibold text-gray-900 mb-2">Failed to load portal</p>
          <p className="text-sm text-gray-500 mb-4">{msg}</p>
          <Link href="/referral-program/portal/login" className="text-sm text-[#3c82f4] hover:underline">
            Sign in again
          </Link>
        </div>
      </div>
    );
  }

  const { partner, stats, userLinks, quarterEstimate, conversions, payouts } = data!;
  const totalConvPages = Math.max(1, Math.ceil(conversions.length / CONVERSIONS_PER_PAGE));
  const convSlice = conversions.slice((convPage - 1) * CONVERSIONS_PER_PAGE, convPage * CONVERSIONS_PER_PAGE);
  const quarterlyEst = (quarterEstimate.estimatedPayoutCents ?? 0) / 100;
  const platformFeePercent = quarterEstimate.platformFeePercent ?? 15;

  function fmt(cents: number) {
    return `$${(cents / 100).toFixed(2)}`;
  }
  function fmtDollars(n: number) {
    return `$${n.toFixed(2)}`;
  }
  function fmtDate(s: string) {
    return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={rosterLightLogo} alt="Roster" className="h-7 object-contain" />
            <span className="text-sm text-gray-400">Partner Portal</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-gray-700 hidden sm:block">{partner.orgName}</span>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors"
            >
              <LogOut className="w-4 h-4" /> Sign out
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
        {/* Welcome */}
        <div>
          <h1 className="text-2xl font-black text-gray-900 mb-1">
            Welcome back, {partner.contactName.split(' ')[0]}
          </h1>
          <p className="text-sm text-gray-500">Here's your referral program overview.</p>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Users Referred"
            value={stats.totalReferred ?? 0}
            icon={Users}
            sub="signed up with your code"
          />
          <StatCard
            label="Converted to Paid"
            value={stats.totalPaid ?? 0}
            icon={TrendingUp}
            sub={`${stats.conversionRate ?? 0}% conversion rate`}
          />
          <StatCard
            label="Est. Quarterly Payout"
            value={fmtDollars(quarterlyEst)}
            icon={DollarSign}
            sub={`${partner.payoutRate}% payout rate`}
          />
          <StatCard
            label="Active Subscriptions"
            value={stats.totalConversions}
            icon={TrendingUp}
            sub="this quarter"
          />
        </div>

        {/* Referred Users */}
        {userLinks && (
          <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
              <h3 className="text-sm font-semibold text-gray-700">Referred Users ({userLinks.total})</h3>
              <div className="flex items-center gap-4 text-sm text-gray-500 flex-wrap">
                <span>Paid: <strong className="text-gray-900">{userLinks.paid}</strong></span>
                <span>Free: <strong className="text-gray-900">{userLinks.free}</strong></span>
                <span>Conv.: <strong className="text-gray-900">{userLinks.conversionRate}%</strong></span>
                <button
                  className="flex items-center gap-1 px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                  onClick={() => {
                    const header = "Name,Email,Status,Tier,Linked At,Paid At";
                    const lines = userLinks.rows.map(l =>
                      [
                        [l.firstName, l.lastName].filter(Boolean).join(' ') || '',
                        l.email ?? '',
                        l.isPaid ? 'Paid' : 'Free',
                        formatRole(l.role),
                        l.linkedAt ?? '',
                        l.paidAt ?? '',
                      ].join(',')
                    );
                    const csv = [header, ...lines].join('\n');
                    const blob = new Blob([csv], { type: 'text/csv' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `referred-users.csv`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                >
                  <Download className="w-3 h-3" />Export CSV
                </button>
              </div>
            </div>
            <div className="px-5 py-3 border-b border-gray-100">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input
                  type="text"
                  value={userLinkSearch}
                  onChange={e => setUserLinkSearch(e.target.value)}
                  placeholder="Filter by name, email, or tier…"
                  className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-[#3c82f4]"
                />
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-4 py-3 text-gray-500 font-medium">Linked</th>
                    <th className="text-left px-4 py-3 text-gray-500 font-medium">Name</th>
                    <th className="text-left px-4 py-3 text-gray-500 font-medium hidden sm:table-cell">Email</th>
                    <th className="text-left px-4 py-3 text-gray-500 font-medium">Status</th>
                    <th className="text-left px-4 py-3 text-gray-500 font-medium">Tier</th>
                    <th className="text-left px-4 py-3 text-gray-500 font-medium hidden md:table-cell">Paid At</th>
                  </tr>
                </thead>
                <tbody>
                  {userLinks.rows
                    .filter(l => {
                      if (!userLinkSearch.trim()) return true;
                      const q = userLinkSearch.toLowerCase();
                      const fullName = [l.firstName, l.lastName].filter(Boolean).join(' ').toLowerCase();
                      return (
                        fullName.includes(q) ||
                        (l.email ?? '').toLowerCase().includes(q) ||
                        formatRole(l.role).toLowerCase().includes(q)
                      );
                    })
                    .map(l => {
                      const fullName = [l.firstName, l.lastName].filter(Boolean).join(' ') || '—';
                      return (
                        <tr key={l.id} className="border-b border-gray-50 last:border-0">
                          <td className="px-4 py-2.5 text-xs text-gray-400 whitespace-nowrap">{fmtDate(l.linkedAt)}</td>
                          <td className="px-4 py-2.5 text-sm text-gray-800 font-medium">{fullName}</td>
                          <td className="px-4 py-2.5 text-sm text-gray-500 hidden sm:table-cell">{l.email ?? '—'}</td>
                          <td className="px-4 py-2.5">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${l.isPaid ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-600'}`}>
                              {l.isPaid ? 'Paid' : 'Free'}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-gray-600">{formatRole(l.role)}</td>
                          <td className="px-4 py-2.5 text-xs text-gray-400 hidden md:table-cell">{l.paidAt ? fmtDate(l.paidAt) : '—'}</td>
                        </tr>
                      );
                    })}
                  {userLinks.rows.filter(l => {
                    if (!userLinkSearch.trim()) return true;
                    const q = userLinkSearch.toLowerCase();
                    const fullName = [l.firstName, l.lastName].filter(Boolean).join(' ').toLowerCase();
                    return fullName.includes(q) || (l.email ?? '').toLowerCase().includes(q) || formatRole(l.role).toLowerCase().includes(q);
                  }).length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                      {userLinkSearch ? 'No users match your search.' : 'No referred users yet.'}
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Breakdown cards */}
        {(Object.keys(stats.tierBreakdownLinks ?? stats.tierBreakdown ?? {}).length > 0 || Object.keys(stats.platformBreakdown ?? {}).length > 0) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Object.keys(stats.tierBreakdownLinks ?? stats.tierBreakdown ?? {}).length > 0 && (
              <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-gray-700 mb-4">Paid Users by Tier</h3>
                <div className="space-y-2">
                  {Object.entries(stats.tierBreakdownLinks ?? stats.tierBreakdown ?? {}).map(([tier, count]) => (
                    <div key={tier} className="flex items-center justify-between text-sm">
                      <span className="capitalize text-gray-700">{tier.replace(/_/g, ' ')}</span>
                      <span className="font-semibold text-gray-900">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {Object.keys(stats.platformBreakdown ?? {}).length > 0 && (
              <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-gray-700 mb-4">By Platform</h3>
                <div className="space-y-2">
                  {Object.entries(stats.platformBreakdown).map(([platform, count]) => (
                    <div key={platform} className="flex items-center justify-between text-sm">
                      <span className="capitalize text-gray-700">{platform}</span>
                      <span className="font-semibold text-gray-900">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Quarterly payout estimate card */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-700 mb-1">Estimated Quarterly Payout</h3>
          <p className="text-3xl font-black text-[#3c82f4] mb-2">{fmtDollars(quarterlyEst)}</p>
          <p className="text-xs text-gray-400 mb-3">
            Calculated as: gross revenue × {100 - platformFeePercent}% net × {partner.payoutRate}% payout rate.
            Based on {quarterEstimate.conversions} active subscription{quarterEstimate.conversions !== 1 ? 's' : ''} this quarter.
            Payouts are made quarterly and are subject to final review.
          </p>
          <p className="text-xs text-gray-300 italic">
            Disclaimer: Estimated earnings are approximate. Actual payouts may differ due to refunds, chargebacks, or adjustments.
          </p>
        </div>

        {/* Payout history */}
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700">Payout History</h3>
          </div>
          {payouts.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-gray-400">
              No payouts yet. Your first payout will appear here after the first quarter.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-5 py-3 font-semibold text-gray-600">Period</th>
                    <th className="text-right px-5 py-3 font-semibold text-gray-600">Amount</th>
                    <th className="text-center px-5 py-3 font-semibold text-gray-600">Status</th>
                    <th className="text-right px-5 py-3 font-semibold text-gray-600">Paid On</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {payouts.map(p => (
                    <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3 text-gray-700">
                        {fmtDate(p.periodStart)} – {fmtDate(p.periodEnd)}
                      </td>
                      <td className="px-5 py-3 text-right font-semibold text-gray-900">{fmt(p.amountCents)}</td>
                      <td className="px-5 py-3 text-center">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                          p.status === 'paid' ? 'bg-green-100 text-green-700' :
                          p.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-gray-100 text-gray-600'
                        }`}>
                          {p.status}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right text-gray-500">
                        {p.paidAt ? fmtDate(p.paidAt) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Conversion history */}
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">Conversion History</h3>
            <span className="text-xs text-gray-400">{conversions.length} total</span>
          </div>
          {conversions.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-gray-400">
              No conversions yet.
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="text-left px-5 py-3 font-semibold text-gray-600">Date</th>
                      <th className="text-left px-5 py-3 font-semibold text-gray-600">Type</th>
                      <th className="text-left px-5 py-3 font-semibold text-gray-600">Tier</th>
                      <th className="text-left px-5 py-3 font-semibold text-gray-600 hidden sm:table-cell">Platform</th>
                      <th className="text-right px-5 py-3 font-semibold text-gray-600">Gross</th>
                      <th className="text-right px-5 py-3 font-semibold text-gray-600 hidden md:table-cell">Net</th>
                      <th className="text-right px-5 py-3 font-semibold text-gray-600">Est. Earnings</th>
                      <th className="text-center px-5 py-3 font-semibold text-gray-600">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {convSlice.map(c => (
                      <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-5 py-3 text-gray-700 whitespace-nowrap">{fmtDate(c.convertedAt)}</td>
                        <td className="px-5 py-3">
                          {c.conversionType === 'renewal' ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">Renewal</span>
                          ) : c.conversionType === 'claim' ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700">Claim</span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">Initial</span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-gray-700">{formatRole(c.tier)}</td>
                        <td className="px-5 py-3 text-gray-700 capitalize hidden sm:table-cell">{c.platform || '—'}</td>
                        <td className="px-5 py-3 text-right text-gray-700">{c.grossPriceCents ? fmt(c.grossPriceCents) : <span className="text-gray-400 text-xs">—</span>}</td>
                        <td className="px-5 py-3 text-right text-gray-700 hidden md:table-cell">{c.netContributionCents ? fmt(c.netContributionCents) : <span className="text-gray-400 text-xs">—</span>}</td>
                        <td className="px-5 py-3 text-right font-semibold text-[#3c82f4]">
                          {c.estimatedEarningsCents ? fmt(c.estimatedEarningsCents) : <span className="text-gray-400 text-xs font-normal">—</span>}
                        </td>
                        <td className="px-5 py-3 text-center">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                            c.status === 'active' ? 'bg-green-100 text-green-700' :
                            c.status === 'cancelled' ? 'bg-red-100 text-red-700' :
                            c.status === 'refunded' ? 'bg-orange-100 text-orange-700' :
                            'bg-gray-100 text-gray-600'
                          }`}>
                            {c.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {totalConvPages > 1 && (
                <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-between">
                  <span className="text-xs text-gray-500">
                    Page {convPage} of {totalConvPages}
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setConvPage(p => Math.max(1, p - 1))}
                      disabled={convPage === 1}
                      className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setConvPage(p => Math.min(totalConvPages, p + 1))}
                      disabled={convPage === totalConvPages}
                      className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <p className="text-center text-xs text-gray-300 pb-4">
          Questions? Contact us at{' '}
          <a href="mailto:support@rosterapp.co" className="text-[#3c82f4] hover:underline">support@rosterapp.co</a>
        </p>
      </div>
    </div>
  );
}
