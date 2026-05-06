import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  LayoutDashboard, Users, UserCheck, RefreshCw, Settings,
  ArrowRightLeft, DollarSign, LogOut, Search, ChevronUp, ChevronDown,
  ExternalLink, CheckCircle, XCircle, Eye, AlertCircle, FileText, Ban,
  Download, Calendar, PauseCircle, Trash2, Pencil, Check, X, MailCheck, Link
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";

// ── Admin fetch (cookie-based auth) ─────────────────────────────────────────
async function adminFetch(path: string, opts?: RequestInit) {
  return fetch(path, {
    ...opts,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(opts?.headers ?? {}) },
  });
}

function useAdminQuery<T>(key: string[], path: string, enabled = true) {
  const [, navigate] = useLocation();
  return useQuery<T>({
    queryKey: key,
    enabled,
    staleTime: 30_000,
    retry: (failureCount, error) => {
      if (error instanceof Error && error.message === "UNAUTHORIZED") return false;
      return failureCount < 2;
    },
    queryFn: async () => {
      const res = await adminFetch(path);
      if (res.status === 401) {
        navigate("/admin/referrals/login");
        throw new Error("UNAUTHORIZED");
      }
      if (!res.ok) throw new Error(await res.text());
      return res.json() as Promise<T>;
    },
  });
}

// ── Types ────────────────────────────────────────────────────────────────────
interface DashboardData {
  activePartners: number;
  pendingApplications: number;
  totalConversionsAllTime: number;
  quarterConversions: number;
  quarterGrossRevenueCents: number;
  quarterEstimatedPayoutsOwedCents: number;
  ytdPayoutsIssuedCents: number;
  top5Partners: { id: string; orgName: string; referralCode: string; quarterConversions: number }[];
  recentActivity: { type: string; label: string; at: string }[];
}

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
  proofDocumentPath: string | null;
  createdAt: string;
  approvedAt: string | null;
  activeConversions?: number;
  quarterConversions?: number;
  quarterNetRevenueCents?: number;
  estimatedQuarterPayoutCents?: number;
  lastConversionDate?: string | null;
}

interface Conversion {
  id: string;
  partnerId: string;
  partnerOrgName: string;
  referralCode: string;
  userId: string | null;
  tier: string | null;
  platform: string | null;
  grossPriceCents: number | null;
  netCents: number;
  estimatedPayoutCents: number;
  status: string;
  convertedAt: string;
}

interface PayoutHistory {
  id: string;
  partnerId: string;
  partnerOrgName: string;
  quarter: string;
  amountCents: number;
  method: string | null;
  reference: string | null;
  notes: string | null;
  paidAt: string;
}

interface PayoutOwed {
  partner: { id: string; orgName: string; referralCode: string; payoutRate: string };
  quarterConversions: number;
  grossRevenueCents: number;
  netRevenueCents: number;
  payoutRate: number;
  amountOwedCents: number;
  lastPayoutDate: string | null;
}

interface AdminSettings {
  default_payout_rate: string;
  platform_fee_percent: string;
  admin_notification_email: string;
  approval_email_template: string | null;
  rejection_email_template: string | null;
  magic_link_email_template: string | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmt$ = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString() : "—";
const statusColor = (s: string) =>
  s === "approved" ? "bg-green-100 text-green-800" :
  s === "pending"  ? "bg-yellow-100 text-yellow-800" :
  s === "active"   ? "bg-blue-100 text-blue-800" :
  "bg-red-100 text-red-800";
const truncate = (s: string | null | undefined, n = 20) =>
  s && s.length > n ? s.slice(0, n) + "…" : (s ?? "—");

function StatCard({ title, value, sub }: { title: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">{title}</p>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-12">
      <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
    </div>
  );
}

function ErrorMsg({ msg }: { msg: string }) {
  return (
    <Alert variant="destructive">
      <AlertCircle className="h-4 w-4" />
      <AlertDescription>{msg}</AlertDescription>
    </Alert>
  );
}

// ── Dashboard Tab ────────────────────────────────────────────────────────────
function DashboardTab() {
  const { data, isLoading, error } = useAdminQuery<DashboardData>(
    ["admin-referrals-dashboard"],
    "/api/admin/referrals/dashboard"
  );

  if (isLoading) return <LoadingSpinner />;
  if (error || !data) return <ErrorMsg msg={String(error)} />;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Active Partners" value={data.activePartners} />
        <StatCard title="Pending Applications" value={data.pendingApplications} sub="Awaiting review" />
        <StatCard title="All-Time Conversions" value={data.totalConversionsAllTime} />
        <StatCard title="Quarter Conversions" value={data.quarterConversions} />
        <StatCard title="Quarter Gross Revenue" value={fmt$(data.quarterGrossRevenueCents)} />
        <StatCard title="Est. Payouts Owed" value={fmt$(data.quarterEstimatedPayoutsOwedCents)} sub="This quarter" />
        <StatCard title="YTD Payouts Issued" value={fmt$(data.ytdPayoutsIssuedCents)} />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h3 className="font-semibold text-gray-800 mb-3">Top 5 Partners — This Quarter</h3>
          {data.top5Partners.length === 0 ? (
            <p className="text-sm text-gray-400">No conversions this quarter yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left pb-2 text-gray-500 font-medium">Org</th>
                  <th className="text-left pb-2 text-gray-500 font-medium">Code</th>
                  <th className="text-right pb-2 text-gray-500 font-medium">Conversions</th>
                </tr>
              </thead>
              <tbody>
                {data.top5Partners.map((p) => (
                  <tr key={p.id} className="border-b border-gray-50 last:border-0">
                    <td className="py-1.5 font-medium text-gray-800">{p.orgName}</td>
                    <td className="py-1.5 font-mono text-xs text-gray-500">{p.referralCode}</td>
                    <td className="py-1.5 text-right font-semibold text-blue-600">{p.quarterConversions}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h3 className="font-semibold text-gray-800 mb-3">Recent Activity</h3>
          {data.recentActivity.length === 0 ? (
            <p className="text-sm text-gray-400">No recent activity.</p>
          ) : (
            <ul className="space-y-2">
              {data.recentActivity.map((a, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span className={`mt-0.5 inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold
                    ${a.type === "conversion" ? "bg-blue-100 text-blue-700" :
                      a.type === "approval" ? "bg-green-100 text-green-700" :
                      "bg-yellow-100 text-yellow-700"}`}>
                    {a.type === "conversion" ? "C" : a.type === "approval" ? "✓" : "A"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-gray-700 truncate">{a.label}</p>
                    <p className="text-xs text-gray-400">{fmtDate(a.at)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Applications Tab ─────────────────────────────────────────────────────────
function ApplicationsTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selected, setSelected] = useState<Partner | null>(null);
  const [rejectModal, setRejectModal] = useState<Partner | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [payoutRateModal, setPayoutRateModal] = useState<Partner | null>(null);
  const [newRate, setNewRate] = useState("");
  const [loadingDoc, setLoadingDoc] = useState(false);
  const [editNotes, setEditNotes] = useState("");
  const [editCodeModal, setEditCodeModal] = useState<Partner | null>(null);
  const [newCode, setNewCode] = useState("");
  const [savingCode, setSavingCode] = useState(false);
  const [deleteModal, setDeleteModal] = useState<Partner | null>(null);
  const [resendRejectionModal, setResendRejectionModal] = useState<Partner | null>(null);
  const [resendRejectionReason, setResendRejectionReason] = useState("");
  const [resendingEmail, setResendingEmail] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  const params = new URLSearchParams();
  if (statusFilter !== "all") params.set("status", statusFilter);
  if (debouncedSearch) params.set("search", debouncedSearch);

  const { data: apps, isLoading } = useAdminQuery<Partner[]>(
    ["admin-referrals-applications", statusFilter, debouncedSearch],
    `/api/admin/referrals/applications?${params}`
  );

  async function approve(id: string) {
    const res = await adminFetch(`/api/admin/referrals/applications/${id}/approve`, { method: "POST" });
    const d = await res.json();
    if (res.ok) {
      toast({ title: "Approved!", description: `Referral code: ${d.referralCode}` });
      qc.invalidateQueries({ queryKey: ["admin-referrals-applications"] });
      qc.invalidateQueries({ queryKey: ["admin-referrals-dashboard"] });
      setSelected(null);
    } else {
      toast({ title: "Error", description: d.message, variant: "destructive" });
    }
  }

  async function reject(id: string) {
    if (!rejectReason.trim()) return;
    const res = await adminFetch(`/api/admin/referrals/applications/${id}/reject`, {
      method: "POST",
      body: JSON.stringify({ reason: rejectReason }),
    });
    const d = await res.json();
    if (res.ok) {
      toast({ title: "Rejected", description: "Application rejected and email sent." });
      qc.invalidateQueries({ queryKey: ["admin-referrals-applications"] });
      setRejectModal(null);
      setRejectReason("");
      setSelected(null);
    } else {
      toast({ title: "Error", description: d.message, variant: "destructive" });
    }
  }

  async function revoke(id: string) {
    if (!confirm("Revoke access for this partner?")) return;
    const res = await adminFetch(`/api/admin/referrals/partners/${id}/revoke`, { method: "POST" });
    if (res.ok) {
      toast({ title: "Access revoked" });
      qc.invalidateQueries({ queryKey: ["admin-referrals-applications"] });
      setSelected(null);
    }
  }

  async function suspend(id: string) {
    if (!confirm("Suspend and archive this partner? Their referral code will stop working and they will lose portal access.")) return;
    const res = await adminFetch(`/api/admin/referrals/partners/${id}/suspend`, { method: "POST" });
    if (res.ok) {
      toast({ title: "Partner suspended & archived" });
      qc.invalidateQueries({ queryKey: ["admin-referrals-applications"] });
      qc.invalidateQueries({ queryKey: ["admin-referrals-dashboard"] });
      setSelected(null);
    } else {
      const d = await res.json();
      toast({ title: d.message || "Failed to suspend", variant: "destructive" });
    }
  }

  async function saveReferralCode() {
    if (!editCodeModal) return;
    const code = newCode.trim().toUpperCase();
    if (!code) { toast({ title: "Code cannot be empty", variant: "destructive" }); return; }
    setSavingCode(true);
    const res = await adminFetch(`/api/admin/referrals/partners/${editCodeModal.id}/referral-code`, {
      method: "PATCH",
      body: JSON.stringify({ referralCode: code }),
    });
    setSavingCode(false);
    if (res.ok) {
      toast({ title: "Referral code updated" });
      qc.invalidateQueries({ queryKey: ["admin-referrals-applications"] });
      setEditCodeModal(null);
    } else {
      const d = await res.json();
      toast({ title: d.message || "Failed to update code", variant: "destructive" });
    }
  }

  async function deletePartner(id: string) {
    const res = await adminFetch(`/api/admin/referrals/partners/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast({ title: "Partner deleted" });
      qc.invalidateQueries({ queryKey: ["admin-referrals-applications"] });
      qc.invalidateQueries({ queryKey: ["admin-referrals-dashboard"] });
      setDeleteModal(null);
      setSelected(null);
    } else {
      const d = await res.json();
      toast({ title: d.message || "Failed to delete", variant: "destructive" });
    }
  }

  async function resendWelcome(id: string) {
    setResendingEmail(`welcome-${id}`);
    const res = await adminFetch(`/api/admin/referrals/partners/${id}/resend-welcome`, { method: "POST" });
    setResendingEmail(null);
    if (res.ok) toast({ title: "Welcome email resent!" });
    else { const d = await res.json(); toast({ title: d.message || "Failed", variant: "destructive" }); }
  }

  async function resendLogin(id: string) {
    setResendingEmail(`login-${id}`);
    const res = await adminFetch(`/api/admin/referrals/partners/${id}/resend-login`, { method: "POST" });
    setResendingEmail(null);
    if (res.ok) toast({ title: "Login link sent!" });
    else { const d = await res.json(); toast({ title: d.message || "Failed", variant: "destructive" }); }
  }

  async function resendRejection() {
    if (!resendRejectionModal) return;
    setResendingEmail(`rejection-${resendRejectionModal.id}`);
    const res = await adminFetch(`/api/admin/referrals/partners/${resendRejectionModal.id}/resend-rejection`, {
      method: "POST",
      body: JSON.stringify({ reason: resendRejectionReason.trim() || undefined }),
    });
    setResendingEmail(null);
    if (res.ok) {
      toast({ title: "Rejection email resent!" });
      setResendRejectionModal(null);
      setResendRejectionReason("");
    } else {
      const d = await res.json();
      toast({ title: d.message || "Failed", variant: "destructive" });
    }
  }

  async function saveNotes(id: string, notes: string) {
    await adminFetch(`/api/admin/referrals/partners/${id}/notes`, {
      method: "PATCH",
      body: JSON.stringify({ adminNotes: notes }),
    });
  }

  async function savePayoutRate(id: string) {
    const rate = parseFloat(newRate);
    if (isNaN(rate) || rate < 0 || rate > 1) {
      toast({ title: "Invalid rate", description: "Enter a decimal between 0 and 1 (e.g. 0.20)", variant: "destructive" });
      return;
    }
    const res = await adminFetch(`/api/admin/referrals/partners/${id}/payout-rate`, {
      method: "PATCH",
      body: JSON.stringify({ payoutRate: rate }),
    });
    if (res.ok) {
      toast({ title: "Payout rate updated" });
      qc.invalidateQueries({ queryKey: ["admin-referrals-applications"] });
      setPayoutRateModal(null);
    }
  }

  async function viewDoc(id: string) {
    setLoadingDoc(true);
    const res = await adminFetch(`/api/admin/referrals/applications/${id}/document`);
    setLoadingDoc(false);
    if (res.ok) {
      const d = await res.json();
      window.open(d.url, "_blank");
    } else {
      toast({ title: "No document found", variant: "destructive" });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search org name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? <LoadingSpinner /> : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">Org Name</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium hidden sm:table-cell">Contact</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium hidden md:table-cell">Email</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium hidden lg:table-cell">Type</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium hidden xl:table-cell">Hockey Affil.</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">Status</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium hidden sm:table-cell">Applied</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(apps ?? []).map((app) => (
                  <tr key={app.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                    <td className="px-4 py-3 font-medium text-gray-800">{app.orgName}</td>
                    <td className="px-4 py-3 text-gray-600 hidden sm:table-cell">{app.contactName}</td>
                    <td className="px-4 py-3 text-gray-500 hidden md:table-cell">{app.email}</td>
                    <td className="px-4 py-3 text-gray-500 hidden lg:table-cell">{app.orgType}</td>
                    <td className="px-4 py-3 text-gray-500 hidden xl:table-cell" title={app.hockeyAffiliation ?? ""}>
                      {truncate(app.hockeyAffiliation, 22)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(app.status)}`}>
                        {app.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-400 hidden sm:table-cell text-xs">{fmtDate(app.createdAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setSelected(app); setEditNotes(app.adminNotes || ""); }}>
                          <Eye className="w-3 h-3 mr-1" />Details
                        </Button>
                        {app.status === "pending" && (
                          <>
                            <Button size="sm" className="h-7 text-xs bg-green-600 hover:bg-green-700 text-white" onClick={() => approve(app.id)}>
                              <CheckCircle className="w-3 h-3 mr-1" />Approve
                            </Button>
                            <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => setRejectModal(app)}>
                              <XCircle className="w-3 h-3 mr-1" />Reject
                            </Button>
                          </>
                        )}
                        {app.status === "approved" && (
                          <>
                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setEditCodeModal(app); setNewCode(app.referralCode || ""); }}>
                              <Pencil className="w-3 h-3 mr-1" />Code
                            </Button>
                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setPayoutRateModal(app); setNewRate(app.payoutRate); }}>
                              <DollarSign className="w-3 h-3 mr-1" />Rate
                            </Button>
                            <Button size="sm" variant="outline" className="h-7 text-xs text-orange-600 border-orange-200 hover:bg-orange-50" onClick={() => suspend(app.id)}>
                              <PauseCircle className="w-3 h-3 mr-1" />Suspend
                            </Button>
                            <Button size="sm" variant="outline" className="h-7 text-xs text-red-600 border-red-200 hover:bg-red-50" onClick={() => setDeleteModal(app)}>
                              <Trash2 className="w-3 h-3 mr-1" />Delete
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {(apps ?? []).length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">No applications found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Detail modal */}
      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selected?.orgName}</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-gray-500">Contact</Label><p className="mt-0.5">{selected.contactName}</p></div>
                <div><Label className="text-gray-500">Email</Label><p className="mt-0.5">{selected.email}</p></div>
                <div><Label className="text-gray-500">Org Type</Label><p className="mt-0.5">{selected.orgType}</p></div>
                <div>
                  <Label className="text-gray-500">Status</Label>
                  <span className={`inline-flex mt-0.5 items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(selected.status)}`}>
                    {selected.status}
                  </span>
                </div>
                <div className="col-span-2">
                  <Label className="text-gray-500">Hockey Affiliation</Label>
                  <p className="mt-0.5">{selected.hockeyAffiliation || "—"}</p>
                </div>
                {selected.referralCode && (
                  <div>
                    <Label className="text-gray-500">Referral Code</Label>
                    <p className="mt-0.5 font-mono font-bold text-blue-600">{selected.referralCode}</p>
                  </div>
                )}
                <div><Label className="text-gray-500">Payout Rate</Label><p className="mt-0.5">{(parseFloat(selected.payoutRate) * 100).toFixed(0)}%</p></div>
                <div><Label className="text-gray-500">Applied</Label><p className="mt-0.5">{fmtDate(selected.createdAt)}</p></div>
                {selected.approvedAt && (
                  <div><Label className="text-gray-500">Approved</Label><p className="mt-0.5">{fmtDate(selected.approvedAt)}</p></div>
                )}
              </div>
              {selected.proofDocumentPath && (
                <Button variant="outline" size="sm" disabled={loadingDoc} onClick={() => viewDoc(selected.id)}>
                  <FileText className="w-4 h-4 mr-2" />View Document
                  {loadingDoc && <RefreshCw className="w-3 h-3 ml-2 animate-spin" />}
                </Button>
              )}
              <div>
                <Label className="text-gray-500">Admin Notes</Label>
                <Textarea
                  className="mt-1"
                  rows={3}
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  onBlur={() => saveNotes(selected.id, editNotes)}
                  placeholder="Internal notes (auto-saved on blur)…"
                />
              </div>
              <div className="flex gap-2 flex-wrap pt-2">
                {selected.status === "pending" && (
                  <>
                    <Button className="bg-green-600 hover:bg-green-700 text-white" onClick={() => approve(selected.id)}>
                      <CheckCircle className="w-4 h-4 mr-2" />Approve
                    </Button>
                    <Button variant="destructive" onClick={() => { setRejectModal(selected); setSelected(null); }}>
                      <XCircle className="w-4 h-4 mr-2" />Reject
                    </Button>
                  </>
                )}
                {selected.status === "approved" && (
                  <>
                    <Button variant="outline" disabled={resendingEmail === `welcome-${selected.id}`} onClick={() => resendWelcome(selected.id)}>
                      {resendingEmail === `welcome-${selected.id}` ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <MailCheck className="w-4 h-4 mr-2" />}Resend Welcome
                    </Button>
                    <Button variant="outline" disabled={resendingEmail === `login-${selected.id}`} onClick={() => resendLogin(selected.id)}>
                      {resendingEmail === `login-${selected.id}` ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Link className="w-4 h-4 mr-2" />}Send Password Reset
                    </Button>
                    <Button variant="outline" onClick={() => { setEditCodeModal(selected); setNewCode(selected.referralCode || ""); setSelected(null); }}>
                      <Pencil className="w-4 h-4 mr-2" />Edit Code
                    </Button>
                    <Button variant="outline" onClick={() => { setPayoutRateModal(selected); setNewRate(selected.payoutRate); setSelected(null); }}>
                      <DollarSign className="w-4 h-4 mr-2" />Edit Payout Rate
                    </Button>
                    <Button variant="outline" className="text-orange-600 border-orange-200 hover:bg-orange-50" onClick={() => suspend(selected.id)}>
                      <PauseCircle className="w-4 h-4 mr-2" />Suspend & Archive
                    </Button>
                    <Button variant="outline" className="text-red-600 border-red-200 hover:bg-red-50" onClick={() => { setDeleteModal(selected); setSelected(null); }}>
                      <Trash2 className="w-4 h-4 mr-2" />Delete Partner
                    </Button>
                  </>
                )}
                {(selected.status === "rejected" || selected.status === "suspended") && (
                  <Button variant="outline" disabled={resendingEmail === `rejection-${selected.id}`} onClick={() => { setResendRejectionModal(selected); setSelected(null); }}>
                    {resendingEmail === `rejection-${selected.id}` ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <MailCheck className="w-4 h-4 mr-2" />}Resend Rejection Email
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Reject modal */}
      <Dialog open={!!rejectModal} onOpenChange={() => setRejectModal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Application — {rejectModal?.orgName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Label>Rejection Reason <span className="text-red-500">*</span></Label>
            <Textarea
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Explain why the application was rejected…"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRejectModal(null)}>Cancel</Button>
            <Button variant="destructive" disabled={!rejectReason.trim()} onClick={() => rejectModal && reject(rejectModal.id)}>
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Resend rejection email modal */}
      <Dialog open={!!resendRejectionModal} onOpenChange={() => setResendRejectionModal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resend Rejection Email — {resendRejectionModal?.orgName}</DialogTitle>
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
            <Button variant="ghost" onClick={() => setResendRejectionModal(null)}>Cancel</Button>
            <Button
              className="bg-blue-600 hover:bg-blue-700 text-white"
              disabled={!!resendingEmail}
              onClick={resendRejection}
            >
              {resendingEmail ? <><RefreshCw className="w-3 h-3 animate-spin mr-1.5" />Sending…</> : <><MailCheck className="w-4 h-4 mr-1.5" />Send Email</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit referral code modal */}
      <Dialog open={!!editCodeModal} onOpenChange={() => setEditCodeModal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Referral Code — {editCodeModal?.orgName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>New Referral Code (3–16 alphanumeric characters)</Label>
            <Input
              className="font-mono uppercase"
              value={newCode}
              onChange={(e) => setNewCode(e.target.value.toUpperCase())}
              maxLength={16}
              placeholder="e.g. MYCOURT25"
              onKeyDown={(e) => { if (e.key === "Enter") saveReferralCode(); }}
            />
            <p className="text-xs text-gray-400">Letters and numbers only. Will be stored in UPPERCASE.</p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditCodeModal(null)}>Cancel</Button>
            <Button className="bg-blue-600 hover:bg-blue-700 text-white" disabled={savingCode} onClick={saveReferralCode}>
              {savingCode ? <><RefreshCw className="w-3 h-3 animate-spin mr-1.5" />Saving…</> : <>
                <Check className="w-4 h-4 mr-1.5" />Save Code
              </>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete partner confirmation modal */}
      <Dialog open={!!deleteModal} onOpenChange={() => setDeleteModal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-600">Delete Partner — {deleteModal?.orgName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="text-gray-700">
              This will <strong>permanently delete</strong> this partner along with all their conversion history and payout records. This action cannot be undone.
            </p>
            <p className="text-gray-500">Are you sure you want to proceed?</p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteModal(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteModal && deletePartner(deleteModal.id)}>
              <Trash2 className="w-4 h-4 mr-1.5" />Delete Permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payout rate modal */}
      <Dialog open={!!payoutRateModal} onOpenChange={() => setPayoutRateModal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Payout Rate — {payoutRateModal?.orgName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Payout Rate (0–1 decimal, e.g. 0.20 = 20%)</Label>
            <Input type="number" step="0.01" min="0" max="1" value={newRate} onChange={(e) => setNewRate(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPayoutRateModal(null)}>Cancel</Button>
            <Button className="bg-blue-600 hover:bg-blue-700 text-white" onClick={() => payoutRateModal && savePayoutRate(payoutRateModal.id)}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── All Partners Tab ─────────────────────────────────────────────────────────
function AllPartnersTab() {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sortCol, setSortCol] = useState<keyof Partner>("approvedAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  const params = new URLSearchParams();
  if (debouncedSearch) params.set("search", debouncedSearch);

  const { data: partners, isLoading } = useAdminQuery<Partner[]>(
    ["admin-referrals-partners", debouncedSearch],
    `/api/admin/referrals/partners?${params}`
  );

  function toggleSort(col: keyof Partner) {
    if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortCol(col); setSortDir("desc"); }
  }

  const sorted = [...(partners ?? [])].sort((a, b) => {
    const av = a[sortCol] ?? 0;
    const bv = b[sortCol] ?? 0;
    const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true });
    return sortDir === "asc" ? cmp : -cmp;
  });

  function SortIcon({ col }: { col: keyof Partner }) {
    if (sortCol !== col) return null;
    return sortDir === "asc" ? <ChevronUp className="inline w-3 h-3 ml-0.5" /> : <ChevronDown className="inline w-3 h-3 ml-0.5" />;
  }

  function Th({ col, label }: { col: keyof Partner; label: string }) {
    return (
      <th
        className="text-left px-4 py-3 text-gray-500 font-medium cursor-pointer hover:text-gray-800 select-none"
        onClick={() => toggleSort(col)}
      >
        {label}<SortIcon col={col} />
      </th>
    );
  }

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          placeholder="Search org or code…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {isLoading ? <LoadingSpinner /> : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <Th col="orgName" label="Org Name" />
                  <Th col="referralCode" label="Code" />
                  <Th col="approvedAt" label="Approved" />
                  <Th col="activeConversions" label="Active Conv." />
                  <Th col="quarterConversions" label="Qtr Conv." />
                  <Th col="quarterNetRevenueCents" label="Qtr Net Rev." />
                  <Th col="estimatedQuarterPayoutCents" label="Est. Payout" />
                  <Th col="lastConversionDate" label="Last Conv." />
                  <Th col={"totalReferred" as keyof Partner} label="Referred" />
                  <Th col={"totalPaidUsers" as keyof Partner} label="Paid" />
                  <Th col={"conversionRate" as keyof Partner} label="Conv.%" />
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((p) => (
                  <tr
                    key={p.id}
                    className="border-b border-gray-50 last:border-0 hover:bg-blue-50/30 cursor-pointer"
                    onClick={() => navigate(`/admin/referrals/partner/${p.id}`)}
                  >
                    <td className="px-4 py-3 font-medium text-gray-800">{p.orgName}</td>
                    <td className="px-4 py-3 font-mono text-xs text-blue-600">{p.referralCode ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{fmtDate(p.approvedAt)}</td>
                    <td className="px-4 py-3 text-center">{p.activeConversions ?? 0}</td>
                    <td className="px-4 py-3 text-center">{p.quarterConversions ?? 0}</td>
                    <td className="px-4 py-3">{p.quarterNetRevenueCents !== undefined ? fmt$(p.quarterNetRevenueCents) : "—"}</td>
                    <td className="px-4 py-3">{p.estimatedQuarterPayoutCents !== undefined ? fmt$(p.estimatedQuarterPayoutCents) : "—"}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{fmtDate(p.lastConversionDate)}</td>
                    <td className="px-4 py-3 text-center">{(p as any).totalReferred ?? 0}</td>
                    <td className="px-4 py-3 text-center">{(p as any).totalPaidUsers ?? 0}</td>
                    <td className="px-4 py-3 text-center">{(p as any).conversionRate ?? 0}%</td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => navigate(`/admin/referrals/partner/${p.id}`)}>
                        <ExternalLink className="w-3 h-3 mr-1" />Detail
                      </Button>
                    </td>
                  </tr>
                ))}
                {sorted.length === 0 && (
                  <tr><td colSpan={12} className="px-4 py-8 text-center text-gray-400">No approved partners yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Conversions Tab ──────────────────────────────────────────────────────────
function ConversionsTab() {
  const { toast } = useToast();
  const [partnerId, setPartnerId] = useState("");
  const [platform, setPlatform] = useState("all");
  const [status, setStatus] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const params = new URLSearchParams();
  if (partnerId) params.set("partnerId", partnerId);
  if (platform !== "all") params.set("platform", platform);
  if (status !== "all") params.set("status", status);
  if (from) params.set("from", from);
  if (to) params.set("to", to);

  const { data: conversions, isLoading } = useAdminQuery<Conversion[]>(
    ["admin-referrals-conversions", partnerId, platform, status, from, to],
    `/api/admin/referrals/conversions?${params}`
  );

  const { data: partners } = useAdminQuery<Partner[]>(
    ["admin-referrals-partners-list"],
    `/api/admin/referrals/partners`
  );

  async function exportCsv() {
    const p = new URLSearchParams(params);
    p.set("exportCsv", "true");
    try {
      const res = await adminFetch(`/api/admin/referrals/conversions?${p}`);
      if (!res.ok) {
        toast({ title: "Export failed", description: `Server error ${res.status}`, variant: "destructive" });
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "referral-conversions.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: "Export failed", variant: "destructive" });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <Select value={partnerId || "all"} onValueChange={(v) => setPartnerId(v === "all" ? "" : v)}>
          <SelectTrigger className="w-44"><SelectValue placeholder="All Partners" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Partners</SelectItem>
            {(partners ?? []).map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.orgName}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={platform} onValueChange={setPlatform}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Platforms</SelectItem>
            <SelectItem value="ios">iOS</SelectItem>
            <SelectItem value="android">Android</SelectItem>
            <SelectItem value="web">Web</SelectItem>
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
            <SelectItem value="refunded">Refunded</SelectItem>
          </SelectContent>
        </Select>
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-36" />
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-36" />
        <Button variant="outline" size="sm" onClick={exportCsv}>Export CSV</Button>
      </div>

      {isLoading ? <LoadingSpinner /> : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">Date</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">Partner</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">Code</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium hidden md:table-cell">User ID</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium hidden sm:table-cell">Tier</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium hidden sm:table-cell">Platform</th>
                  <th className="text-right px-4 py-3 text-gray-500 font-medium">Gross</th>
                  <th className="text-right px-4 py-3 text-gray-500 font-medium hidden md:table-cell">Net</th>
                  <th className="text-right px-4 py-3 text-gray-500 font-medium hidden lg:table-cell">Est. Payout</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {(conversions ?? []).map((c) => (
                  <tr key={c.id} className="border-b border-gray-50 last:border-0">
                    <td className="px-4 py-2.5 text-xs text-gray-400">{fmtDate(c.convertedAt)}</td>
                    <td className="px-4 py-2.5 font-medium text-gray-700">{c.partnerOrgName}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-blue-600">{c.referralCode}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-400 hidden md:table-cell">{c.userId || "—"}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-500 hidden sm:table-cell">{c.tier || "—"}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-500 hidden sm:table-cell">{c.platform || "—"}</td>
                    <td className="px-4 py-2.5 text-right">{c.grossPriceCents != null ? fmt$(c.grossPriceCents) : "—"}</td>
                    <td className="px-4 py-2.5 text-right hidden md:table-cell">{fmt$(c.netCents)}</td>
                    <td className="px-4 py-2.5 text-right hidden lg:table-cell text-blue-600">{fmt$(c.estimatedPayoutCents)}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(c.status)}`}>{c.status}</span>
                    </td>
                  </tr>
                ))}
                {(conversions ?? []).length === 0 && (
                  <tr><td colSpan={10} className="px-4 py-8 text-center text-gray-400">No conversions found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Payouts Tab ──────────────────────────────────────────────────────────────
function PayoutsTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [view, setView] = useState<"owed" | "history">("owed");
  const [recordModal, setRecordModal] = useState<PayoutOwed | null>(null);
  const [form, setForm] = useState({ quarter: "", amountCents: "", method: "", reference: "", notes: "" });

  const { data: owed, isLoading: owedLoading } = useAdminQuery<{ quarter: string; rows: PayoutOwed[] }>(
    ["admin-referrals-payouts-owed"],
    "/api/admin/referrals/payouts/owed",
    view === "owed"
  );

  const { data: history, isLoading: histLoading } = useAdminQuery<PayoutHistory[]>(
    ["admin-referrals-payouts-history"],
    "/api/admin/referrals/payouts/history",
    view === "history"
  );

  async function recordPayout() {
    if (!recordModal) return;
    if (!form.quarter || !form.amountCents) {
      toast({ title: "Quarter and amount are required", variant: "destructive" }); return;
    }
    const res = await adminFetch(`/api/admin/referrals/partners/${recordModal.partner.id}/payouts`, {
      method: "POST",
      body: JSON.stringify({ ...form, amountCents: Math.round(parseFloat(form.amountCents) * 100) }),
    });
    if (res.ok) {
      toast({ title: "Payout recorded!" });
      qc.invalidateQueries({ queryKey: ["admin-referrals-payouts-owed"] });
      qc.invalidateQueries({ queryKey: ["admin-referrals-payouts-history"] });
      setRecordModal(null);
      setForm({ quarter: "", amountCents: "", method: "", reference: "", notes: "" });
    } else {
      const d = await res.json();
      toast({ title: d.message || "Failed", variant: "destructive" });
    }
  }

  async function exportHistory() {
    try {
      const res = await adminFetch("/api/admin/referrals/payouts/history?exportCsv=true");
      if (!res.ok) {
        toast({ title: "Export failed", description: `Server error ${res.status}`, variant: "destructive" });
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "referral-payouts.csv"; a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: "Export failed", variant: "destructive" });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button
          variant={view === "owed" ? "default" : "outline"}
          size="sm"
          onClick={() => setView("owed")}
          className={view === "owed" ? "bg-blue-600 text-white" : ""}
        >
          Owed
        </Button>
        <Button
          variant={view === "history" ? "default" : "outline"}
          size="sm"
          onClick={() => setView("history")}
          className={view === "history" ? "bg-blue-600 text-white" : ""}
        >
          History
        </Button>
        {view === "history" && (
          <Button variant="outline" size="sm" onClick={exportHistory} className="ml-auto">Export CSV</Button>
        )}
      </div>

      {view === "owed" && (
        owedLoading ? <LoadingSpinner /> : (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            {owed && (
              <div className="px-4 py-3 bg-blue-50 border-b border-blue-100 text-sm font-medium text-blue-700">
                Quarter: {owed.quarter}
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 text-gray-500 font-medium">Partner</th>
                    <th className="text-left px-4 py-3 text-gray-500 font-medium hidden sm:table-cell">Code</th>
                    <th className="text-right px-4 py-3 text-gray-500 font-medium">Conv.</th>
                    <th className="text-right px-4 py-3 text-gray-500 font-medium hidden md:table-cell">Gross Rev.</th>
                    <th className="text-right px-4 py-3 text-gray-500 font-medium">Rate</th>
                    <th className="text-right px-4 py-3 text-gray-500 font-medium">Owed</th>
                    <th className="text-left px-4 py-3 text-gray-500 font-medium hidden lg:table-cell">Last Payout</th>
                    <th className="text-left px-4 py-3 text-gray-500 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {(owed?.rows ?? []).map((row) => (
                    <tr key={row.partner.id} className="border-b border-gray-50 last:border-0">
                      <td className="px-4 py-2.5 font-medium text-gray-800">{row.partner.orgName}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-blue-600 hidden sm:table-cell">{row.partner.referralCode}</td>
                      <td className="px-4 py-2.5 text-right">{row.quarterConversions}</td>
                      <td className="px-4 py-2.5 text-right hidden md:table-cell">{fmt$(row.grossRevenueCents)}</td>
                      <td className="px-4 py-2.5 text-right">{(row.payoutRate * 100).toFixed(0)}%</td>
                      <td className="px-4 py-2.5 text-right font-semibold text-blue-700">{fmt$(row.amountOwedCents)}</td>
                      <td className="px-4 py-2.5 text-xs text-gray-400 hidden lg:table-cell">{fmtDate(row.lastPayoutDate)}</td>
                      <td className="px-4 py-2.5">
                        <Button
                          size="sm"
                          className="h-7 text-xs bg-blue-600 hover:bg-blue-700 text-white"
                          onClick={() => {
                            setRecordModal(row);
                            setForm({ quarter: owed?.quarter || "", amountCents: (row.amountOwedCents / 100).toFixed(2), method: "", reference: "", notes: "" });
                          }}
                        >
                          Record Payout
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {(owed?.rows ?? []).length === 0 && (
                    <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">No partners found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      {view === "history" && (
        histLoading ? <LoadingSpinner /> : (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 text-gray-500 font-medium">Date Paid</th>
                    <th className="text-left px-4 py-3 text-gray-500 font-medium">Partner</th>
                    <th className="text-left px-4 py-3 text-gray-500 font-medium">Quarter</th>
                    <th className="text-right px-4 py-3 text-gray-500 font-medium">Amount</th>
                    <th className="text-left px-4 py-3 text-gray-500 font-medium hidden md:table-cell">Method</th>
                    <th className="text-left px-4 py-3 text-gray-500 font-medium hidden lg:table-cell">Reference</th>
                  </tr>
                </thead>
                <tbody>
                  {(history ?? []).map((p) => (
                    <tr key={p.id} className="border-b border-gray-50 last:border-0">
                      <td className="px-4 py-2.5 text-xs text-gray-400">{fmtDate(p.paidAt)}</td>
                      <td className="px-4 py-2.5 font-medium text-gray-700">{p.partnerOrgName}</td>
                      <td className="px-4 py-2.5 text-gray-500">{p.quarter}</td>
                      <td className="px-4 py-2.5 text-right font-semibold text-green-700">{fmt$(p.amountCents)}</td>
                      <td className="px-4 py-2.5 text-gray-500 hidden md:table-cell">{p.method || "—"}</td>
                      <td className="px-4 py-2.5 text-gray-400 font-mono text-xs hidden lg:table-cell">{p.reference || "—"}</td>
                    </tr>
                  ))}
                  {(history ?? []).length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No payouts recorded yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      {/* Record Payout modal */}
      <Dialog open={!!recordModal} onOpenChange={() => setRecordModal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Payout — {recordModal?.partner.orgName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div>
              <Label>Quarter <span className="text-red-500">*</span></Label>
              <Input className="mt-1" value={form.quarter} onChange={(e) => setForm((f) => ({ ...f, quarter: e.target.value }))} placeholder="e.g. 2025-Q1" />
            </div>
            <div>
              <Label>Amount ($) <span className="text-red-500">*</span></Label>
              <Input className="mt-1" type="number" step="0.01" value={form.amountCents} onChange={(e) => setForm((f) => ({ ...f, amountCents: e.target.value }))} />
            </div>
            <div>
              <Label>Method</Label>
              <Input className="mt-1" value={form.method} onChange={(e) => setForm((f) => ({ ...f, method: e.target.value }))} placeholder="e.g. PayPal, Check, Wire" />
            </div>
            <div>
              <Label>Reference #</Label>
              <Input className="mt-1" value={form.reference} onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))} placeholder="Transaction ID or check number" />
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea className="mt-1" rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRecordModal(null)}>Cancel</Button>
            <Button className="bg-blue-600 hover:bg-blue-700 text-white" onClick={recordPayout}>Record</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Settings Tab ─────────────────────────────────────────────────────────────
function SettingsTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: settings, isLoading } = useAdminQuery<AdminSettings>(
    ["admin-referrals-settings"],
    "/api/admin/referrals/settings"
  );
  const [form, setForm] = useState<AdminSettings | null>(null);

  useEffect(() => {
    if (settings && !form) setForm(settings);
  }, [settings]);

  async function save() {
    if (!form) return;
    const res = await adminFetch("/api/admin/referrals/settings", {
      method: "PATCH",
      body: JSON.stringify(form),
    });
    if (res.ok) {
      toast({ title: "Settings saved!" });
      qc.invalidateQueries({ queryKey: ["admin-referrals-settings"] });
    } else {
      toast({ title: "Save failed", variant: "destructive" });
    }
  }

  if (isLoading || !form) return <LoadingSpinner />;

  return (
    <div className="max-w-2xl space-y-6">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-4">
        <h3 className="font-semibold text-gray-800">Program Settings</h3>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label>Default Payout Rate (0–1)</Label>
            <Input
              className="mt-1"
              type="number"
              step="0.01"
              min="0"
              max="1"
              value={form.default_payout_rate}
              onChange={(e) => setForm((f) => f ? { ...f, default_payout_rate: e.target.value } : f)}
            />
            <p className="text-xs text-gray-400 mt-0.5">e.g. 0.20 = 20%</p>
          </div>
          <div>
            <Label>Platform Fee %</Label>
            <Input
              className="mt-1"
              type="number"
              step="0.1"
              min="0"
              max="100"
              value={form.platform_fee_percent}
              onChange={(e) => setForm((f) => f ? { ...f, platform_fee_percent: e.target.value } : f)}
            />
            <p className="text-xs text-gray-400 mt-0.5">e.g. 15 = 15%</p>
          </div>
          <div className="sm:col-span-2">
            <Label>Admin Notification Email</Label>
            <Input
              className="mt-1"
              type="email"
              value={form.admin_notification_email}
              onChange={(e) => setForm((f) => f ? { ...f, admin_notification_email: e.target.value } : f)}
            />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-4">
        <h3 className="font-semibold text-gray-800">Email Templates</h3>
        <p className="text-xs text-gray-500">Leave blank to use system defaults.</p>
        <div>
          <Label>Approval Email Template</Label>
          <Textarea
            className="mt-1 font-mono text-xs"
            rows={6}
            value={form.approval_email_template || ""}
            onChange={(e) => setForm((f) => f ? { ...f, approval_email_template: e.target.value } : f)}
            placeholder="Hi {{contactName}}, Congratulations! Your referral code is: {{referralCode}}…"
          />
        </div>
        <div>
          <Label>Rejection Email Template</Label>
          <Textarea
            className="mt-1 font-mono text-xs"
            rows={6}
            value={form.rejection_email_template || ""}
            onChange={(e) => setForm((f) => f ? { ...f, rejection_email_template: e.target.value } : f)}
            placeholder="Hi {{contactName}}, Unfortunately we were unable to approve your application…"
          />
        </div>
        <div>
          <Label>Magic Link Email Template</Label>
          <Textarea
            className="mt-1 font-mono text-xs"
            rows={6}
            value={form.magic_link_email_template || ""}
            onChange={(e) => setForm((f) => f ? { ...f, magic_link_email_template: e.target.value } : f)}
            placeholder="Hi {{contactName}}, Click the link to access your partner portal: {{link}}…"
          />
        </div>
      </div>

      <Button className="bg-blue-600 hover:bg-blue-700 text-white" onClick={save}>
        Save Settings
      </Button>
    </div>
  );
}

// ── Reports Tab ──────────────────────────────────────────────────────────────
function ReportsTab() {
  const { toast } = useToast();
  const { data: partners } = useAdminQuery<Partner[]>(
    ["admin-referrals-partners-report"],
    "/api/admin/referrals/partners"
  );

  const today = new Date().toISOString().slice(0, 10);
  const firstOfYear = `${new Date().getFullYear()}-01-01`;

  const [from, setFrom] = useState(firstOfYear);
  const [to, setTo] = useState(today);
  const [partnerId, setPartnerId] = useState("all");
  const [sections, setSections] = useState<string[]>(["partners", "conversions", "payouts"]);
  const [loading, setLoading] = useState(false);

  const SECTION_OPTIONS = [
    { id: "partners",    label: "Partners Summary",  desc: "All approved partners with stats for the date range" },
    { id: "conversions", label: "Conversions",        desc: "Every subscription conversion with revenue & payout columns" },
    { id: "payouts",     label: "Payouts History",    desc: "All recorded partner payouts in the date range" },
  ];

  function toggleSection(id: string) {
    setSections((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  }

  function setPreset(preset: "ytd" | "q1" | "q2" | "q3" | "q4" | "last30" | "last90") {
    const now = new Date();
    const yr = now.getFullYear();
    if (preset === "ytd") { setFrom(`${yr}-01-01`); setTo(today); }
    else if (preset === "last30") {
      const d = new Date(); d.setDate(d.getDate() - 30);
      setFrom(d.toISOString().slice(0, 10)); setTo(today);
    }
    else if (preset === "last90") {
      const d = new Date(); d.setDate(d.getDate() - 90);
      setFrom(d.toISOString().slice(0, 10)); setTo(today);
    }
    else {
      const qMap: Record<string, [string, string]> = {
        q1: [`${yr}-01-01`, `${yr}-03-31`],
        q2: [`${yr}-04-01`, `${yr}-06-30`],
        q3: [`${yr}-07-01`, `${yr}-09-30`],
        q4: [`${yr}-10-01`, `${yr}-12-31`],
      };
      setFrom(qMap[preset][0]); setTo(qMap[preset][1]);
    }
  }

  async function downloadReport() {
    if (sections.length === 0) {
      toast({ title: "Select at least one section", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      if (partnerId !== "all") params.set("partnerId", partnerId);
      params.set("sections", sections.join(","));

      const res = await adminFetch(`/api/admin/referrals/reports/export?${params}`);
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast({ title: "Export failed", description: d.message || `Error ${res.status}`, variant: "destructive" });
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const partnerLabel = partnerId !== "all"
        ? `-${(partners ?? []).find((p) => p.id === partnerId)?.orgName?.replace(/\s+/g, "-") || partnerId}`
        : "";
      a.href = url;
      a.download = `referral-report${partnerLabel}-${from}-to-${to}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Report downloaded!" });
    } catch {
      toast({ title: "Export failed", description: "Network error", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-5">
        <h3 className="font-semibold text-gray-800 text-base">Generate CSV Report</h3>
        <p className="text-sm text-gray-500 -mt-3">
          Download a multi-section spreadsheet covering partners, conversions, and payouts — all in one file.
        </p>

        {/* Date range */}
        <div>
          <Label className="flex items-center gap-1.5 text-gray-700 mb-2">
            <Calendar className="w-3.5 h-3.5" />Date Range
          </Label>
          <div className="flex flex-wrap gap-2 mb-3">
            {[
              { label: "Last 30 days", id: "last30" },
              { label: "Last 90 days", id: "last90" },
              { label: "YTD", id: "ytd" },
              { label: "Q1", id: "q1" },
              { label: "Q2", id: "q2" },
              { label: "Q3", id: "q3" },
              { label: "Q4", id: "q4" },
            ].map((p) => (
              <button
                key={p.id}
                onClick={() => setPreset(p.id as Parameters<typeof setPreset>[0])}
                className="px-3 py-1 text-xs font-medium rounded-full border border-gray-200 text-gray-600 hover:border-blue-400 hover:text-blue-600 transition-colors"
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <Label className="text-xs text-gray-500">From</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1" />
            </div>
            <div className="flex-1">
              <Label className="text-xs text-gray-500">To</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1" />
            </div>
          </div>
        </div>

        {/* Partner filter */}
        <div>
          <Label className="text-gray-700 mb-2 block">Partner Filter</Label>
          <Select value={partnerId} onValueChange={setPartnerId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="All Partners" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Partners</SelectItem>
              {(partners ?? []).map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.orgName} {p.referralCode ? `(${p.referralCode})` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-gray-400 mt-1">Leave as "All Partners" to include every partner in the report.</p>
        </div>

        {/* Section toggles */}
        <div>
          <Label className="text-gray-700 mb-2 block">Sections to Include</Label>
          <div className="space-y-2">
            {SECTION_OPTIONS.map((opt) => {
              const checked = sections.includes(opt.id);
              return (
                <label
                  key={opt.id}
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    checked ? "border-blue-300 bg-blue-50" : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleSection(opt.id)}
                    className="mt-0.5 h-4 w-4 rounded accent-blue-600"
                  />
                  <div>
                    <p className={`text-sm font-medium ${checked ? "text-blue-700" : "text-gray-700"}`}>{opt.label}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{opt.desc}</p>
                  </div>
                </label>
              );
            })}
          </div>
        </div>

        <Button
          className="w-full bg-blue-600 hover:bg-blue-700 text-white"
          disabled={loading || sections.length === 0}
          onClick={downloadReport}
        >
          {loading
            ? <><RefreshCw className="w-4 h-4 animate-spin mr-2" />Generating…</>
            : <><Download className="w-4 h-4 mr-2" />Download CSV Report</>
          }
        </Button>
      </div>

      {/* Format reference */}
      <div className="bg-gray-50 rounded-xl border border-gray-200 p-5 space-y-3">
        <h4 className="text-sm font-semibold text-gray-700">Report Format</h4>
        <ul className="space-y-2 text-xs text-gray-500">
          <li className="flex gap-2">
            <span className="font-mono text-blue-600 flex-shrink-0">Partners</span>
            <span>Org name, contact, email, referral code, payout rate, conversion count & revenue for the date range, estimated payout</span>
          </li>
          <li className="flex gap-2">
            <span className="font-mono text-blue-600 flex-shrink-0">Conversions</span>
            <span>Date, partner, referral code, user ID, subscription tier, platform, gross/net revenue, estimated payout, status</span>
          </li>
          <li className="flex gap-2">
            <span className="font-mono text-blue-600 flex-shrink-0">Payouts</span>
            <span>Date paid, partner, quarter, amount, payment method, reference number, notes</span>
          </li>
        </ul>
        <p className="text-xs text-gray-400 pt-1">Sections appear sequentially in the CSV with headers between each. Open in Excel or Google Sheets.</p>
      </div>
    </div>
  );
}

// ── Tab config (7 tabs: 6 + Reports) ─────────────────────────────────────────
const TABS = [
  { id: "dashboard",    label: "Dashboard",    icon: LayoutDashboard },
  { id: "applications", label: "Applications", icon: FileText },
  { id: "partners",     label: "All Partners", icon: UserCheck },
  { id: "conversions",  label: "Conversions",  icon: ArrowRightLeft },
  { id: "payouts",      label: "Payouts",      icon: DollarSign },
  { id: "reports",      label: "Reports",      icon: Download },
  { id: "settings",     label: "Settings",     icon: Settings },
] as const;

type TabId = typeof TABS[number]["id"];

// ── Main portal ──────────────────────────────────────────────────────────────
export default function ReferralAdmin() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("dashboard");

  useEffect(() => {
    adminFetch("/api/admin/referrals/check-auth").then((res) => {
      if (res.ok) {
        setAuthed(true);
      } else {
        navigate("/admin/referrals/login");
      }
    }).catch(() => navigate("/admin/referrals/login"));
  }, []);

  async function logout() {
    await adminFetch("/api/admin/referrals/logout", { method: "POST" });
    qc.clear();
    toast({ title: "Logged out" });
    navigate("/admin/referrals/login");
  }

  if (authed === null) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
              <Users className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-gray-900">Referral Admin</span>
          </div>
          <Button variant="ghost" size="sm" onClick={logout} className="text-gray-500 hover:text-gray-800">
            <LogOut className="w-4 h-4 mr-1.5" />Logout
          </Button>
        </div>
        <div className="max-w-7xl mx-auto px-4 flex gap-0 overflow-x-auto">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                  activeTab === tab.id
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300"
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {activeTab === "dashboard"    && <DashboardTab />}
        {activeTab === "applications" && <ApplicationsTab />}
        {activeTab === "partners"     && <AllPartnersTab />}
        {activeTab === "conversions"  && <ConversionsTab />}
        {activeTab === "payouts"      && <PayoutsTab />}
        {activeTab === "reports"      && <ReportsTab />}
        {activeTab === "settings"     && <SettingsTab />}
      </main>
    </div>
  );
}
