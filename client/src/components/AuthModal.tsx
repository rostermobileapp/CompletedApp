import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useLocation } from 'wouter';
import { AgeConfirmationScreen } from "@/components/high-school-onboarding/AgeConfirmationScreen";
import { isAgeFirstSignupEnabled, signupAgeRestriction } from "@/lib/signupAgeRestriction";
import { signUpWithEmailVerification } from "@/lib/signupEmailVerification";
import { EmailVerificationModal } from "@/components/EmailVerificationModal";
import "./onboarding-auth-light.css";

interface AuthModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AuthModal({ open, onOpenChange }: AuthModalProps) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [adultConfirmed,setAdultConfirmed]=useState<boolean|null>(null);
  const [showAge,setShowAge]=useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [pendingEmail, setPendingEmail] = useState('');
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if(isAgeFirstSignupEnabled&&isSignUp&&adultConfirmed!==true){
      setAdultConfirmed(null);setShowAge(true);return;
    }
    setLoading(true);

    try {
      if (isSignUp) {
        const signupEmail = email.trim();
        await signUpWithEmailVerification({
          email: signupEmail,
          password,
          ...(isAgeFirstSignupEnabled ? { options: { data: { signup_age_answer: "adult" } } } : {}),
        });

        setShowAge(false);
        setPassword('');
        setPendingEmail(signupEmail);
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
        if(isAgeFirstSignupEnabled)signupAgeRestriction.allowAdult();
        onOpenChange(false);
      }
    } catch (error: any) {
      if (!isSignUp && error?.code === 'email_not_confirmed') {
        setPendingEmail(email.trim());
        setPassword('');
        return;
      }
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'An error occurred',
      });
    } finally {
      setLoading(false);
    }
  };

  if (pendingEmail) return (
    <EmailVerificationModal open={open} required email={pendingEmail}
      onOpenChange={() => {}}
      onVerificationSuccess={() => {
        setPendingEmail('');
        setPassword('');
        setEmail('');
        setIsSignUp(false);
        onOpenChange(false);
      }}/>
  );

  if (isAgeFirstSignupEnabled && open && showAge) return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent overlayClassName="onboarding-auth-backdrop" className="onboarding-light inset-0 h-dvh w-full max-w-none translate-x-0 translate-y-0 rounded-none border-0 p-0 overflow-y-auto [&>button]:hidden"
        style={{inset:0,transform:"none",width:"100%",maxWidth:"none",height:"100dvh"}} disableAnimation>
        <DialogTitle className="sr-only">Age confirmation</DialogTitle>
        <DialogDescription className="sr-only">Choose your age group to continue signup.</DialogDescription>
        <AgeConfirmationScreen value={adultConfirmed} onChange={setAdultConfirmed} busy={loading}
          onBack={()=>{if(!loading){setShowAge(false);setAdultConfirmed(null);setIsSignUp(false);}}}
          onContinue={()=>{
            if(loading||adultConfirmed===null)return;
            if(adultConfirmed===false){
              signupAgeRestriction.requireParent();
              setEmail("");setPassword("");setShowAge(false);onOpenChange(false);setLocation("/under-18");
            }else{signupAgeRestriction.allowAdult();setShowAge(false);}
          }}/>
      </DialogContent>
    </Dialog>
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent overlayClassName="onboarding-auth-backdrop" className="onboarding-light sm:max-w-md top-4 translate-y-0" disableAnimation={isAgeFirstSignupEnabled}
        style={isAgeFirstSignupEnabled?{maxHeight:"calc(100dvh - 2rem)",overflowY:"auto"}:undefined} data-testid="modal-auth">
        <DialogHeader>
          <DialogTitle data-testid="text-auth-title">
            {isSignUp ? 'Create Account' : 'Sign In'}
          </DialogTitle>
          <DialogDescription data-testid="text-auth-description">
            {isSignUp
              ? 'Enter your email and password to create an account'
              : 'Enter your email and password to sign in'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              data-testid="input-email"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              data-testid="input-password"
            />
          </div>

          <Button
            type="submit"
            className="w-full"
            disabled={loading}
            data-testid="button-submit"
          >
            {loading ? 'Loading...' : isSignUp ? 'Sign Up' : 'Sign In'}
          </Button>

          {!isSignUp && (
            <div className="text-center text-sm">
              <button
                type="button"
                onClick={() => {
                  onOpenChange(false);
                  setLocation('/forgot-password');
                }}
                className="text-primary hover:underline"
                data-testid="link-forgot-password"
              >
                Forgot password?
              </button>
            </div>
          )}

          <div className="text-center text-sm">
            <button
              type="button"
              onClick={() => {
                if(!isSignUp&&isAgeFirstSignupEnabled){setEmail("");setPassword("");setAdultConfirmed(null);setShowAge(true);}
                setIsSignUp(!isSignUp);
              }}
              className="text-primary hover:underline"
              data-testid="button-toggle-mode"
            >
              {isSignUp
                ? 'Already have an account? Sign in'
                : "Don't have an account? Sign up"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
