import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { Loader2, XCircle } from 'lucide-react';
import { Link } from 'wouter';
import rosterLightLogo from '@assets/Light_Mode_Logo_1768322748282.png';

export default function ReferralPortalAuth() {
  const [, setLocation] = useLocation();
  const [status, setStatus] = useState<'validating' | 'error'>('validating');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');

    if (!token) {
      setErrorMsg('No login token provided. Please request a new sign-in link.');
      setStatus('error');
      return;
    }

    async function validate() {
      try {
        const res = await fetch(`/api/referral/portal/auth?token=${encodeURIComponent(token!)}`, {
          headers: { Accept: 'application/json' },
          credentials: 'include',
        });
        const data = await res.json();
        if (res.ok && data.success) {
          setLocation('/referral-program/portal');
        } else {
          setErrorMsg(data.message || 'This link has expired or is invalid. Please request a new one.');
          setStatus('error');
        }
      } catch {
        setErrorMsg('Network error. Please check your connection and try again.');
        setStatus('error');
      }
    }

    validate();
  }, [setLocation]);

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm text-center">
        <img src={rosterLightLogo} alt="Roster" className="h-10 object-contain mx-auto mb-8" />

        {status === 'validating' ? (
          <>
            <Loader2 className="w-10 h-10 text-[#3c82f4] animate-spin mx-auto mb-4" />
            <h2 className="text-lg font-bold text-gray-900 mb-2">Signing you in…</h2>
            <p className="text-sm text-gray-500">Validating your login link.</p>
          </>
        ) : (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-8">
            <XCircle className="w-10 h-10 text-red-500 mx-auto mb-4" />
            <h2 className="text-lg font-bold text-gray-900 mb-2">Link expired or invalid</h2>
            <p className="text-sm text-gray-600 mb-6">{errorMsg}</p>
            <Link
              href="/referral-program/portal/login"
              className="inline-block px-6 py-3 bg-[#3c82f4] text-white rounded-xl text-sm font-semibold hover:bg-[#3c82f4]/90 transition-colors"
            >
              Request a new link
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
