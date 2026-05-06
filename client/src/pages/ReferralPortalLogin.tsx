import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { Mail, ArrowLeft, Loader2, Lock, Eye, EyeOff } from 'lucide-react';
import rosterLightLogo from '@assets/Light_Mode_Logo_1768322748282.png';

export default function ReferralPortalLogin() {
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setStatus('loading');
    setErrorMsg('');
    try {
      const res = await fetch('/api/referral/portal/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: email.toLowerCase().trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.message || 'Invalid email or password.');
        setStatus('error');
      } else {
        setLocation('/referral-program/portal');
      }
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
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Partner Portal Sign In</h1>
          <p className="text-gray-500 text-sm">Sign in with your email and password.</p>
        </div>

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
                  onChange={e => { setEmail(e.target.value); setStatus('idle'); }}
                  placeholder="you@yourorg.com"
                  required
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#3c82f4]/30 focus:border-[#3c82f4] transition-colors"
                />
              </div>
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-semibold text-gray-700 mb-1">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  id="password"
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={e => { setPassword(e.target.value); setStatus('idle'); }}
                  placeholder="Your password"
                  required
                  className="w-full pl-10 pr-10 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#3c82f4]/30 focus:border-[#3c82f4] transition-colors"
                />
                <button type="button" onClick={() => setShowPw(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {status === 'error' && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{errorMsg}</div>
            )}

            <button
              type="submit"
              disabled={status === 'loading' || !email.trim() || !password}
              className="w-full py-3 rounded-xl bg-[#3c82f4] text-white font-semibold text-sm hover:bg-[#3c82f4]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {status === 'loading' ? <><Loader2 className="w-4 h-4 animate-spin" /> Signing in…</> : 'Sign In'}
            </button>
          </form>

          <div className="mt-4 text-center">
            <Link href="/referral-program/portal/forgot-password" className="text-sm text-[#3c82f4] hover:underline">
              Forgot your password?
            </Link>
          </div>
        </div>

        <div className="mt-6 text-center space-y-2">
          <Link href="/referral-program" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Partner Program
          </Link>
          <p className="text-xs text-gray-400 block">
            Not a partner yet?{' '}
            <Link href="/referral-program#apply" className="text-[#3c82f4] hover:underline">Apply now</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
