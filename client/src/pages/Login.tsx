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
import { loginDestination } from '@/lib/appRouteEntry';
import { isTransientAuthError, retryTransientSignIn } from '@/lib/authSessionController';
import { signupAttributionMetadata, bindSignupAttributionUser } from '@/lib/signupAttributionBrowser';
import { isDevParentClient } from "@/lib/parentVerificationSession";
import { AgeConfirmationScreen } from "@/components/high-school-onboarding/AgeConfirmationScreen";
import { signupAgeRestriction } from "@/lib/signupAgeRestriction";
import { signUpWithEmailVerification } from "@/lib/signupEmailVerification";

const rosterLogo = '/roster-logo-transparent.png';

export default function Login() {
  return <LoginScreen/>;
}

/** Reuses the real form and age screen without calling authentication in the DEV demo. */
export function SignupFlowPreview({onComplete}:{onComplete:(adult:boolean)=>void}) {
  return <LoginScreen onPreviewSignup={onComplete}/>;
}

function LoginScreen({onPreviewSignup}:{onPreviewSignup?:(adult:boolean)=>void}={}) {
  const [showForm, setShowForm] = useState(!!onPreviewSignup || (isDevParentClient && new URLSearchParams(window.location.search).get("signup")==="1"));
  const [isSignUp, setIsSignUp] = useState(!!onPreviewSignup || (isDevParentClient && new URLSearchParams(window.location.search).get("signup")==="1"));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showVerification, setShowVerification] = useState(false);
  const [pendingEmail, setPendingEmail] = useState('');
  const [emailTaken, setEmailTaken] = useState(false);
  const [showAge, setShowAge] = useState(!!onPreviewSignup || (isDevParentClient && new URLSearchParams(window.location.search).get("signup")==="1"));
  const [ageAnswer, setAgeAnswer] = useState<boolean | null>(null);
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const currentUrl = () => `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const finishLogin = (startedAt = currentUrl()) => {
    // A notification arriving during the auth request wins over this callback.
    if (currentUrl() !== startedAt) return;
    setLocation(loginDestination(window.location.pathname, window.location.search, window.location.hash), { replace: true });
  };
  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if(onPreviewSignup&&!isSignUp){
      toast({title:"Preview only",description:"Sign-in is not connected in this demo. Switch to Sign up to review the new screens."});
      return;
    }
    if (isDevParentClient && isSignUp && ageAnswer !== true) {
      setAgeAnswer(null);
      setShowAge(true);
      return;
    }
    if(onPreviewSignup){onPreviewSignup(true);return;}
    const startedAt = currentUrl();
    setLoading(true);

    try {
      if (isSignUp) {
        const attribution = await signupAttributionMetadata();
        const signupEmail = email.trim();
        const user = await signUpWithEmailVerification({
          email: signupEmail,
          password,
          options: {
            emailRedirectTo: undefined,
            data: { ...attribution, ...(isDevParentClient ? { signup_age_answer: "adult" } : {}) },
          }
        });
        
        try {
          bindSignupAttributionUser(user.id);
        } catch {
          // Signup metadata already holds the context even without local storage.
          toast({ variant: 'destructive', title: 'Account created', description: 'Local referral storage is unavailable. Your signup context is saved to your account.' });
        }
        setShowAge(false);
        setPassword('');
        setPendingEmail(signupEmail);
        setShowVerification(true);
      } else {
        const { error } = await retryTransientSignIn(() => supabase.auth.signInWithPassword({
          email,
          password,
        }));
        
        if (error) throw error;
        
        if (isDevParentClient) signupAgeRestriction.allowAdult();
        toast({
          title: 'Welcome back!',
          description: 'You have successfully signed in.',
        });
        finishLogin(startedAt);
      }
    } catch (error: unknown) {
      if (!isSignUp && (error as { code?: string })?.code === 'email_not_confirmed') {
        setPendingEmail(email.trim());
        setPassword('');
        setShowVerification(true);
        return;
      }
      if (isSignUp && error instanceof Error && error.message.includes('already exists')) {
        setShowAge(false);
        setEmailTaken(true);
        return;
      }
      toast({
        variant: 'destructive',
        title: 'Error',
        description: isTransientAuthError(error)
          ? 'The sign-in service could not be reached. Please try again; your account has not been changed.'
          : error instanceof Error ? error.message : 'An error occurred',
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
    finishLogin();
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      handleClose();
    }
  };

  if (isDevParentClient && showAge) return <AgeConfirmationScreen
    value={ageAnswer} onChange={setAgeAnswer} busy={loading}
    onBack={() => { if (!loading) { setShowAge(false); setAgeAnswer(null); setShowForm(false); setIsSignUp(false); } }}
    onContinue={() => {
      if (loading || ageAnswer === null) return;
      if (ageAnswer === false) {
        if(onPreviewSignup){setEmail("");setPassword("");onPreviewSignup(false);return;}
        signupAgeRestriction.requireParent();
        setEmail(""); setPassword(""); setShowAge(false);
        setLocation("/under-18");
      } else {
        if(!onPreviewSignup)signupAgeRestriction.allowAdult();
        setShowAge(false);setShowForm(true);setIsSignUp(true);
      }
    }}
  />;

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
            alt="RosterHockey logo"
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
                animate={{ opacity: 1, scale: 1, top: '2%' }}
                exit={{ opacity: 0, scale: 0.95, top: '33%' }}
                transition={{
                  duration: 0.8,
                  ease: [0.4, 0, 0.2, 1],
                }}
              >
                <div className="text-center mb-2">
                  <img
                    src={rosterLogo}
                    alt="RosterHockey logo"
                    className="w-3/4 h-auto mx-auto"
                    data-testid="modal-logo"
                  />
                </div>

                {isDevParentClient && isSignUp && (
                  <div className="mb-4 text-center">
                    <h1 className="text-2xl font-bold leading-tight text-slate-900">Create your account</h1>
                    <p id="signup-purpose" className="mt-2 text-sm leading-relaxed text-slate-500">
                      Enter your email and choose a password to set up your account.
                    </p>
                  </div>
                )}

                <form onSubmit={handleSubmit} className="onboarding-light space-y-2"
                  aria-describedby={isDevParentClient && isSignUp ? "signup-purpose" : undefined}>
                  <div className="space-y-0.5">
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
                  
                  <div className="space-y-0.5">
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
                        className="hover:underline text-xs min-h-[32px] px-1 text-black"
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

                  <div className="text-center">
                    <button
                      type="button"
                      onClick={() => {
                        if(!isSignUp&&isDevParentClient){setAgeAnswer(null);setShowAge(true);}
                        setIsSignUp(!isSignUp);
                      }}
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
                  {isDevParentClient && isSignUp && (
                    <button
                      type="button"
                      onClick={() => { setEmail(""); setPassword(""); if(onPreviewSignup)onPreviewSignup(false);else setLocation("/under-18"); }}
                      className="block w-full min-h-11 px-2 text-center text-sm text-[#2563EB] underline-offset-4 hover:underline"
                    >
                      Under 18? A parent sets up your account.
                    </button>
                  )}
                </form>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
      <EmailVerificationModal
        open={showVerification}
        required
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
