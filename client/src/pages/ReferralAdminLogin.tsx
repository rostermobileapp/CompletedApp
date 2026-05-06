import { useState } from "react";
import { useLocation } from "wouter";
import { Settings, RefreshCw, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";

async function adminFetch(path: string, opts?: RequestInit) {
  return fetch(path, {
    ...opts,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(opts?.headers ?? {}) },
  });
}

export default function ReferralAdminLogin() {
  const [, navigate] = useLocation();
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setLoading(true);
    try {
      const res = await adminFetch("/api/admin/referrals/auth", {
        method: "POST",
        body: JSON.stringify({ password: pw }),
      });
      if (res.ok) {
        navigate("/admin/referrals");
      } else {
        const d = await res.json().catch(() => ({}));
        setErr(d.message || "Invalid password");
      }
    } catch {
      setErr("Network error — please try again");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-lg p-8 w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center mx-auto mb-3">
            <Settings className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">Admin Portal</h1>
          <p className="text-sm text-gray-500 mt-1">Referral Partner Management</p>
        </div>
        {err && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{err}</AlertDescription>
          </Alert>
        )}
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label htmlFor="pw" className="text-gray-700">Admin Password</Label>
            <Input
              id="pw"
              type="password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              placeholder="Enter password"
              className="mt-1"
              autoFocus
            />
          </div>
          <Button
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-700 text-white"
            disabled={loading || !pw}
          >
            {loading && <RefreshCw className="w-4 h-4 animate-spin mr-2" />}
            Sign In
          </Button>
        </form>
      </div>
    </div>
  );
}
