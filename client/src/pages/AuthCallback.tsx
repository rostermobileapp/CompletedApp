/**
 * AuthCallback.tsx
 * Handles the OAuth redirect callback for Google (and future providers).
 * Exchanges the authorization code for a Supabase session, then routes
 * the user to the app on success or back to login on failure.
 *
 * Provider: Google OAuth (via Supabase)
 */

import { useEffect, useRef } from 'react';
import { useLocation } from 'wouter';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';

export default function AuthCallback() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const hasRun = useRef(false);

  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;

    async function handleCallback() {
      try {
        const { data, error } = await supabase.auth.exchangeCodeForSession(
          window.location.href
        );

        if (error) throw error;

        if (data.session) {
          setLocation('/app');
        } else {
          throw new Error('No session returned after OAuth exchange');
        }
      } catch (error: any) {
        console.error('[AuthCallback] OAuth exchange failed:', error);
        toast({
          variant: 'destructive',
          title: 'Sign-in failed',
          description: error.message || 'Could not complete sign-in. Please try again.',
        });
        setLocation('/login');
      }
    }

    handleCallback();
  }, []);

  return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 border-4 border-gray-200 border-t-primary rounded-full animate-spin" />
        <p className="text-gray-500 text-sm">Completing sign-in…</p>
      </div>
    </div>
  );
}
