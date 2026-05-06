import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { Mail, ArrowLeft, Loader2, CheckCircle, Lock, Eye, EyeOff } from 'lucide-react';
import rosterLightLogo from '@assets/Light_Mode_Logo_1768322748282.png';

type Mode = 'password' | 'magic-link';

export default function ReferralPortalLogin() {
  const [, setLocation] = useLocation();
  const [mode, setMode] = useState<Mode>('password');

  // Password login state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [pwStatus, setPwStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [pwError, setPwError] = useState('');

  // Magic link state
  const [mlEmail, setMlEmail] = useState('');
  const [mlStatus, setMlStatus] = useState<'idle' | 'loading' | 'sent' | 'error'>('idle');
  const [mlError, setMlError] = useState('');

  async function handlePasswordLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setPwStatus('loading');
    setPwError('');
    try {
      const res = await fetch('/api/referral/portal/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: email.toLowerCase().trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPwError(data.message || 'Invalid email or password.');
        setPwStatus('error');
      } else {
        setLocation('/referral-program/portal');
      }
    } catch {
      setPwError('Network error. Please check your connection and try again.');
      setPwStatus('error');
    }
  }

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    if (!mlEmail.trim()) return;
    setMlStatus('loading');
    setMlError('');
    try {
      const res = await fetch('/api/referral/portal/request-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: mlEmail.toLowerCase().trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMlError(data.message || 'Something went wrong. Please try again.');
        setMlStatus('error');
      } else {
        setMlStatus('sent');
      }
    } catch {
      setMlError('Network error. Please check your connection and try again.');
      setMlStatus('error');
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
          <p className="text-gray-500 text-sm">
            {mode === 'password'
              ? 'Sign in with your email and password.'
              : 'We\'ll send a one-time link to your registered email address.'}
          </p>
        </div>

        {/* Mode toggle */}
        <div className="flex rounded-xl border border-gray-200 overflow-hidden mb-6">
          <button
            onClick={() => setMode('password')}
            className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${mode === 'password' ? 'bg-[#3c82f4] text-white' : 'bg-white text-gray-500 hover:text-gray-800'}`}
          >
            Password
          </button>
          <button
            onClick={() => setMode('magic-link')}
            className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${mode === 'magic-link' ? 'bg-[#3c82f4] text-white' : 'bg-white text-gray-500 hover:text-gray-800'}`}
          >
            Magic Link
          </button>
        </div>

        {/* Password login */}
        {mode === 'password' && (
          <div className="bg-white border border-gray-200 rounded-2xl p-8 shadow-sm">
            <form onSubmit={handlePasswordLogin} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-semibold text-gray-700 mb-1">Email address</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={e => { setEmail(e.target.value); setPwStatus('idle'); }}
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
                    onChange={e => { setPassword(e.target.value); setPwStatus('idle'); }}
                    placeholder="Your password"
                    required
                    className="w-full pl-10 pr-10 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#3c82f4]/30 focus:border-[#3c82f4] transition-colors"
                  />
                  <button type="button" onClick={() => setShowPw(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              {pwStatus === 'error' && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{pwError}</div>
              )}
              <button
                type="submit"
                disabled={pwStatus === 'loading' || !email.trim() || !password}
                className="w-full py-3 rounded-xl bg-[#3c82f4] text-white font-semibold text-sm hover:bg-[#3c82f4]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {pwStatus === 'loading' ? <><Loader2 className="w-4 h-4 animate-spin" /> Signing in…</> : 'Sign In'}
              </button>
            </form>
            <p className="mt-4 text-center text-xs text-gray-400">
              Forgot your password?{' '}
              <button onClick={() => setMode('magic-link')} className="text-[#3c82f4] hover:underline">Send a magic link</button>
            </p>
          </div>
        )}

        {/* Magic link */}
        {mode === 'magic-link' && (
          mlStatus === 'sent' ? (
            <div className="bg-green-50 border border-green-200 rounded-2xl p-8 text-center">
              <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
              <h2 className="text-lg font-bold text-gray-900 mb-2">Check your inbox</h2>
              <p className="text-gray-600 text-sm mb-4">
                We sent a sign-in link to <span className="font-semibold">{mlEmail}</span>.
                The link expires in 1 hour.
              </p>
              <button onClick={() => { setMlStatus('idle'); setMlEmail(''); }} className="text-sm text-[#3c82f4] hover:underline">
                Use a different email
              </button>
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-2xl p-8 shadow-sm">
              <form onSubmit={handleMagicLink} className="space-y-4">
                <div>
                  <label htmlFor="ml-email" className="block text-sm font-semibold text-gray-700 mb-1">Email address</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      id="ml-email"
                      type="email"
                      value={mlEmail}
                      onChange={e => { setMlEmail(e.target.value); setMlStatus('idle'); }}
                      placeholder="you@yourorg.com"
                      required
                      className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#3c82f4]/30 focus:border-[#3c82f4] transition-colors"
                    />
                  </div>
                </div>
                {mlStatus === 'error' && (
                  <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{mlError}</div>
                )}
                <button
                  type="submit"
                  disabled={mlStatus === 'loading' || !mlEmail.trim()}
                  className="w-full py-3 rounded-xl bg-[#3c82f4] text-white font-semibold text-sm hover:bg-[#3c82f4]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {mlStatus === 'loading' ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</> : 'Send Login Link'}
                </button>
              </form>
            </div>
          )
        )}

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
