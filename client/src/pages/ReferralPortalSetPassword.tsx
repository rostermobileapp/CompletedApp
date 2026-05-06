import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { Lock, Eye, EyeOff, Loader2, CheckCircle } from 'lucide-react';
import rosterLightLogo from '@assets/Light_Mode_Logo_1768322748282.png';

export default function ReferralPortalSetPassword() {
  const [, setLocation] = useLocation();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  // Verify the user has an active session; redirect to login if not
  useEffect(() => {
    fetch('/api/referral/portal/me', { credentials: 'include' }).then(res => {
      if (!res.ok) setLocation('/referral-program/portal/login');
    });
  }, [setLocation]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      setErrorMsg('Password must be at least 8 characters.');
      setStatus('error');
      return;
    }
    if (password !== confirm) {
      setErrorMsg('Passwords do not match.');
      setStatus('error');
      return;
    }
    setStatus('loading');
    setErrorMsg('');
    try {
      const res = await fetch('/api/referral/portal/set-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.message || 'Something went wrong.');
        setStatus('error');
      } else {
        setStatus('done');
        setTimeout(() => setLocation('/referral-program/portal'), 1800);
      }
    } catch {
      setErrorMsg('Network error. Please try again.');
      setStatus('error');
    }
  }

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <img src={rosterLightLogo} alt="Roster" className="h-10 object-contain mx-auto mb-6" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Create Your Password</h1>
          <p className="text-gray-500 text-sm">Set a password so you can log in to your partner portal anytime.</p>
        </div>

        {status === 'done' ? (
          <div className="bg-green-50 border border-green-200 rounded-2xl p-8 text-center">
            <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
            <h2 className="text-lg font-bold text-gray-900 mb-2">Password created!</h2>
            <p className="text-gray-600 text-sm">Taking you to your portal…</p>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-2xl p-8 shadow-sm">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="password" className="block text-sm font-semibold text-gray-700 mb-1">
                  New Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    id="password"
                    type={showPw ? 'text' : 'password'}
                    value={password}
                    onChange={e => { setPassword(e.target.value); setStatus('idle'); }}
                    placeholder="At least 8 characters"
                    required
                    className="w-full pl-10 pr-10 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#3c82f4]/30 focus:border-[#3c82f4] transition-colors"
                  />
                  <button type="button" onClick={() => setShowPw(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label htmlFor="confirm" className="block text-sm font-semibold text-gray-700 mb-1">
                  Confirm Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    id="confirm"
                    type={showConfirm ? 'text' : 'password'}
                    value={confirm}
                    onChange={e => { setConfirm(e.target.value); setStatus('idle'); }}
                    placeholder="Re-enter your password"
                    required
                    className="w-full pl-10 pr-10 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#3c82f4]/30 focus:border-[#3c82f4] transition-colors"
                  />
                  <button type="button" onClick={() => setShowConfirm(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {status === 'error' && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
                  {errorMsg}
                </div>
              )}

              <button
                type="submit"
                disabled={status === 'loading' || !password || !confirm}
                className="w-full py-3 rounded-xl bg-[#3c82f4] text-white font-semibold text-sm hover:bg-[#3c82f4]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {status === 'loading' ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
                ) : (
                  'Create Password & Enter Portal'
                )}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
