import { useState, useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, RefreshCw, DollarSign, Send, AlertCircle,
  Ban, Mail, Pencil, Check, X, Trash2, PauseCircle, MailCheck, Search, Download
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";

// ── Admin fetch (cookie-based auth) ─────────────────────────────────────────
async function adminFetch(path: string, opts?: RequestInit) {
  const res = await fetch(path, {
    ...opts,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(opts?.headers ?? {}) },
  });
  return res;
}

function useAdminQuery<T>(key: string[], path: string, enabled = true) {
  return useQuery<T>({
    queryKey: key,
    enabled,
    staleTime: 30_000,
    queryFn: async () => {
      const res = await adminFetch(path);
      if (res.status === 401) throw new Error("UNAUTHORIZED");
      if (!res.ok) throw new Error(await res.text());
      return res.json() as Promise<T>;
    },
  });
}

// ── Types ────────────────────────────────────────────────────────────────────
interface Partner {
  id: string;
  orgName: string;
  contactName: string;
  email: string;
  orgType: string;
  hockeyAffiliation: string | null;
  status: string;
  referralCode: string | null;
  payoutRate: string;
  adminNotes: string | null;
  createdAt: string;
  approvedAt: string | null;
}

interface Metrics {
  totalConversions: number;
  quarterConversions: number;
  lastQuarterConversions: number;
  lifetimeGrossCents: number;
  lifetimeEstimatedPayoutCents: number;
  quarterGrossCents: number;
  quarterEstimatedPayoutCents: number;
}

interface Conversion {
  id: string;
  referralCode: string;
  userId: string | null;
  conversionType: string | null;
  tier: string | null;
  platform: string | null;
  grossPriceCents: number | null;
  status: string;
  convertedAt: string;
}

interface Payout {
  id: string;
  quarter: string;
  amountCents: number;
  method: string | null;
  reference: string | null;
  notes: string | null;
  paidAt: string;
}

interface UserLink {
  id: string;
  userId: string;
  referralPartnerId: string;
  isPaid: boolean;
  paidTier: string | null;
  linkedAt: string;
  paidAt: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  role: string | null;
}

function formatRole(role: string | null | undefined): string {
  if (!role) return '—';
  return role.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

interface UserLinks {
  total: number;
  paid: number;
  free: number;
  conversionRate: number;
  tierBreakdown: Record<string, number>;
  rows: UserLink[];
}

interface PartnerDetail {
  partner: Partner;
  metrics: Metrics;
  userLinks: UserLinks;
  conversions: Conversion[];
  payouts: Payout[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmt$ = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString() : "—";
const statusColor = (s: string) =>
  s === "approved"  ? "bg-green-100 text-green-800" :
  s === "active"    ? "bg-blue-100 text-blue-800" :
  s === "pending"   ? "bg-yellow-100 text-yellow-800" :
  s === "suspended" ? "bg-orange-100 text-orange-800" :
  "bg-red-100 text-red-800";

function MetricCard({ title, value, sub }: { title: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">{title}</p>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────
export default function ReferralAdminPartnerDetail() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [adminNotes, setAdminNotes] = useState("");
  const [notesInited, setNotesInited] = useState(false);
  const [payoutModal, setPayoutModal] = useState(false);
  const [messageModal, setMessageModal] = useState(false);
  const [payoutForm, setPayoutForm] = useState({ quarter: "", amountCents: "", method: "", reference: "", notes: "" });
  const [msgForm, setMsgForm] = useState({ subject: "", body: "" });

  // Inline referral code editing
  const [editingCode, setEditingCode] = useState(false);
  const [codeInput, setCodeInput] = useState("");
  const [savingCode, setSavingCode] = useState(false);

  // Delete confirmation dialog
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  // Referred users search
  const [userLinkSearch, setUserLinkSearch] = useState("");

  // Resend email state
  const [resendingWelcome, setResendingWelcome] = useState(false);
  const [resendingLogin, setResendingLogin] = useState(false);
  const [resendRejectionOpen, setResendRejectionOpen] = useState(false);
  const [resendRejectionReason, setResendRejectionReason] = useState("");
  const [resendingRejection, setResendingRejection] = useState(false);

  // Auth guard - redirect to login page if not authed
  useEffect(() => {
    adminFetch("/api/admin/referrals/check-auth").then((res) => {
      if (!res.ok) navigate("/admin/referrals/login");
    });
  }, []);

  const { data, isLoading, error } = useAdminQuery<PartnerDetail>(
    ["admin-referrals-partner", id],
    `/api/admin/referrals/partners/${id}`
  );

  useEffect(() => {
    if (data && !notesInited) {
      setAdminNotes(data.partner.adminNotes || "");
      setNotesInited(true);
    }
  }, [data, notesInited]);

  async function saveNotes() {
    await adminFetch(`/api/admin/referrals/partners/${id}/notes`, {
      method: "PATCH",
      body: JSON.stringify({ adminNotes }),
    });
    toast({ title: "Notes saved" });
    qc.invalidateQueries({ queryKey: ["admin-referrals-partner", id] });
  }

  async function saveReferralCode() {
    const code = codeInput.trim().toUpperCase();
    if (!code) { toast({ title: "Code cannot be empty", variant: "destructive" }); return; }
    setSavingCode(true);
    const res = await adminFetch(`/api/admin/referrals/partners/${id}/referral-code`, {
      method: "PATCH",
      body: JSON.stringify({ referralCode: code }),
    });
    setSavingCode(false);
    if (res.ok) {
      toast({ title: "Referral code updated" });
      qc.invalidateQueries({ queryKey: ["admin-referrals-partner", id] });
      setEditingCode(false);
    } else {
      const d = await res.json();
      toast({ title: d.message || "Failed to update code", variant: "destructive" });
    }
  }

  async function resendWelcome() {
    setResendingWelcome(true);
    const res = await adminFetch(`/api/admin/referrals/partners/${id}/resend-welcome`, { method: "POST" });
    setResendingWelcome(false);
    if (res.ok) toast({ title: "Welcome email resent!" });
    else { const d = await res.json(); toast({ title: d.message || "Failed", variant: "destructive" }); }
  }

  async function resendLogin() {
    setResendingLogin(true);
    const res = await adminFetch(`/api/admin/referrals/partners/${id}/resend-login`, { method: "POST" });
    setResendingLogin(false);
    if (res.ok) toast({ title: "Login link sent!" });
    else { const d = await res.json(); toast({ title: d.message || "Failed", variant: "destructive" }); }
  }

  async function resendRejection() {
    setResendingRejection(true);
    const res = await adminFetch(`/api/admin/referrals/partners/${id}/resend-rejection`, {
      method: "POST",
      body: JSON.stringify({ reason: resendRejectionReason.trim() || undefined }),
    });
    setResendingRejection(false);
    if (res.ok) {
      toast({ title: "Rejection email resent!" });
      setResendRejectionOpen(false);
      setResendRejectionReason("");
    } else {
      const d = await res.json();
      toast({ title: d.message || "Failed", variant: "destructive" });
    }
  }

  async function revoke() {
    if (!confirm("Revoke access for this partner? They will no longer be able to log in.")) return;
    const res = await adminFetch(`/api/admin/referrals/partners/${id}/revoke`, { method: "POST" });
    if (res.ok) {
      toast({ title: "Access revoked" });
      qc.invalidateQueries({ queryKey: ["admin-referrals-partner", id] });
    }
  }

  async function suspend() {
    if (!confirm("Suspend and archive this partner? Their referral code will stop working and they will lose portal access.")) return;
    const res = await adminFetch(`/api/admin/referrals/partners/${id}/suspend`, { method: "POST" });
    if (res.ok) {
      toast({ title: "Partner suspended & archived" });
      qc.invalidateQueries({ queryKey: ["admin-referrals-partner", id] });
    } else {
      const d = await res.json();
      toast({ title: d.message || "Failed to suspend", variant: "destructive" });
    }
  }

  async function deletePartner() {
    const res = await adminFetch(`/api/admin/referrals/partners/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast({ title: "Partner deleted" });
      navigate("/admin/referrals");
    } else {
      const d = await res.json();
      toast({ title: d.message || "Failed to delete", variant: "destructive" });
    }
    setDeleteConfirmOpen(false);
  }

  async function recordPayout() {
    if (!payoutForm.quarter || !payoutForm.amountCents) {
      toast({ title: "Quarter and amount required", variant: "destructive" }); return;
    }
    const res = await adminFetch(`/api/admin/referrals/partners/${id}/payouts`, {
      method: "POST",
      body: JSON.stringify({ ...payoutForm, amountCents: Math.round(parseFloat(payoutForm.amountCents) * 100) }),
    });
    if (res.ok) {
      toast({ title: "Payout recorded!" });
      qc.invalidateQueries({ queryKey: ["admin-referrals-partner", id] });
      setPayoutModal(false);
      setPayoutForm({ quarter: "", amountCents: "", method: "", reference: "", notes: "" });
    } else {
      const d = await res.json();
      toast({ title: d.message || "Failed", variant: "destructive" });
    }
  }

  async function sendMessage() {
    if (!msgForm.subject || !msgForm.body) {
      toast({ title: "Subject and body required", variant: "destructive" }); return;
    }
    const res = await adminFetch(`/api/admin/referrals/partners/${id}/message`, {
      method: "POST",
      body: JSON.stringify(msgForm),
    });
    if (res.ok) {
      toast({ title: "Message sent!" });
      setMessageModal(false);
      setMsgForm({ subject: "", body: "" });
    } else {
      const d = await res.json();
      toast({ title: d.message || "Failed to send", variant: "destructive" });
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error ? String(error) : "Partner not found"}</AlertDescription>
        </Alert>
      </div>
    );
  }

  const { partner, metrics, userLinks, conversions, payouts } = data;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/admin/referrals")}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="font-bold text-gray-900 truncate">{partner.orgName}</h1>
            <p className="text-xs text-gray-400">{partner.email}</p>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <Button size="sm" variant="outline" onClick={() => setMessageModal(true)}>
              <Mail className="w-4 h-4 mr-1.5" />Message
            </Button>
            <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={() => setPayoutModal(true)}>
              <DollarSign className="w-4 h-4 mr-1.5" />Record Payout
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Partner info card */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold text-gray-900">{partner.orgName}</h2>
              <p className="text-sm text-gray-500">{partner.orgType} · {partner.contactName}</p>
            </div>
            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${statusColor(partner.status)}`}>
              {partner.status}
            </span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            {/* Referral Code — inline editable */}
            <div>
              <Label className="text-gray-400 text-xs">Referral Code</Label>
              {editingCode ? (
                <div className="flex items-center gap-1 mt-0.5">
                  <Input
                    value={codeInput}
                    onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
                    className="h-7 text-sm font-mono uppercase w-28 px-2"
                    maxLength={16}
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveReferralCode();
                      if (e.key === "Escape") setEditingCode(false);
                    }}
                  />
                  <Button size="icon" className="h-7 w-7 bg-green-600 hover:bg-green-700 text-white" disabled={savingCode} onClick={saveReferralCode}>
                    {savingCode ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingCode(false)}>
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 mt-0.5">
                  <p className="font-mono font-bold text-blue-600">{partner.referralCode || "—"}</p>
                  <button
                    className="text-gray-300 hover:text-gray-500 transition-colors"
                    title="Edit referral code"
                    onClick={() => { setCodeInput(partner.referralCode || ""); setEditingCode(true); }}
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>
            <div><Label className="text-gray-400 text-xs">Payout Rate</Label><p className="font-semibold mt-0.5">{(parseFloat(partner.payoutRate) * 100).toFixed(0)}%</p></div>
            <div><Label className="text-gray-400 text-xs">Approved</Label><p className="mt-0.5">{fmtDate(partner.approvedAt)}</p></div>
            <div><Label className="text-gray-400 text-xs">Applied</Label><p className="mt-0.5">{fmtDate(partner.createdAt)}</p></div>
            {partner.hockeyAffiliation && (
              <div className="col-span-2 md:col-span-4"><Label className="text-gray-400 text-xs">Hockey Affiliation</Label><p className="mt-0.5">{partner.hockeyAffiliation}</p></div>
            )}
          </div>

          {/* Action buttons */}
          <div className="mt-4 pt-4 border-t border-gray-100 flex gap-2 flex-wrap">
            {partner.status === "approved" && (
              <>
                <Button size="sm" variant="outline" disabled={resendingWelcome} onClick={resendWelcome}>
                  {resendingWelcome ? <RefreshCw className="w-4 h-4 mr-1.5 animate-spin" /> : <MailCheck className="w-4 h-4 mr-1.5" />}Resend Welcome
                </Button>
                <Button size="sm" variant="outline" disabled={resendingLogin} onClick={resendLogin}>
                  {resendingLogin ? <RefreshCw className="w-4 h-4 mr-1.5 animate-spin" /> : <Mail className="w-4 h-4 mr-1.5" />}Send Password Reset
                </Button>
                <Button size="sm" variant="outline" className="text-orange-600 border-orange-200 hover:bg-orange-50" onClick={suspend}>
                  <PauseCircle className="w-4 h-4 mr-1.5" />Suspend & Archive
                </Button>
                <Button size="sm" variant="outline" onClick={revoke}>
                  <Ban className="w-4 h-4 mr-1.5" />Revoke Access
                </Button>
              </>
            )}
            {(partner.status === "rejected" || partner.status === "suspended") && (
              <Button size="sm" variant="outline" onClick={() => setResendRejectionOpen(true)}>
                <MailCheck className="w-4 h-4 mr-1.5" />Resend Rejection Email
              </Button>
            )}
            {partner.status === "suspended" && (
              <p className="text-xs text-orange-600 flex items-center gap-1.5 w-full">
                <PauseCircle className="w-4 h-4" />This partner is suspended — their referral code is inactive and they cannot log in.
              </p>
            )}
            <Button
              size="sm"
              variant="outline"
              className="text-red-600 border-red-200 hover:bg-red-50 ml-auto"
              onClick={() => setDeleteConfirmOpen(true)}
            >
              <Trash2 className="w-4 h-4 mr-1.5" />Delete Partner
            </Button>
          </div>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard title="Total Conversions" value={metrics.totalConversions} />
          <MetricCard title="This Quarter" value={metrics.quarterConversions} />
          <MetricCard title="Last Quarter" value={metrics.lastQuarterConversions} />
          <MetricCard title="Lifetime Gross" value={fmt$(metrics.lifetimeGrossCents)} />
          <MetricCard title="Qtr Gross Revenue" value={fmt$(metrics.quarterGrossCents)} />
          <MetricCard title="Est. Qtr Payout" value={fmt$(metrics.quarterEstimatedPayoutCents)} />
          <MetricCard title="Lifetime Est. Payout" value={fmt$(metrics.lifetimeEstimatedPayoutCents)} />
        </div>

        {/* Referred Users Overview */}
        {userLinks && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
              <h3 className="font-semibold text-gray-800">Referred Users ({userLinks.total})</h3>
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex gap-4 text-sm text-gray-500">
                  <span>Paid: <strong className="text-gray-900">{userLinks.paid}</strong></span>
                  <span>Free: <strong className="text-gray-900">{userLinks.free}</strong></span>
                  <span>Conv.: <strong className="text-gray-900">{userLinks.conversionRate}%</strong></span>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs gap-1"
                  onClick={() => {
                    const rows = userLinks.rows;
                    const header = "Name,Email,Status,Tier,Linked At,Paid At";
                    const lines = rows.map(l =>
                      [
                        [l.firstName, l.lastName].filter(Boolean).join(' ') || '',
                        l.email ?? '',
                        l.isPaid ? "Paid" : "Free",
                        l.paidTier ?? "",
                        l.linkedAt ?? "",
                        l.paidAt ?? "",
                      ].join(",")
                    );
                    const csv = [header, ...lines].join("\n");
                    const blob = new Blob([csv], { type: "text/csv" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `referred-users-${id}.csv`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                >
                  <Download className="w-3 h-3" />Export CSV
                </Button>
              </div>
            </div>
            {/* Search bar */}
            <div className="px-5 py-3 border-b border-gray-100">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input
                  type="text"
                  value={userLinkSearch}
                  onChange={e => setUserLinkSearch(e.target.value)}
                  placeholder="Filter by name, email, or tier…"
                  className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
                />
              </div>
            </div>
            {Object.keys(userLinks.tierBreakdown ?? {}).length > 0 && (
              <div className="px-5 py-3 border-b border-gray-50 flex flex-wrap gap-4 text-sm text-gray-500">
                {Object.entries(userLinks.tierBreakdown).map(([t, n]) => (
                  <span key={t}><span className="capitalize">{t.replace(/_/g, ' ')}</span>: <strong className="text-gray-900">{n}</strong></span>
                ))}
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
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
                        (l.email ?? "").toLowerCase().includes(q) ||
                        (l.paidTier ?? "").toLowerCase().includes(q)
                      );
                    })
                    .map((l) => {
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
                        <td className="px-4 py-2.5 text-xs text-gray-400 hidden md:table-cell">{fmtDate(l.paidAt)}</td>
                      </tr>
                    )})}
                  {userLinks.rows.filter(l => {
                    if (!userLinkSearch.trim()) return true;
                    const q = userLinkSearch.toLowerCase();
                    const fullName = [l.firstName, l.lastName].filter(Boolean).join(' ').toLowerCase();
                    return fullName.includes(q) || (l.email ?? "").toLowerCase().includes(q) || (l.paidTier ?? "").toLowerCase().includes(q);
                  }).length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                      {userLinkSearch ? "No users match your search." : "No referred users yet."}
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Admin Notes */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <h3 className="font-semibold text-gray-800 mb-3">Admin Notes</h3>
          <Textarea
            rows={4}
            value={adminNotes}
            onChange={(e) => setAdminNotes(e.target.value)}
            onBlur={saveNotes}
            placeholder="Internal notes — auto-saved on blur…"
            className="font-mono text-sm"
          />
          <p className="text-xs text-gray-400 mt-1.5">Auto-saves when you click away.</p>
        </div>

        {/* Conversions */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h3 className="font-semibold text-gray-800">Conversion History ({conversions.length})</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">Date</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">Type</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium hidden sm:table-cell">User ID</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">Tier</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium hidden md:table-cell">Platform</th>
                  <th className="text-right px-4 py-3 text-gray-500 font-medium">Gross</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {conversions.map((c) => (
                  <tr key={c.id} className="border-b border-gray-50 last:border-0">
                    <td className="px-4 py-2.5 text-xs text-gray-400 whitespace-nowrap">{fmtDate(c.convertedAt)}</td>
                    <td className="px-4 py-2.5">
                      {c.conversionType === 'renewal' ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">Renewal</span>
                      ) : c.conversionType === 'claim' ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700">Claim</span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">Initial</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-400 hidden sm:table-cell">{c.userId || "—"}</td>
                    <td className="px-4 py-2.5 text-gray-600">{formatRole(c.tier)}</td>
                    <td className="px-4 py-2.5 text-gray-500 capitalize hidden md:table-cell">{c.platform || "—"}</td>
                    <td className="px-4 py-2.5 text-right">{c.grossPriceCents ? fmt$(c.grossPriceCents) : <span className="text-gray-400">—</span>}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(c.status)}`}>{c.status}</span>
                    </td>
                  </tr>
                ))}
                {conversions.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">No conversions yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Payouts */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="font-semibold text-gray-800">Payout History ({payouts.length})</h3>
            <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white h-8 text-xs" onClick={() => setPayoutModal(true)}>
              <DollarSign className="w-3.5 h-3.5 mr-1" />Record Payout
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">Date</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">Quarter</th>
                  <th className="text-right px-4 py-3 text-gray-500 font-medium">Amount</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium hidden md:table-cell">Method</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium hidden lg:table-cell">Reference</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium hidden lg:table-cell">Notes</th>
                </tr>
              </thead>
              <tbody>
                {payouts.map((p) => (
                  <tr key={p.id} className="border-b border-gray-50 last:border-0">
                    <td className="px-4 py-2.5 text-xs text-gray-400">{fmtDate(p.paidAt)}</td>
                    <td className="px-4 py-2.5 text-gray-600">{p.quarter}</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-green-700">{fmt$(p.amountCents)}</td>
                    <td className="px-4 py-2.5 text-gray-500 hidden md:table-cell">{p.method || "—"}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-400 hidden lg:table-cell">{p.reference || "—"}</td>
                    <td className="px-4 py-2.5 text-gray-400 text-xs hidden lg:table-cell">{p.notes || "—"}</td>
                  </tr>
                ))}
                {payouts.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No payouts recorded yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* Record Payout modal */}
      <Dialog open={payoutModal} onOpenChange={setPayoutModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Payout — {partner.orgName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div>
              <Label>Quarter <span className="text-red-500">*</span></Label>
              <Input className="mt-1" value={payoutForm.quarter} onChange={(e) => setPayoutForm((f) => ({ ...f, quarter: e.target.value }))} placeholder="e.g. 2025-Q1" />
            </div>
            <div>
              <Label>Amount ($) <span className="text-red-500">*</span></Label>
              <Input className="mt-1" type="number" step="0.01" value={payoutForm.amountCents} onChange={(e) => setPayoutForm((f) => ({ ...f, amountCents: e.target.value }))} />
            </div>
            <div>
              <Label>Method</Label>
              <Input className="mt-1" value={payoutForm.method} onChange={(e) => setPayoutForm((f) => ({ ...f, method: e.target.value }))} placeholder="PayPal, Check, Wire…" />
            </div>
            <div>
              <Label>Reference #</Label>
              <Input className="mt-1" value={payoutForm.reference} onChange={(e) => setPayoutForm((f) => ({ ...f, reference: e.target.value }))} placeholder="Transaction or check number" />
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea className="mt-1" rows={2} value={payoutForm.notes} onChange={(e) => setPayoutForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPayoutModal(false)}>Cancel</Button>
            <Button className="bg-blue-600 hover:bg-blue-700 text-white" onClick={recordPayout}>Record</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Message modal */}
      <Dialog open={messageModal} onOpenChange={setMessageModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send Message — {partner.orgName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div>
              <Label>Subject <span className="text-red-500">*</span></Label>
              <Input className="mt-1" value={msgForm.subject} onChange={(e) => setMsgForm((f) => ({ ...f, subject: e.target.value }))} placeholder="Message subject" />
            </div>
            <div>
              <Label>Body <span className="text-red-500">*</span></Label>
              <Textarea className="mt-1" rows={6} value={msgForm.body} onChange={(e) => setMsgForm((f) => ({ ...f, body: e.target.value }))} placeholder="Write your message…" />
            </div>
            <p className="text-xs text-gray-400">This will be sent to: <strong>{partner.email}</strong></p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setMessageModal(false)}>Cancel</Button>
            <Button className="bg-blue-600 hover:bg-blue-700 text-white" onClick={sendMessage}>
              <Send className="w-4 h-4 mr-1.5" />Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Resend rejection email modal */}
      <Dialog open={resendRejectionOpen} onOpenChange={setResendRejectionOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resend Rejection Email — {partner.orgName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="text-gray-500">Optionally update the rejection reason before resending. Leave blank to use the default message.</p>
            <div>
              <Label>Rejection Reason</Label>
              <Textarea
                className="mt-1"
                rows={3}
                value={resendRejectionReason}
                onChange={(e) => setResendRejectionReason(e.target.value)}
                placeholder="Your application did not meet our current criteria."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setResendRejectionOpen(false)}>Cancel</Button>
            <Button className="bg-blue-600 hover:bg-blue-700 text-white" disabled={resendingRejection} onClick={resendRejection}>
              {resendingRejection ? <><RefreshCw className="w-3 h-3 animate-spin mr-1.5" />Sending…</> : <><MailCheck className="w-4 h-4 mr-1.5" />Send Email</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation modal */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-600">Delete Partner — {partner.orgName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="text-gray-700">
              This will <strong>permanently delete</strong> this partner along with all their conversion history and payout records. This action cannot be undone.
            </p>
            <p className="text-gray-500">Are you sure you want to proceed?</p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteConfirmOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={deletePartner}>
              <Trash2 className="w-4 h-4 mr-1.5" />Delete Permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
