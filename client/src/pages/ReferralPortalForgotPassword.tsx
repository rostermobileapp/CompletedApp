import { useState } from 'react';
import { Link } from 'wouter';
import { Mail, ArrowLeft, Loader2, CheckCircle } from 'lucide-react';
import rosterLightLogo from '@assets/Light_Mode_Logo_1768322748282.png';

export default function ReferralPortalForgotPassword() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'sent' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setStatus('loading');
    setErrorMsg('');
    try {
      const res = await fetch('/api/referral/portal/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.toLowerCase().trim() }),
      });
      // Always show "sent" to avoid leaking whether email exists
      setStatus('sent');
    } catch {
      setErrorMsg('Network error. Please check your connection and try again.');
      setStatus('error');
    }
  }

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/referral-program">
            <img src={rosterLightLogo} alt="Roster" className="h-10 object-contain mx-auto mb-6 cursor-pointer" />
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Reset Your Password</h1>
          <p className="text-gray-500 text-sm">Enter your email and we'll send you a link to set a new password.</p>
        </div>

        {status === 'sent' ? (
          <div className="bg-green-50 border border-green-200 rounded-2xl p-8 text-center">
            <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
            <h2 className="text-lg font-bold text-gray-900 mb-2">Check your inbox</h2>
            <p className="text-gray-600 text-sm mb-4">
              If <span className="font-semibold">{email}</span> is a registered partner email, you'll receive a password reset link shortly. The link expires in 1 hour.
            </p>
            <Link href="/referral-program/portal/login" className="text-sm text-[#3c82f4] hover:underline">
              Back to sign in
            </Link>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-2xl p-8 shadow-sm">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-semibold text-gray-700 mb-1">Email address</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@yourorg.com"
                    required
                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#3c82f4]/30 focus:border-[#3c82f4] transition-colors"
                  />
                </div>
              </div>
              {status === 'error' && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{errorMsg}</div>
              )}
              <button
                type="submit"
                disabled={status === 'loading' || !email.trim()}
                className="w-full py-3 rounded-xl bg-[#3c82f4] text-white font-semibold text-sm hover:bg-[#3c82f4]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {status === 'loading' ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</> : 'Send Reset Link'}
              </button>
            </form>
          </div>
        )}

        <div className="mt-6 text-center">
          <Link href="/referral-program/portal/login" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" /> Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
