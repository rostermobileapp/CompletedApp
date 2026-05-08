/**
 * Login.tsx
 * Combined sign-in / sign-up screen.
 * Providers handled: email/password (unchanged), Google OAuth, Apple Sign-In (iOS native only).
 *
 * Apple Sign-In security note: BuildNatively's Apple SDK does not return a verifiable
 * Apple identity token, so the /api/auth/apple-bridge endpoint trusts client-supplied
 * identity data. Rate limiting is applied server-side. This is a known limitation;
 * migrating to Apple's native iOS SDK (which returns a real ID token) is future work.
 */

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useLocation } from 'wouter';
import { X, Eye, EyeOff } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import rosterModalLogo from '@assets/Dark_Mode_Logo_1768422401788.png';
import { EmailVerificationModal } from '@/components/EmailVerificationModal';
import { useIosPlatform } from '@/hooks/useIosPlatform';

const rosterLogo = '/roster-logo-transparent.png';

const OAUTH_REDIRECT = 'https://www.roster-app.com/auth/callback';

export default function Login() {
  const [showForm, setShowForm] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState<'google' | 'apple' | null>(null);
  const [showVerification, setShowVerification] = useState(false);
  const [pendingEmail, setPendingEmail] = useState('');
  const [emailTaken, setEmailTaken] = useState(false);
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { isIos } = useIosPlatform();
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isSignUp) {
        console.log('[Signup] Attempting signup for:', email);
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: undefined,
          }
        });
        
        console.log('[Signup] Response:', { 
          hasUser: !!data.user, 
          hasSession: !!data.session,
          userId: data.user?.id,
          sessionAccessToken: data.session?.access_token ? 'present' : 'missing',
          error: error?.message 
        });
        
        if (error) throw error;

        if (data.user && data.user.identities && data.user.identities.length === 0) {
          setEmailTaken(true);
          return;
        }

        if (data.user && !data.session) {
          console.log('[Signup] User created but no session - showing verification modal for:', email);
          console.log('[Signup] Setting showVerification to true');
          setPendingEmail(email);
          setShowVerification(true);
          console.log('[Signup] Verification modal should now be visible');
        } else if (data.session) {
          console.log('[Signup] Session established, redirecting to home');
          toast({
            title: 'Welcome!',
            description: 'Your account has been created.',
          });
          setLocation('/app');
        } else {
          console.log('[Signup] No user or session returned');
          toast({
            title: 'Success!',
            description: 'Your account has been created. You can now sign in.',
          });
          setIsSignUp(false);
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        
        if (error) throw error;
        
        toast({
          title: 'Welcome back!',
          description: 'You have successfully signed in.',
        });
        setLocation('/app');
      }
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'An error occurred',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setShowForm(false);
    setEmail('');
    setPassword('');
    setIsSignUp(false);
  };

  const handleVerificationSuccess = () => {
    setShowVerification(false);
    setPendingEmail('');
    setEmail('');
    setPassword('');
    toast({
      title: 'Welcome!',
      description: 'Your account is now active. You are signed in.',
    });
    setLocation('/app');
  };

  const handleGoogleSignIn = async () => {
    setSocialLoading('google');
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: OAUTH_REDIRECT },
      });
      if (error) throw error;
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Google sign-in failed',
        description: error.message || 'An error occurred',
      });
      setSocialLoading(null);
    }
  };

  const handleAppleSignIn = async () => {
    setSocialLoading('apple');
    try {
      const appleService = new window.NativelyAppleSignInService();
      appleService.signin(async (resp) => {
        if (!resp.status) {
          toast({
            variant: 'destructive',
            title: 'Apple sign-in failed',
            description: resp.message || 'Apple sign-in was cancelled or failed.',
          });
          setSocialLoading(null);
          return;
        }

        try {
          const res = await fetch('/api/auth/apple-bridge', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: resp.email,
              subject: resp.subject,
              givenname: resp.givenname,
              familyname: resp.familyname,
            }),
          });

          if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(body.message || 'Apple bridge request failed');
          }

          const { access_token, refresh_token } = await res.json();
          const { error: sessionError } = await supabase.auth.setSession({
            access_token,
            refresh_token,
          });
          if (sessionError) throw sessionError;

          setLocation('/app');
        } catch (bridgeError: any) {
          toast({
            variant: 'destructive',
            title: 'Apple sign-in failed',
            description: bridgeError.message || 'An error occurred',
          });
          setSocialLoading(null);
        }
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Apple sign-in failed',
        description: error.message || 'An error occurred',
      });
      setSocialLoading(null);
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      handleClose();
    }
  };

  return (
    <div className="min-h-screen bg-white flex flex-col overflow-hidden" data-testid="login-page">
      <motion.div
        className="absolute top-4 left-4 z-50"
        initial={{ opacity: 0 }}
        animate={{ opacity: showForm ? 1 : 0 }}
        transition={{ duration: 0.6 }}
      >
        <button
          onClick={handleClose}
          className="flex items-center justify-center w-11 h-11 rounded-full text-white hover:bg-white/20 transition-colors bg-[#ffffff00]"
          data-testid="button-close"
          style={{ pointerEvents: showForm ? 'auto' : 'none' }}
        >
          <X className="w-5 h-5" />
        </button>
      </motion.div>
      <div className="flex-1 flex flex-col items-center justify-center px-6">
        <motion.div
          className="flex flex-col items-center"
          animate={{
            y: showForm ? '-25vh' : 0,
            scale: showForm ? 0.65 : 1,
          }}
          transition={{
            duration: 0.8,
            ease: [0.4, 0, 0.2, 1],
          }}
        >
          <img
            src={rosterLogo}
            alt="Roster"
            className="w-96 md:w-[512px] h-auto"
            data-testid="logo-image"
          />

          <p className="mt-3 text-gray-500 tracking-wide italic text-[20px] font-semibold">less admin, more hockey.</p>

          <AnimatePresence>
            {!showForm && (
              <motion.div
                className="mt-10"
                initial={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                transition={{ duration: 0.4 }}
              >
                <button
                  onClick={() => setShowForm(true)}
                  className="px-12 py-2 text-lg bg-primary text-primary-foreground rounded-xl font-bold hover:bg-primary/90 transition-colors"
                  data-testid="button-login-initial"
                >
                  Login
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        <AnimatePresence>
          {showForm && (
            <>
              <motion.div
                className="fixed inset-0 z-40 bg-white"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.6 }}
                onClick={handleBackdropClick}
              />

              <motion.div
                className="fixed left-0 right-0 mx-auto z-50 w-full max-w-[512px] px-6"
                initial={{ opacity: 0, scale: 0.95, top: '33%' }}
                animate={{ opacity: 1, scale: 1, top: '8%' }}
                exit={{ opacity: 0, scale: 0.95, top: '33%' }}
                transition={{
                  duration: 0.8,
                  ease: [0.4, 0, 0.2, 1],
                }}
              >
                <div className="text-center mb-6">
                  <img
                    src={rosterLogo}
                    alt="Roster"
                    className="w-full h-auto mx-auto"
                    data-testid="modal-logo"
                  />
                </div>

                <form onSubmit={handleSubmit} className="space-y-3">
                  <div className="space-y-1">
                    <Label htmlFor="email" className="text-black text-sm">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => { setEmail(e.target.value); setEmailTaken(false); }}
                      required
                      className="min-h-[44px] bg-white border-gray-300 text-black placeholder:text-gray-400"
                      data-testid="input-email"
                    />
                  </div>
                  
                  <div className="space-y-1">
                    <Label htmlFor="password" className="text-black text-sm">Password</Label>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        minLength={6}
                        className="min-h-[44px] bg-white border-gray-300 text-black placeholder:text-gray-400 pr-12"
                        data-testid="input-password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-black transition-colors p-1"
                        data-testid="button-toggle-password"
                      >
                        {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                  </div>

                  {!isSignUp && (
                    <div className="text-right">
                      <button
                        type="button"
                        onClick={() => setLocation('/forgot-password')}
                        className="hover:underline text-xs min-h-[36px] px-1 text-black"
                        data-testid="link-forgot-password"
                      >
                        Forgot password?
                      </button>
                    </div>
                  )}
                  
                  {emailTaken && (
                    <div className="rounded-xl bg-red-50 border border-red-300 px-4 py-3 text-sm">
                      <p className="text-red-600 font-medium mb-2">An account with this email already exists.</p>
                      <button
                        type="button"
                        onClick={() => { setEmailTaken(false); setIsSignUp(false); }}
                        className="text-black font-bold underline underline-offset-2 hover:text-red-600 transition-colors"
                      >
                        Go to Log In →
                      </button>
                    </div>
                  )}

                  <Button
                    type="submit"
                    className="w-full min-h-[48px] bg-primary text-primary-foreground font-semibold text-base rounded-xl hover:bg-primary/90"
                    disabled={loading}
                    data-testid="button-submit"
                  >
                    {loading ? 'Loading...' : isSignUp ? 'Sign Up' : 'Sign In'}
                  </Button>

                  <div className="flex items-center gap-3 py-1">
                    <div className="flex-1 h-px bg-gray-200" />
                    <span className="text-xs text-gray-400 font-medium">or</span>
                    <div className="flex-1 h-px bg-gray-200" />
                  </div>

                  <button
                    type="button"
                    onClick={handleGoogleSignIn}
                    disabled={socialLoading !== null}
                    className="w-full min-h-[48px] flex items-center justify-center gap-3 bg-white border border-gray-300 rounded-xl font-semibold text-sm text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-60"
                    data-testid="button-google"
                  >
                    {socialLoading === 'google' ? (
                      <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                    ) : (
                      <svg width="20" height="20" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M47.532 24.5528C47.532 22.9214 47.3997 21.2811 47.1175 19.6761H24.48V28.9181H37.4434C36.9055 31.8988 35.177 34.5356 32.6461 36.2111V42.2078H40.3801C44.9217 38.0278 47.532 31.8547 47.532 24.5528Z" fill="#4285F4"/>
                        <path d="M24.48 48.0016C30.9529 48.0016 36.4116 45.8764 40.3888 42.2078L32.6549 36.2111C30.5031 37.675 27.7252 38.5039 24.4888 38.5039C18.2275 38.5039 12.9187 34.2798 11.0139 28.6006H3.03296V34.7825C7.10718 42.8868 15.4056 48.0016 24.48 48.0016Z" fill="#34A853"/>
                        <path d="M11.0051 28.6006C9.99973 25.6199 9.99973 22.3922 11.0051 19.4115V13.2296H3.03298C-0.371021 20.0112 -0.371021 28.0009 3.03298 34.7825L11.0051 28.6006Z" fill="#FBBC04"/>
                        <path d="M24.48 9.49932C27.9016 9.44641 31.2086 10.7339 33.6866 13.0973L40.5387 6.24523C36.2 2.17101 30.4414 -0.068932 24.48 0.00161733C15.4055 0.00161733 7.10718 5.11644 3.03296 13.2296L11.005 19.4115C12.901 13.7235 18.2187 9.49932 24.48 9.49932Z" fill="#EA4335"/>
                      </svg>
                    )}
                    Continue with Google
                  </button>

                  {isIos && (
                    <button
                      type="button"
                      onClick={handleAppleSignIn}
                      disabled={socialLoading !== null}
                      className="w-full min-h-[48px] flex items-center justify-center gap-3 bg-black rounded-xl font-semibold text-sm text-white hover:bg-gray-900 transition-colors disabled:opacity-60"
                      data-testid="button-apple"
                    >
                      {socialLoading === 'apple' ? (
                        <div className="w-5 h-5 border-2 border-gray-500 border-t-white rounded-full animate-spin" />
                      ) : (
                        <svg width="18" height="22" viewBox="0 0 18 22" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M14.9455 11.4637C14.9273 9.27616 16.7546 8.21775 16.8364 8.16934C15.8 6.64471 14.1818 6.43653 13.6091 6.41925C12.2182 6.27471 10.8727 7.23289 10.1636 7.23289C9.44 7.23289 8.33636 6.43289 7.16364 6.45744C5.63636 6.48198 4.21818 7.34016 3.43636 8.69289C1.83636 11.4432 3.01818 15.4923 4.54545 17.7195C5.31818 18.8105 6.21818 20.0341 7.41818 19.9914C8.58182 19.9441 9.02727 19.2287 10.4364 19.2287C11.8364 19.2287 12.2455 19.9914 13.4636 19.9623C14.7182 19.9432 15.4909 18.8614 16.2364 17.7623C17.1273 16.5023 17.4909 15.2696 17.5 15.2078C17.4727 15.1987 14.9636 14.2305 14.9455 11.4637Z" fill="white"/>
                          <path d="M12.7273 4.81835C13.3545 4.04744 13.7818 2.98744 13.6636 1.91016C12.7636 1.95198 11.6273 2.53471 10.9727 3.28744C10.3909 3.95562 9.87273 5.05198 10.0091 6.08198C11.0182 6.15562 12.0818 5.57471 12.7273 4.81835Z" fill="white"/>
                        </svg>
                      )}
                      Sign in with Apple
                    </button>
                  )}
                  
                  <div className="text-center">
                    <button
                      type="button"
                      onClick={() => setIsSignUp(!isSignUp)}
                      className="text-xs min-h-[36px] px-2 text-black"
                      data-testid="button-toggle-mode"
                    >
                      {isSignUp
                        ? 'Already have an account? '
                        : "Don't have an account? "}
                      <span className="text-black font-extrabold">
                        {isSignUp ? 'Sign in' : 'Sign up'}
                      </span>
                    </button>
                  </div>
                </form>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
      <EmailVerificationModal
        open={showVerification}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            setShowVerification(false);
            setPendingEmail('');
          }
        }}
        email={pendingEmail}
        onVerificationSuccess={handleVerificationSuccess}
      />
    </div>
  );
}
